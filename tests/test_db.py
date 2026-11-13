import os
import sqlite3

import pytest

from agente import db


def test_database_caches_search_and_page(monkeypatch, tmp_path):
    monkeypatch.setattr(db.config, "DB_BACKEND", "sqlite")
    monkeypatch.setattr(db.config, "DB_SQLITE_PATH", str(tmp_path / "agent.db"))

    database = db.Database()

    assert database.get_cached_search("teste") is None
    database.save_search("teste", "resultado de busca")
    assert database.get_cached_search("teste") == "resultado de busca"

    assert database.get_cached_page("https://exemplo.com") is None
    database.save_page("https://exemplo.com", "conteudo da pagina")
    assert database.get_cached_page("https://exemplo.com") == "conteudo da pagina"

    database.save_question("Qual e o tempo?", "Esta chovendo.", ["https://exemplo.com"])
    assert os.path.exists(tmp_path / "agent.db")


def test_seed_default_products_is_idempotent(monkeypatch, tmp_path):
    monkeypatch.setattr(db.config, "DB_BACKEND", "sqlite")
    monkeypatch.setattr(db.config, "DB_SQLITE_PATH", str(tmp_path / "agent.db"))
    database = db.Database()

    database.seed_default_products()
    database.seed_default_products()

    assert len(database.list_products()) == 5


def test_seed_default_products_does_not_hide_database_errors(monkeypatch, tmp_path):
    monkeypatch.setattr(db.config, "DB_BACKEND", "sqlite")
    monkeypatch.setattr(db.config, "DB_SQLITE_PATH", str(tmp_path / "agent.db"))
    database = db.Database()

    def fail_to_insert(_product):
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(database, "add_product", fail_to_insert)

    with pytest.raises(sqlite3.OperationalError, match="database is locked"):
        database.seed_default_products()
