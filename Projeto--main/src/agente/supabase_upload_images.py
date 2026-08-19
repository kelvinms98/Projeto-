"""
Script para fazer upload de imagens para Supabase Storage e atualizar a tabela `products`.
Uso:
  python -m src.agente.supabase_upload_images --key <SERVICE_ROLE_KEY> --images-dir ./images

Requisitos:
  pip install requests

Notas:
  - Este script usa a service_role key (não compartilhe essa chave publicamente).
  - As imagens devem ter nomes que permitam casar com produtos (ex: "camiseta_oversized_respeito.jpg").
"""

import os
import argparse
import requests
import glob
import json
import re


def normalize(text: str) -> str:
    if not text:
        return ''
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '', text)
    return text


def ensure_bucket(supabase_url: str, supabase_key: str, bucket: str) -> bool:
    url = f"{supabase_url.rstrip('/')}/storage/v1/bucket"
    headers = {
        'Authorization': f'Bearer {supabase_key}',
        'apiKey': supabase_key,
        'Content-Type': 'application/json'
    }
    # Check existing buckets
    r = requests.get(url, headers=headers, timeout=15)
    if r.status_code == 200:
        try:
            buckets = r.json()
            if any(b.get('name') == bucket for b in buckets):
                return True
        except Exception:
            pass
    # Create bucket
    payload = {'name': bucket, 'public': True}
    r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=15)
    return r.status_code in (200, 201)


def upload_file(supabase_url: str, supabase_key: str, bucket: str, file_path: str, dest_path: str = None) -> (bool, str):
    dest = dest_path or os.path.basename(file_path)
    url = f"{supabase_url.rstrip('/')}/storage/v1/object/{bucket}"
    headers = {
        'Authorization': f'Bearer {supabase_key}',
        'apiKey': supabase_key,
    }
    files = {'file': open(file_path, 'rb')}
    params = {'cacheControl': '3600'}
    r = requests.post(url, headers=headers, files=files, params=params, timeout=60)
    files['file'].close()
    if r.status_code in (200, 201):
        public_url = f"{supabase_url.rstrip('/')}/storage/v1/object/public/{bucket}/{dest}"
        return True, public_url
    else:
        return False, r.text


def get_products(supabase_url: str, supabase_key: str) -> list:
    url = f"{supabase_url.rstrip('/')}/rest/v1/products?select=id,name"
    headers = {
        'Authorization': f'Bearer {supabase_key}',
        'apiKey': supabase_key,
        'Accept': 'application/json'
    }
    r = requests.get(url, headers=headers, timeout=15)
    if r.status_code == 200:
        return r.json()
    return []


def update_product_image(supabase_url: str, supabase_key: str, product_id: int, image_url: str) -> bool:
    url = f"{supabase_url.rstrip('/')}/rest/v1/products?id=eq.{product_id}"
    headers = {
        'Authorization': f'Bearer {supabase_key}',
        'apiKey': supabase_key,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }
    payload = {'image': image_url}
    r = requests.patch(url, headers=headers, data=json.dumps(payload), timeout=15)
    return r.status_code in (200, 204)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--key', '-k', required=True, help='Supabase service_role key')
    parser.add_argument('--url', '-u', default='https://khimlcgwdhmuymqolzpu.supabase.co', help='Supabase URL')
    parser.add_argument('--images-dir', '-i', default='./images', help='Pasta com imagens a enviar')
    parser.add_argument('--bucket', '-b', default='product-images', help='Nome do bucket no Supabase Storage')
    args = parser.parse_args()

    supabase_key = args.key
    supabase_url = args.url
    images_dir = args.images_dir
    bucket = args.bucket

    if not os.path.isdir(images_dir):
        print(f"Pasta de imagens não encontrada: {images_dir}")
        return

    print('Verificando/criando bucket...')
    ok = ensure_bucket(supabase_url, supabase_key, bucket)
    if not ok:
        print('Falha ao garantir bucket. Verifique a chave e as permissões.')
        return

    print('Buscando produtos no Supabase...')
    products = get_products(supabase_url, supabase_key)
    normalized_products = {normalize(p.get('name')): p for p in products}
    print(f'Produtos encontrados: {len(products)}')

    files = glob.glob(os.path.join(images_dir, '*'))
    print(f'Imagens encontradas: {len(files)}')

    for f in files:
        fname = os.path.basename(f)
        name_no_ext = os.path.splitext(fname)[0]
        norm = normalize(name_no_ext)
        matched = None
        # tentativa direta
        if norm in normalized_products:
            matched = normalized_products[norm]
        else:
            # tentativa por substring
            for k, p in normalized_products.items():
                if k in norm or norm in k:
                    matched = p
                    break
        print(f'Processando {fname} -> matched: {matched and matched.get("name")}')
        success, result = upload_file(supabase_url, supabase_key, bucket, f)
        if success:
            public_url = result
            print(f'Upload ok: {public_url}')
            if matched:
                updated = update_product_image(supabase_url, supabase_key, matched['id'], public_url)
                print('Atualizado produto:', updated)
            else:
                print('Nenhum produto correspondente encontrado para', fname)
        else:
            print('Falha no upload:', result)

    print('Concluído.')


if __name__ == '__main__':
    main()
