from .db import Database
from . import config
import os
import argparse


def main():
    parser = argparse.ArgumentParser(description='Seed local DB and optionally sync to Supabase')
    parser.add_argument('--key', '-k', help='Supabase key (anon or service_role) to use for sync')
    parser.add_argument('--url', '-u', help='Supabase URL (overrides config)', default=config.SUPABASE_URL)
    args = parser.parse_args()

    db = Database()
    print('Seeding produtos locais...')
    db.seed_default_products()
    products = db.list_products()
    print(f'Produtos locais inseridos: {len(products)}')

    supabase_key = args.key or os.environ.get('SUPABASE_KEY') or config.SUPABASE_KEY
    supabase_url = args.url or config.SUPABASE_URL

    if supabase_key:
        print('Tentando sincronizar com Supabase...')
        result = db.sync_products_to_supabase(supabase_url, supabase_key)
        print('Resultado da sincronização:')
        print(result)
    else:
        print('Chave SUPABASE_KEY não fornecida; pulando sincronização remota.')


if __name__ == '__main__':
    main()
