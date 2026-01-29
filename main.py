import pandas as pd
import os
import sys
import logging
import json
import base64
import io
import xmlrpc.client
import time
from datetime import datetime
from collections import defaultdict
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from PIL import Image
from github import Github, GithubException, Auth # Importamos Auth para corregir el warning

# --- CONFIGURACIÓN DE LOGS ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

# --- VARIABLES ---
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
REPO_NAME = os.environ.get("REPO_NAME") 

def cargar_gsheets():
    try:
        json_str = os.environ.get("GOOGLE_JSON")
        if not json_str: raise ValueError("Falta GOOGLE_JSON")
        creds_dict = json.loads(json_str)
        scope = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
        creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
        client = gspread.authorize(creds)
        sheet = client.open("categorias_maestras").sheet1 
        return pd.DataFrame(sheet.get_all_records())
    except Exception as e:
        logging.warning(f"Error Sheets (Usando default): {e}")
        return pd.DataFrame()

def clasificar(nombre, df_cat):
    if df_cat.empty or not isinstance(nombre, str): return ('Sin Cat', 'Sin Subcat', 'General')
    nombre = nombre.lower()
    for _, row in df_cat.iterrows():
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

# --- FUNCIÓN PARA DIVIDIR LISTAS EN LOTES ---
def chunker(seq, size):
    return (seq[pos:pos + size] for pos in range(0, len(seq), size))

def main():
    logging.info("Iniciando Sincronización Optimizada...")

    # 1. CONEXIÓN GITHUB (Corregido Warning)
    auth = Auth.Token(GITHUB_TOKEN)
    g = Github(auth=auth)
    repo = g.get_repo(REPO_NAME)
    
    # Listar imágenes existentes para no descargarlas de Odoo si no hace falta
    existing_files = set()
    try:
        contents = repo.get_contents("public/images")
        while contents:
            file_content = contents.pop(0)
            existing_files.add(file_content.name)
    except:
        pass 
    logging.info(f"Imágenes ya en GitHub: {len(existing_files)}")

    # 2. CONEXIÓN ODOO
    url, db, usr = 'https://aromotor.com', 'aromotor', 'pruebas'
    pwd = os.environ.get("ODOO_PWD")
    common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
    uid = common.authenticate(db, usr, pwd, {})
    models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

    # 3. OBTENER STOCK (Solo IDs y Cantidad)
    logging.info("Consultando Stock...")
    stock = models.execute_kw(db, uid, pwd, 'stock.quant', 'search_read',
        [[('location_id', 'in', [732, 700, 8]), ('quantity', '>', 0)]], {'fields': ['product_id', 'quantity']})
    
    stock_map = defaultdict(float)
    p_ids = set()
    for s in stock:
        pid = s['product_id'][0]
        stock_map[pid] += s['quantity']
        p_ids.add(pid)
    
    lista_ids = list(p_ids)
    logging.info(f"Productos con stock: {len(lista_ids)}")

    # 4. PASO CLAVE: Descargar SOLO DATOS LIGEROS primero (Sin imágenes)
    logging.info("Descargando metadatos (rápido)...")
    # Pedimos todo MENOS la imagen para que sea rápido y no se corte
    prods_light = models.execute_kw(db, uid, pwd, 'product.product', 'read', [lista_ids], 
        {'fields': ['default_code', 'name', 'x_fob_subtotal']})

    # Preparar diccionario para fácil acceso
    prods_dict = {p['id']: p for p in prods_light}

    # 5. IDENTIFICAR QUÉ IMÁGENES FALTAN
    ids_faltantes = []
    mapa_referencias = {} # ID -> Referencia limpia

    for p in prods_light:
        ref = str(p.get('default_code') or '').replace('/', '').replace('*', '').strip()
        if not ref: continue
        
        mapa_referencias[p['id']] = ref
        fname = f"{ref}.webp"
        
        # Si NO está en GitHub, añadimos el ID a la lista para descargar su foto
        if fname not in existing_files:
            ids_faltantes.append(p['id'])

    logging.info(f"Imágenes nuevas a descargar: {len(ids_faltantes)}")

    # 6. DESCARGAR IMÁGENES POR LOTES (Para evitar el error XML ExpatError)
    BATCH_SIZE = 10 # Descargar de 10 en 10
    
    for lote_ids in chunker(ids_faltantes, BATCH_SIZE):
        try:
            logging.info(f"Descargando lote de imágenes ({len(lote_ids)})...")
            # Solicitamos SOLO el campo imagen para estos 10 productos
            lote_imgs = models.execute_kw(db, uid, pwd, 'product.product', 'read', [lote_ids], {'fields': ['image_1920']})
            
            for item in lote_imgs:
                p_id = item['id']
                b64 = item.get('image_1920')
                ref = mapa_referencias.get(p_id)
                fname = f"{ref}.webp"

                if b64:
                    try:
                        img_data = base64.b64decode(b64)
                        img = Image.open(io.BytesIO(img_data))
                        if img.width > 1000: img.thumbnail((1000, 1000))
                        
                        buf = io.BytesIO()
                        img.save(buf, 'WEBP', quality=80)
                        
                        # Subir a GitHub inmediatamente
                        update_file_in_github(repo, f"public/images/{fname}", buf.getvalue(), f"Img {fname}")
                    except Exception as e:
                        logging.error(f"Error procesando imagen {fname}: {e}")
            
            # Pequeña pausa para no saturar Odoo
            time.sleep(1) 

        except Exception as e:
            logging.error(f"Error en lote de imágenes: {e}")

    # 7. GENERAR JSON FINAL
    df_cat = cargar_gsheets()
    data_list = []

    logging.info("Generando JSON final...")
    for pid in lista_ids:
        p = prods_dict.get(pid)
        if not p: continue

        ref = mapa_referencias.get(pid) # Ya la limpiamos antes
        if not ref: continue
        
        fname = f"{ref}.webp"

        # Clasificación
        c1, c2, c3 = clasificar(p.get('name'), df_cat)
        precio = p.get('x_fob_subtotal', 0)
        if "LED 0%" not in str(c1) and "LED 0%" not in str(c2):
            precio = precio * 1.15

        data_list.append({
            'Referencia': ref,
            'Nombre': p.get('name'),
            'Categoria': c1,
            'Subcategoria': c2,
            'Stock': stock_map[pid],
            'Precio': round(precio, 2),
            'Imagen': f"/images/{fname}"
        })

    # Subir JSON
    df_final = pd.DataFrame(data_list)
    json_str = df_final.to_json(orient='records', force_ascii=False, indent=4)
    update_file_in_github(repo, "public/catalogo.json", json_str, f"Update {datetime.now()}")
    
    logging.info("¡Sincronización Completada con Éxito!")

if __name__ == "__main__":
    main()