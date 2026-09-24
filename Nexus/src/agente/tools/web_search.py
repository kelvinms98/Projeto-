from duckduckgo_search import DDGS

SCHEMA = {
    "name": "web_search",
    "description": (
        "Busca na web e retorna uma lista de resultados (titulo, url, resumo). "
        "Use para encontrar fontes antes de responder perguntas sobre fatos, "
        "eventos atuais ou qualquer coisa que exija informacao externa."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Termos de busca."},
            "max_results": {
                "type": "integer",
                "description": "Numero maximo de resultados (padrao 5).",
            },
        },
        "required": ["query"],
    },
}


def run(query: str, max_results: int = 5) -> str:
    results = DDGS().text(query, max_results=max_results)
    if not results:
        return "Nenhum resultado encontrado."

    lines = []
    for r in results:
        lines.append(f"- {r['title']}\n  URL: {r['href']}\n  {r['body']}")
    return "\n".join(lines)
