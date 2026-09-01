# Assistente de Pesquisa (Tool-Calling com Claude)

Agente de linha de comando que responde perguntas pesquisando na web: usa a API da Anthropic (Claude) com **tool-calling** para decidir quando buscar informações e ler páginas, e sempre cita as fontes usadas na resposta final.

Projeto de portfólio focado em fundamentos de engenharia de IA: protocolo de tool use, loop de agente, testes com mocks e injeção de dependência — sem frameworks de agente.

## Arquitetura

```
pergunta do usuário
        │
        ▼
   Agent.run() ── envia mensagens + schemas das tools para o Claude
        │
        ├── Claude decide responder diretamente        → retorna texto
        │
        └── Claude pede uma tool (tool_use)
                 │
                 ├── web_search(query)   → busca no DuckDuckGo
                 ├── fetch_page(url)     → baixa e limpa o HTML de uma página
                 │
                 ▼
        resultado da tool volta pro Claude (tool_result)
                 │
                 ▼
        loop continua até Claude responder com texto final
```

- `src/agente/agent.py` — loop manual de tool-use (sem framework), usando o SDK oficial `anthropic` diretamente.
- `src/agente/tools/` — cada tool é um schema JSON + uma função Python. Registradas em `tools/__init__.py`.
- `src/agente/cli.py` — REPL simples no terminal.
- `src/agente/config.py` — lê `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL` do `.env`.

## Setup

Requer Python 3.11+.

```powershell
py -3.14 -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
copy .env.example .env
```

Edite o `.env` e coloque sua chave real da API da Anthropic em `ANTHROPIC_API_KEY`.

## Uso

```powershell
python -m agente.cli
```

```
Assistente de pesquisa. Digite sua pergunta (ou 'sair' para encerrar).

> Quem venceu a eleição presidencial mais recente no Brasil?

Lula venceu a eleição presidencial de 2022...
Fontes: https://...
```

## Testes

```powershell
pytest
ruff check .
```

Os testes não fazem chamadas reais à API nem à internet — tudo é mockado (`DDGS`, `requests.get`, e um cliente Anthropic falso injetado no `Agent`).

## Decisões de design

- **SDK oficial direto, sem framework de agentes** (LangChain etc.) — o objetivo é deixar explícito o loop de tool-use (`tool_use` → executa → `tool_result` → repete até `end_turn`).
- **Tools como schema + função**, sem abstração de classe — só existem duas tools, não vale a pena uma camada de plugin.
- **Injeção do client no `Agent`** (`Agent(client=...)`) para testar o loop com um client falso, sem gastar API real.
- **DuckDuckGo** para busca (`duckduckgo-search`) — não exige API key nem cadastro, bom para rodar o projeto na hora.

## Limitações / próximos passos

- Sem limite de iterações no loop — um laço de tool-use mal comportado pode rodar indefinidamente.
- `fetch_page` corta o conteúdo em 5000 caracteres; páginas muito longas perdem informação.
- Poderia evoluir para: histórico de conversas multi-turno, cache de resultados de busca, ou um harness de avaliação (perguntas com resposta esperada) para medir qualidade do agente.
