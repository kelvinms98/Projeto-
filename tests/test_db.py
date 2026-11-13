import os

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
