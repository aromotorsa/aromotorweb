import pandas as pd
import os
import sys
import logging
import json
import base64
import io
import time
import gc
import xmlrpc.client
from datetime import datetime
from collections import defaultdict
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from PIL import Image
from github import Github, GithubException, Auth

# --- CONFIGURACIÓN DE LOGS ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

# --- VARIABLES DE ENTORNO ---
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
REPO_NAME = os.environ.get("REPO_NAME") 

def chunker(seq, size):
    return (seq[pos:pos + size] for pos in range(0, len(seq), size))

def cargar_gsheets():
    try:
        json_str = os.environ.get("GOOGLE_JSON")
        if not json_str: return pd.DataFrame()
        creds_dict = json.loads(json_str)
        scope = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
        creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
        client = gspread.authorize(creds)
        
        # Intenta abrir la hoja correcta como en el script 2
        spreadsheet = client.open("categorias_maestras")
        try:
            sheet = spreadsheet.worksheet("INVENTARIO")
        except gspread.WorksheetNotFound:
            sheet = spreadsheet.sheet1
            
        df = pd.DataFrame(sheet.get_all_records())
        
        # --- FIX LÓGICO: ORDENAR POR LONGITUD DE DETALLE ---
        # Esto es vital para que "Cinta LED" se detecte antes que "Cinta"
        if 'DETALLE' in df.columns:
            df['DETALLE_len'] = df['DETALLE'].astype(str).str.len()
            df.sort_values(by='DETALLE_len', ascending=False, inplace=True)
            
        return df
    except Exception as e:
        logging.error(f"Error cargando GSheets: {e}")
        return pd.DataFrame()

def clasificar(nombre, df_cat):
    if df_cat.empty or not isinstance(nombre, str): return ('Sin Cat', 'Sin Subcat', 'General')
    nombre = nombre.lower()
    for _, row in df_cat.iterrows():
        # Al estar ordenado por longitud, coincidirá primero con la frase más específica
        if str(row.get('DETALLE', '')).lower() in nombre:
            return (row.get('Categoría Nivel 1'), row.get('Categoría Nivel 2'), row.get('Categoría Nivel 3'))
    return ('Sin Cat', 'Sin Subcat', 'General')

def update_file_in_github(repo, path, content, message):
    try:
        try:
            contents = repo.get_contents(path)
            repo.update_file(contents.path, message, content, contents.sha)
            logging.info(f"Actualizado: {path}")
        except GithubException as e:
            if e.status == 404:
                repo.create_file(path, message, content)
                logging.info(f"Creado: {path}")
            else:
                raise e
    except Exception as e:
        logging.error(f"Error GitHub {path}: {e}")

