from unittest.mock import MagicMock, patch

import pytest
import requests

from agente.tools import fetch_page


@patch("agente.tools.fetch_page.requests.get")
def test_run_strips_html(mock_get):
    mock_response = MagicMock()
    mock_response.text = "<html><body><script>ignorar()</script><p>Ola mundo</p></body></html>"
    mock_response.raise_for_status.return_value = None
    mock_get.return_value = mock_response

    result = fetch_page.run("https://example.com")

    assert "Ola mundo" in result
    assert "ignorar" not in result


@patch("agente.tools.fetch_page.requests.get")
def test_run_truncates_long_text(mock_get):
    mock_response = MagicMock()
    mock_response.text = f"<p>{'a' * (fetch_page.MAX_CHARS + 500)}</p>"
    mock_response.raise_for_status.return_value = None
    mock_get.return_value = mock_response

    result = fetch_page.run("https://example.com")

    assert len(result) == fetch_page.MAX_CHARS + len("...")
    assert result.endswith("...")


@patch("agente.tools.fetch_page.requests.get")
def test_run_raises_on_http_error(mock_get):
    mock_response = MagicMock()
    mock_response.raise_for_status.side_effect = requests.HTTPError("404")
    mock_get.return_value = mock_response

    with pytest.raises(requests.HTTPError):
        fetch_page.run("https://example.com/nao-existe")
