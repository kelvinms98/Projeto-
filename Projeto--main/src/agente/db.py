import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from typing import Any, Optional

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

    @staticmethod
    def extract_sources(text: str) -> list[str]:
        return list(dict.fromkeys(URL_PATTERN.findall(text)))
