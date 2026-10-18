import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from typing import Any, Optional
import requests

from . import config

URL_PATTERN = re.compile(r"https?://[\w\-\.%:/?=&#]+")


class Database:
    def __init__(self) -> None:
        self.backend = config.DB_BACKEND.lower()

        if self.backend == "mysql":
            try:
                import mysql.connector as mysql_connector
            except ModuleNotFoundError as exc:
                raise RuntimeError(
                    "MySQL backend selecionado, mas mysql-connector-python nao esta instalado. "
                    "Instale-o com pip install mysql-connector-python."
                ) from exc

            self._connect = lambda: mysql_connector.connect(
                host=config.DB_HOST,
                port=config.DB_PORT,
                user=config.DB_USER,
                password=config.DB_PASSWORD,
                database=config.DB_NAME,
                autocommit=True,
            )
            self._create_table = self._create_table_mysql
            self.placeholder = "%s"
        else:
            sqlite_path = os.path.abspath(config.DB_SQLITE_PATH)
            os.makedirs(os.path.dirname(sqlite_path), exist_ok=True)
            self._connect = lambda: sqlite3.connect(sqlite_path)
            self._create_table = self._create_table_sqlite
            self.placeholder = "?"

        self._ensure_schema()

    def _ensure_schema(self) -> None:
        with self._connect() as conn:
            cursor = conn.cursor()
            self._create_table(cursor)
            conn.commit()

    def _create_table_sqlite(self, cursor: Any) -> None:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                sources TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS searches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT NOT NULL UNIQUE,
                result TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS pages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                brand TEXT,
                category TEXT,
                price REAL,
                status TEXT,
                tag TEXT,
                image TEXT,
                stock TEXT,
                created_at TEXT NOT NULL
            )
            """
        )

    def _create_table_mysql(self, cursor: Any) -> None:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS questions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                question LONGTEXT NOT NULL,
                answer LONGTEXT NOT NULL,
                sources LONGTEXT,
                created_at DATETIME NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS searches (
                id INT PRIMARY KEY AUTO_INCREMENT,
                query VARCHAR(1024) NOT NULL UNIQUE,
                result LONGTEXT NOT NULL,
                created_at DATETIME NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS pages (
                id INT PRIMARY KEY AUTO_INCREMENT,
                url VARCHAR(2048) NOT NULL UNIQUE,
                content LONGTEXT NOT NULL,
                created_at DATETIME NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name LONGTEXT NOT NULL,
                brand VARCHAR(255),
                category VARCHAR(255),
                price DOUBLE,
                status VARCHAR(50),
                tag VARCHAR(255),
                image LONGTEXT,
                stock LONGTEXT,
                created_at DATETIME NOT NULL
            )
            """
        )

    def save_question(self, question: str, answer: str, sources: list[str]) -> None:
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"INSERT INTO questions (question, answer, sources, created_at) VALUES ({self.placeholder}, {self.placeholder}, {self.placeholder}, {self.placeholder})",
                (question, answer, json.dumps(sources), datetime.now(timezone.utc).isoformat()),
            )
            conn.commit()

    def get_cached_search(self, query: str) -> Optional[str]:
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"SELECT result FROM searches WHERE query = {self.placeholder}",
                (query,),
            )
            row = cursor.fetchone()
            return row[0] if row else None

    def save_search(self, query: str, result: str) -> None:
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"REPLACE INTO searches (query, result, created_at) VALUES ({self.placeholder}, {self.placeholder}, {self.placeholder})",
                (query, result, datetime.now(timezone.utc).isoformat()),
            )
            conn.commit()

    def get_cached_page(self, url: str) -> Optional[str]:
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"SELECT content FROM pages WHERE url = {self.placeholder}",
                (url,),
            )
            row = cursor.fetchone()
            return row[0] if row else None

    def save_page(self, url: str, content: str) -> None:
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"REPLACE INTO pages (url, content, created_at) VALUES ({self.placeholder}, {self.placeholder}, {self.placeholder})",
                (url, content, datetime.now(timezone.utc).isoformat()),
            )
            conn.commit()

    def add_product(self, product: dict) -> None:
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"INSERT INTO products (name, brand, category, price, status, tag, image, stock, created_at) VALUES ({', '.join([self.placeholder]*9)})",
                (
                    product.get('name'),
                    product.get('brand'),
                    product.get('category'),
                    product.get('price'),
                    product.get('status'),
                    product.get('tag'),
                    product.get('image'),
                    product.get('stock'),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            conn.commit()

    def list_products(self) -> list[dict]:
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, brand, category, price, status, tag, image, stock, created_at FROM products")
            rows = cursor.fetchall()
            results = []
            for r in rows:
                results.append(
                    {
                        'id': r[0],
                        'name': r[1],
                        'brand': r[2],
                        'category': r[3],
                        'price': r[4],
                        'status': r[5],
                        'tag': r[6],
                        'image': r[7],
                        'stock': r[8],
                        'created_at': r[9],
                    }
                )
            return results

    def seed_default_products(self) -> None:
        defaults = [
            {
                'name': 'Camiseta Oversized Respeito',
                'brand': 'nexus',
                'category': 'camiseta',
                'price': 119.9,
                'status': 'available',
                'tag': 'Mais Vendido',
                'image': 'oversized_respeito.jpg',
                'stock': 'Disponível agora',
            },
            {
                'name': 'Calça Cargo Utilitária ZL',
                'brand': 'nexus',
                'category': 'calça',
                'price': 229.9,
                'status': 'available',
                'tag': 'Novo',
                'image': 'cargo_heavy.jpg',
                'stock': 'Disponível agora',
            },
            {
                'name': 'Moletom Canguru nexus Syndicate',
                'brand': 'nexus',
                'category': 'moletom',
                'price': 249.9,
                'status': 'upcoming',
                'tag': 'Em Breve',
                'image': 'moletom_syndicate.jpg',
                'stock': 'Entrando em estoque em breve',
            },
            {
                'name': 'Tênis All Star',
                'brand': 'nike',
                'category': 'tênis',
                'price': 199.9,
                'status': 'available',
                'tag': 'Clássico',
                'image': 'nike_all_star.jpg',
                'stock': 'Disponível agora',
            },
            {
                'name': 'Camisa Nike',
                'brand': 'nike',
                'category': 'camisa',
                'price': 129.9,
                'status': 'available',
                'tag': 'Essencial',
                'image': 'nike_shirt.jpg',
                'stock': 'Disponível agora',
            },
        ]

        for p in defaults:
            try:
                self.add_product(p)
            except Exception:
                # ignore duplicates or insert errors when seeding
                continue

    def sync_products_to_supabase(self, supabase_url: str, supabase_key: str) -> dict:
        """Tenta sincronizar produtos para a tabela `products` via Supabase REST API.
        Retorna um resultado resumo com sucesso/erro por item.
        """
        results = {'success': [], 'failed': []}
        if not supabase_url or not supabase_key:
            results['error'] = 'SUPABASE_URL ou SUPABASE_KEY não foram fornecidos.'
            return results

        endpoint = supabase_url.rstrip('/') + '/rest/v1/products'
        headers = {
            'apikey': supabase_key,
            'Authorization': f'Bearer {supabase_key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        }

        for p in self.list_products():
            payload = {
                'name': p['name'],
                'brand': p['brand'],
                'category': p['category'],
                'price': p['price'],
                'status': p['status'],
                'tag': p['tag'],
                'image': p['image'],
                'stock': p['stock'],
            }
            try:
                resp = requests.post(endpoint, headers=headers, data=json.dumps(payload), timeout=10)
                if resp.status_code in (200, 201, 204):
                    results['success'].append(p['name'])
                else:
                    results['failed'].append({'name': p['name'], 'status_code': resp.status_code, 'body': resp.text})
            except Exception as exc:
                results['failed'].append({'name': p['name'], 'error': str(exc)})

        return results

    @staticmethod
    def extract_sources(text: str) -> list[str]:
        return list(dict.fromkeys(URL_PATTERN.findall(text)))
