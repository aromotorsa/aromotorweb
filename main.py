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
        sheet = client.open("categorias_maestras").sheet1 
        return pd.DataFrame(sheet.get_all_records())
    except Exception:
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

def main():
    logging.info("=== SINCRONIZACIÓN INTELIGENTE (LARGE REPO) ===")

    if not GITHUB_TOKEN or not REPO_NAME:
        logging.error("Faltan credenciales.")
        return

    auth = Auth.Token(GITHUB_TOKEN)
    g = Github(auth=auth)
    repo = g.get_repo(REPO_NAME)
    
    # --- FIX CRÍTICO: USAR GIT TREE PARA VER MÁS DE 1000 ARCHIVOS ---
    existing_files = set()
    try:
        logging.info("Escaneando repositorio completo (Git Tree)...")
        # Obtenemos la rama por defecto (main/master)
        branch = repo.default_branch
        sha = repo.get_branch(branch).commit.sha
        
        # recursive=True permite ver carpetas anidadas y supera el límite de 1000
        tree = repo.get_git_tree(sha, recursive=True).tree
        
        for element in tree:
            # Buscamos solo archivos dentro de public/images/
            if element.path.startswith("public/images/"):
                # Obtenemos solo el nombre del archivo (ej: foto.webp)
                fname = element.path.split("/")[-1]
                existing_files.add(fname)
                
    except Exception as e:
        logging.error(f"Error leyendo árbol git: {e}")

    logging.info(f"Total imágenes detectadas en GitHub: {len(existing_files)}")
    # ----------------------------------------------------------------

    # ODOO
    url_odoo, db, usr = 'https://aromotor.com', 'aromotor', 'pruebas'
    pwd = os.environ.get("ODOO_PWD")
    common = xmlrpc.client.ServerProxy(f'{url_odoo}/xmlrpc/2/common')
    uid = common.authenticate(db, usr, pwd, {})
    models = xmlrpc.client.ServerProxy(f'{url_odoo}/xmlrpc/2/object')

    # STOCK
    stock_data = models.execute_kw(db, uid, pwd, 'stock.quant', 'search_read',
        [[('location_id', 'in', [732, 700, 8]), ('quantity', '>', 0)]], 
        {'fields': ['product_id', 'quantity']})
    
    stock_map = defaultdict(float)
    p_ids_set = set()
    for s in stock_data:
        pid = s['product_id'][0]
        stock_map[pid] += s['quantity']
        p_ids_set.add(pid)
    
    lista_ids = list(p_ids_set)
    logging.info(f"Productos con stock en Odoo: {len(lista_ids)}")

    # METADATOS
    prods_light = models.execute_kw(db, uid, pwd, 'product.product', 'read', 
        [lista_ids], {'fields': ['default_code', 'name', 'x_fob_subtotal']})
    prods_dict = {p['id']: p for p in prods_light}

    # COMPARACIÓN REAL
    ids_faltantes = []
    mapa_referencias = {}

    for p in prods_light:
        ref_raw = p.get('default_code')
        if not ref_raw: continue
        ref = str(ref_raw).replace('/', '').replace('*', '').strip()
        mapa_referencias[p['id']] = ref
        fname = f"{ref}.webp"
        
        if fname not in existing_files:
            ids_faltantes.append(p['id'])

    logging.info(f"Faltan descargar realmente: {len(ids_faltantes)}")

    # PROCESAMIENTO (Lotes pequeños + Limpieza)
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
                            if img.width > 1000: img.thumbnail((1000, 1000))
                            
                            buffer = io.BytesIO()
                            img.save(buffer, 'WEBP', quality=80)
                            
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

    # JSON FINAL
    logging.info("Actualizando JSON...")
    df_cat = cargar_gsheets()
    data_list = []

    for pid in lista_ids:
        p = prods_dict.get(pid)
        if not p: continue
        ref = mapa_referencias.get(pid)
        if not ref: continue
        
        c1, c2, c3 = clasificar(p.get('name'), df_cat)
        precio = p.get('x_fob_subtotal', 0)
        if "LED 0%" not in str(c1) and "LED 0%" not in str(c2): precio *= 1.15

        data_list.append({
            'Referencia': ref,
            'Nombre': p.get('name'),
            'Categoria': c1,
            'Subcategoria': c2,
            'Stock': stock_map[pid],
            'Precio': round(precio, 2),
            'Imagen': f"/images/{ref}.webp"
        })

    df = pd.DataFrame(data_list)
    json_str = df.to_json(orient='records', force_ascii=False, indent=4)
    update_file_in_github(repo, "/Resultado_Final.json", json_str, f"Update Catalog {datetime.now()}")
    update_file_in_github(repo, "public/Resultado_Final.json", json_str, f"Update Catalog {datetime.now()}")

    logging.info("=== FIN ===")

if __name__ == "__main__":
    main()
