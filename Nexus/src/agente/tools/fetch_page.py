import requests
from bs4 import BeautifulSoup

MAX_CHARS = 5000

SCHEMA = {
    "name": "fetch_page",
    "description": (
        "Baixa uma pagina web pela URL e retorna seu texto legivel (sem HTML). "
        "Use para ler o conteudo de uma fonte encontrada com web_search."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL completa da pagina a ser lida."},
        },
        "required": ["url"],
    },
}


def run(url: str) -> str:
    response = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    text = " ".join(soup.get_text(separator=" ").split())
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS] + "..."
    return text