def main():
    logging.info("=== SINCRONIZACIÓN INTELIGENTE (LOGIC UPDATED) ===")

    if not GITHUB_TOKEN or not REPO_NAME:
        logging.error("Faltan credenciales.")
        return

    auth = Auth.Token(GITHUB_TOKEN)
    g = Github(auth=auth)
    repo = g.get_repo(REPO_NAME)
    
    # --- ESCANEO DE IMÁGENES EXISTENTES ---
    existing_files = set()
    try:
        logging.info("Escaneando repositorio completo (Git Tree)...")
        branch = repo.default_branch
        sha = repo.get_branch(branch).commit.sha
        tree = repo.get_git_tree(sha, recursive=True).tree
        
        for element in tree:
            if element.path.startswith("public/images/"):
                fname = element.path.split("/")[-1]
                existing_files.add(fname)
                
    except Exception as e:
        logging.error(f"Error leyendo árbol git: {e}")

    logging.info(f"Total imágenes detectadas en GitHub: {len(existing_files)}")

    # --- ODOO CONEXIÓN ---
    url_odoo, db, usr = 'https://aromotor.com', 'aromotor', 'pruebas'
    pwd = os.environ.get("ODOO_PWD")
    common = xmlrpc.client.ServerProxy(f'{url_odoo}/xmlrpc/2/common')
    uid = common.authenticate(db, usr, pwd, {})
    models = xmlrpc.client.ServerProxy(f'{url_odoo}/xmlrpc/2/object')

    # --- FILTRADO DE CATEGORÍAS (LÓGICA SCRIPT 2) ---
    logging.info("Filtrando productos por categorías maestras...")
    NOMBRES_CATEGORIAS = ["LUCES GRAVADAS", "LUCES LED 0%", "TECNOLOGIA"]
    
    # 1. Buscar IDs de las categorías padre
    cat_ids = models.execute_kw(db, uid, pwd, 'product.category', 'search', 
        [[('name', 'in', NOMBRES_CATEGORIAS)]])
    
    # 2. Buscar TODOS los productos dentro de esas categorías (child_of)
    product_ids_filtered = models.execute_kw(db, uid, pwd, 'product.product', 'search', 
        [[('categ_id', 'child_of', cat_ids)]])
    
    if not product_ids_filtered:
        logging.warning("No se encontraron productos en las categorías indicadas.")
        return

    # --- STOCK (Solo de los productos filtrados) ---
    logging.info("Consultando stock...")
    stock_data = models.execute_kw(db, uid, pwd, 'stock.quant', 'search_read',
        [[
            ('location_id', 'in', [732, 700, 8]), 
            ('quantity', '>', 0),
            ('product_id', 'in', product_ids_filtered) # Filtro aplicado aquí
        ]], 
        {'fields': ['product_id', 'quantity']})
    
    stock_map = defaultdict(float)
    p_ids_set = set()
    for s in stock_data:
        pid = s['product_id'][0]
        stock_map[pid] += s['quantity']
        p_ids_set.add(pid)
    
    lista_ids = list(p_ids_set)
    logging.info(f"Productos filtrados con stock > 0: {len(lista_ids)}")

    # --- METADATOS ---
    # Agregamos 'categ_id' para obtener el nombre de la categoría de Odoo
    prods_light = models.execute_kw(db, uid, pwd, 'product.product', 'read', 
        [lista_ids], {'fields': ['default_code', 'name', 'x_fob_subtotal', 'categ_id']})
    prods_dict = {p['id']: p for p in prods_light}

    # --- GESTIÓN DE IMÁGENES ---
    ids_faltantes = []
    mapa_referencias = {}

    for p in prods_light:
        ref_raw = p.get('default_code')
        if not ref_raw: continue
        # Limpieza idéntica al script 2
        ref = str(ref_raw).replace('/', '').replace('*', '').strip()
        mapa_referencias[p['id']] = ref
        fname = f"{ref}.webp"
        
        if fname not in existing_files:
            ids_faltantes.append(p['id'])

    logging.info(f"Faltan descargar realmente: {len(ids_faltantes)}")

    # DESCARGA DE IMÁGENES
    BATCH_SIZE = 5 
    if ids_faltantes:
        for lote_ids in chunker(ids_faltantes, BATCH_SIZE):
            try:
                lote_data = models.execute_kw(db, uid, pwd, 'product.product', 'read', 
                    [lote_ids], {'fields': ['image_1920']})
                
                for item in lote_data:
                    p_id = item['id']
                    b64 = item.get('image_1920')
                    ref = mapa_referencias.get(p_id)
                    
                    if b64 and ref:
                        fname = f"{ref}.webp"
                        try:
                            img_bytes = base64.b64decode(b64)
                            img = Image.open(io.BytesIO(img_bytes))
                            if img.width > 1024 or img.height > 1024: img.thumbnail((1024, 1024))
                            
                            buffer = io.BytesIO()
                            img.save(buffer, 'WEBP', quality=85)
                            
                            update_file_in_github(repo, f"public/images/{fname}", buffer.getvalue(), f"Add {fname}")
                            del img_bytes, img, buffer
                        except Exception as e:
                            logging.error(f"Error img {fname}: {e}")
                
                gc.collect()
                time.sleep(0.5)
            except Exception as e:
                logging.error(f"Error lote: {e}")
    else:
        logging.info("¡Todo sincronizado! No se requieren descargas.")

    # --- GENERACIÓN DE JSON FINAL ---
    logging.info("Clasificando y generando JSON...")
    df_cat = cargar_gsheets() # Ya viene ordenada por longitud
    data_list = []

    for pid in lista_ids:
        p = prods_dict.get(pid)
        if not p: continue
        ref = mapa_referencias.get(pid)
        if not ref: continue
        
        # Clasificación (ahora usa la lógica de prioridad por longitud)
        c1, c2, c3 = clasificar(p.get('name'), df_cat)
        
        # Precio Base
        precio_base = p.get('x_fob_subtotal', 0)
        
        # Cálculo de Precio (Lógica Script 2)
        # Si NO es LED 0% en categoría ni subcategoría, suma 15%
        if "LED 0%" not in str(c1) and "LED 0%" not in str(c2):
            precio_final = precio_base * 1.15
        else:
            precio_final = precio_base

        # Nombre de la categoría de Odoo
        cat_odoo_name = p.get('categ_id')[1] if p.get('categ_id') else 'N/A'

        # Estructura JSON idéntica al Script 2 (+ Imagen para compatibilidad web)
        data_list.append({
            'Referencia Interna': ref,
            'Nombre': p.get('name'),
            'Categoría': c1,          # Con tilde
            'Subcategoría': c2,       # Con tilde
            'Tipo': c3,               # Nuevo campo (Nivel 3)
            'Marca': 'N/A',           # Nuevo campo default
            'Categoria de producto': cat_odoo_name, # Nuevo campo Odoo
            'Stock': stock_map[pid],
            'Precio': round(precio_final, 2),
            'Imagen': f"/images/{ref}.webp" # Mantenemos este campo para la web
        })

    df = pd.DataFrame(data_list)
    
    # Ordenar columnas para limpieza visual (opcional)
    cols = ['Referencia Interna', 'Nombre', 'Categoría', 'Subcategoría', 'Tipo', 'Marca', 'Categoria de producto', 'Stock', 'Precio', 'Imagen']
    df = df[cols]

    json_str = df.to_json(orient='records', force_ascii=False, indent=4)
    
    # Actualizar archivos
    update_file_in_github(repo, "/Resultado_Final.json", json_str, f"Update Catalog {datetime.now()}")
    update_file_in_github(repo, "dist/Resultado_Final.json", json_str, f"Update Catalog {datetime.now()}")
    update_file_in_github(repo, "public/Resultado_Final.json", json_str, f"Update Catalog {datetime.now()}")

    logging.info("=== FIN ===")

if __name__ == "__main__":
    main()
