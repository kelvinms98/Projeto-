from unittest.mock import MagicMock, patch

from agente.tools import web_search


@patch("agente.tools.web_search.DDGS")
def test_run_formats_results(mock_ddgs_class):
    mock_ddgs_class.return_value.text.return_value = [
        {"title": "Python", "href": "https://python.org", "body": "Linguagem de programacao."},
    ]

    result = web_search.run("python", max_results=1)

    assert "Python" in result
    assert "https://python.org" in result


@patch("agente.tools.web_search.DDGS")
def test_run_no_results(mock_ddgs_class):
    mock_ddgs_class.return_value.text.return_value = []

    result = web_search.run("termo-sem-resultados")

    assert result == "Nenhum resultado encontrado."


@patch("agente.tools.web_search.DDGS")
def test_run_passes_max_results(mock_ddgs_class):
    mock_instance = MagicMock()
    mock_instance.text.return_value = []
    mock_ddgs_class.return_value = mock_instance

    web_search.run("python", max_results=3)

    mock_instance.text.assert_called_once_with("python", max_results=3)
