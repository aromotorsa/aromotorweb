import pandas as pd
import os
import sys
import logging
import json
import base64
import io
import shutil
import xmlrpc.client
from datetime import datetime
from collections import defaultdict
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from PIL import Image
from git import Repo, Actor

# --- CONFIGURACIÓN DE LOGS ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

# --- VARIABLES DE ENTORNO ---
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
REPO_URL = os.environ.get("REPO_URL") # Ejemplo: github.com/tuusuario/tu-repo.git
USER_NAME = os.environ.get("GIT_USER", "Railway Bot")
USER_EMAIL = os.environ.get("GIT_EMAIL", "bot@railway.app")

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

def main():
    # 1. PREPARAR EL ENTORNO GIT
    logging.info("Clonando repositorio...")
    if os.path.exists("temp_repo"):
        shutil.rmtree("temp_repo")
    
    # URL con el token incrustado para autenticación automática
    # Formato final: https://TOKEN@github.com/usuario/repo.git
    auth_url = f"https://{GITHUB_TOKEN}@{REPO_URL}"
    
    repo = Repo.clone_from(auth_url, "temp_repo")
    
    # Rutas locales dentro del repo clonado
    path_images = os.path.join("temp_repo", "public", "images") # Asumiendo estructura de Netlify/React habitual
    os.makedirs(path_images, exist_ok=True)
    
    # 2. CONEXIÓN ODOO
    logging.info("Conectando a Odoo...")
    url, db, usr = 'https://aromotor.com', 'aromotor', 'pruebas'
    pwd = os.environ.get("ODOO_PWD")
    common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
    uid = common.authenticate(db, usr, pwd, {})
    models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

    # 3. STOCK Y PRODUCTOS
    logging.info("Obteniendo datos...")
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

    logging.info("Procesando imágenes...")
    for p in prods:
        ref = str(p.get('default_code') or '').replace('/', '').replace('*', '').strip()
        if not ref: continue

        fname = f"{ref}.webp"
        file_path = os.path.join(path_images, fname)
        
        # Guardar imagen solo si NO existe (para ahorrar tiempo)
        if not os.path.exists(file_path) and p.get('image_1920'):
            try:
                img_data = base64.b64decode(p['image_1920'])
                img = Image.open(io.BytesIO(img_data))
                if img.width > 1000: img.thumbnail((1000, 1000))
                img.save(file_path, 'WEBP', quality=80)
            except Exception as e:
                logging.error(f"Error guardando {fname}: {e}")

        # Clasificación y Precios
        c1, c2, c3 = clasificar(p.get('name'), df_cat)
        precio = p.get('x_fob_subtotal', 0)
        if "LED 0%" not in str(c1) and "LED 0%" not in str(c2):
            precio = precio * 1.15

        # En Netlify, si la imagen está en /public/images, la URL es /images/foto.webp
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
    # Guardar en /public/ o /src/assets/ dependiendo de tu proyecto. 
    # Generalmente ponerlo en /public/ asegura acceso directo.
    json_path = os.path.join("temp_repo", "public", "catalogo.json")
    df_final.to_json(json_path, orient='records', force_ascii=False, indent=4)

    # 5. COMMIT Y PUSH A GITHUB
    logging.info("Subiendo cambios a GitHub...")
    if repo.is_dirty(untracked_files=True):
        repo.git.add(all=True)
        author = Actor(USER_NAME, USER_EMAIL)
        repo.index.commit(f"Actualización Automática: {datetime.now()}", author=author)
        origin = repo.remote(name='origin')
        origin.push()
        logging.info("¡Push exitoso! Netlify debería actualizarse pronto.")
    else:
        logging.info("No hubo cambios en el catálogo.")

    # Limpieza
    shutil.rmtree("temp_repo")

if __name__ == "__main__":
    main()