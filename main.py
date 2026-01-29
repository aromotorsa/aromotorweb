import pandas as pd
import os
import sys
import logging
import json
import base64
import io
import xmlrpc.client
from datetime import datetime
from collections import defaultdict
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from PIL import Image
from github import Github, GithubException # USAMOS LA API, NO EL BINARIO

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

# --- CONFIGURACIÓN ---
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
# Formato REPO_NAME: "usuario/nombre-repo" (ej: "juanperez/mi-tienda")
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
        logging.warning(f"Error Sheets: {e}")
        return pd.DataFrame()

def clasificar(nombre, df_cat):
    if df_cat.empty or not isinstance(nombre, str): return ('Sin Cat', 'Sin Subcat', 'General')
    nombre = nombre.lower()
    for _, row in df_cat.iterrows():
        if str(row.get('DETALLE', '')).lower() in nombre:
            return (row.get('Categoría Nivel 1'), row.get('Categoría Nivel 2'), row.get('Categoría Nivel 3'))
    return ('Sin Cat', 'Sin Subcat', 'General')

def update_file_in_github(repo, path, content, message):
    """Sube archivo a GitHub sin necesitar git instalado"""
    try:
        contents = repo.get_contents(path)
        repo.update_file(contents.path, message, content, contents.sha)
        logging.info(f"Actualizado: {path}")
    except GithubException as e:
        if e.status == 404:
            repo.create_file(path, message, content)
            logging.info(f"Creado: {path}")
        else:
            logging.error(f"Error subiendo {path}: {e}")

def main():
    logging.info("Iniciando modo API (Sin binario Git)...")
    
    # 1. CONEXIÓN GITHUB API
    if not GITHUB_TOKEN or not REPO_NAME:
        logging.error("Faltan variables GITHUB_TOKEN o REPO_NAME")
        return

    g = Github(GITHUB_TOKEN)
    repo = g.get_repo(REPO_NAME)
    
    # Pre-cargar lista de archivos existentes para no duplicar trabajo
    existing_files = set()
    try:
        # Asumiendo que las imagenes están en /public/images/
        contents = repo.get_contents("public/images")
        while contents:
            file_content = contents.pop(0)
            existing_files.add(file_content.name)
    except:
        pass 

    # 2. CONEXIÓN ODOO
    logging.info("Conectando a Odoo...")
    url, db, usr = 'https://aromotor.com', 'aromotor', 'pruebas'
    pwd = os.environ.get("ODOO_PWD")
    common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
    uid = common.authenticate(db, usr, pwd, {})
    models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

    # 3. OBTENER DATOS
    stock = models.execute_kw(db, uid, pwd, 'stock.quant', 'search_read',
        [[('location_id', 'in', [732, 700, 8]), ('quantity', '>', 0)]], {'fields': ['product_id', 'quantity']})
    
    stock_map = defaultdict(float)
    p_ids = set()
    for s in stock:
        pid = s['product_id'][0]
        stock_map[pid] += s['quantity']
        p_ids.add(pid)
    
    prods = models.execute_kw(db, uid, pwd, 'product.product', 'read', [list(p_ids)], 
        {'fields': ['default_code', 'name', 'x_fob_subtotal', 'image_1920']})

    df_cat = cargar_gsheets()
    data_list = []

    logging.info("Procesando...")
    for p in prods:
        ref = str(p.get('default_code') or '').replace('/', '').replace('*', '').strip()
        if not ref: continue
        fname = f"{ref}.webp"

        # LÓGICA IMAGEN: Subir solo si no existe en GitHub
        if fname not in existing_files and p.get('image_1920'):
            try:
                img_data = base64.b64decode(p['image_1920'])
                img = Image.open(io.BytesIO(img_data))
                if img.width > 1000: img.thumbnail((1000, 1000))
                
                buf = io.BytesIO()
                img.save(buf, 'WEBP', quality=80)
                
                # Subir vía API
                update_file_in_github(repo, f"public/images/{fname}", buf.getvalue(), f"Img {fname}")
            except Exception as e:
                logging.error(f"Fallo imagen {fname}: {e}")

        # CLASIFICACIÓN
        c1, c2, c3 = clasificar(p.get('name'), df_cat)
        precio = p.get('x_fob_subtotal', 0)
        if "LED 0%" not in str(c1) and "LED 0%" not in str(c2):
            precio = precio * 1.15

        data_list.append({
            'Referencia': ref,
            'Nombre': p.get('name'),
            'Categoria': c1,
            'Subcategoria': c2,
            'Stock': stock_map[p['id']],
            'Precio': round(precio, 2),
            'Imagen': f"/images/{fname}"
        })

    # 4. GUARDAR JSON
    df_final = pd.DataFrame(data_list)
    json_str = df_final.to_json(orient='records', force_ascii=False, indent=4)
    update_file_in_github(repo, "public/catalogo.json", json_str, f"Update {datetime.now()}")
    
    logging.info("¡Sincronización API completada!")

if __name__ == "__main__":
    main()