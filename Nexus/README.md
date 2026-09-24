# README do projeto: assistente de pesquisa com tool-calling

Este projeto é um agente de pesquisa em Python que usa a API da Anthropic para responder perguntas com apoio de ferramentas externas. A ideia principal é simples:

- o usuário faz uma pergunta;
- o modelo decide se precisa buscar na web;
- o agente executa uma ferramenta de busca;
- lê a página relevante;
- retorna a resposta final com fontes.

O projeto foi pensado para ser didático e fácil de entender. Em vez de usar frameworks pesados de agentes, o código faz o loop de tool-calling manualmente, de forma transparente.

---

## Visão geral do fluxo

O funcionamento geral é este:

1. O usuário digita uma pergunta.
2. O código cria uma mensagem para o modelo da Anthropic.
3. O modelo avalia se precisa usar uma ferramenta.
4. Se a resposta depender de dados externos, o modelo chama uma ferramenta, como busca na web ou leitura de página.
5. O resultado volta ao modelo.
6. O modelo responde com texto final, normalmente citando as URLs usadas.

Fluxo resumido:

```text
usuário -> CLI -> Agent.run() -> Anthropic API -> tool_use -> web_search/fetch_page
                                  -> tool_result -> modelo -> resposta final
```

---

## Estrutura do projeto

A estrutura principal é:

```text
Projeto--main/
├── src/
│   └── agente/
│       ├── __init__.py
│       ├── agent.py
│       ├── cli.py
│       ├── config.py
│       ├── db.py
│       └── tools/
│           ├── __init__.py
│           ├── fetch_page.py
│           └── web_search.py
├── tests/
│   ├── test_agent_loop.py
│   ├── test_db.py
│   ├── test_fetch_page.py
│   └── test_web_search.py
├── .env.example
├── pyproject.toml
├── README.md
├── run.bat
└── LICENSE
```

Cada arquivo tem uma função específica no projeto.

---

## 1) Arquivo: pyproject.toml

Este arquivo define o projeto Python e suas dependências.

Ele informa:

- nome do projeto;
- versão;
- dependências obrigatórias;
- dependências de desenvolvimento;
- configuração do setuptools;
- regras de lint do ruff.

Exemplo de dependências:

- anthropic: SDK da API da Anthropic.
- duckduckgo-search: busca na web sem precisar de chave.
- requests: acesso HTTP.
- beautifulsoup4: extração de texto de HTML.
- python-dotenv: leitura de variáveis do arquivo .env.
- mysql-connector-python: suporte a banco MySQL/XAMPP.

Esse arquivo é importante porque permite instalar tudo com um único comando:

```powershell
py -3 -m pip install -e ".[dev]"
```

---

## 2) Arquivo: .env.example

Esse arquivo guarda as variáveis de ambiente esperadas pelo projeto.

Ele serve como modelo para criar o .env real.

Conteúdo típico:

```env
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5

DB_BACKEND=sqlite
DB_SQLITE_PATH=data/agent.db
```

Se quiser usar MySQL do XAMPP, basta trocar as configurações para:

```env
DB_BACKEND=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=agente
```

O arquivo .env não fica no git normalmente, e por isso o exemplo é passado como template.

---

## 3) Arquivo: src/agente/config.py

Este módulo centraliza as configurações globais.

Ele faz:

- carregar as variáveis do ambiente;
- definir a chave da API da Anthropic;
- definir o modelo padrão;
- configurar o banco de dados local ou MySQL.

Código principal:

```python
load_dotenv()

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
```

Esses valores são usados pelo objeto `Agent` para fazer as chamadas ao Claude.

---

## 4) Arquivo: src/agente/cli.py

Este é o ponto de entrada do terminal.

Ele cria uma instância do agente e entra em um loop de perguntas e respostas.

Função principal:

```python
def main() -> None:
    agent = Agent()
    print("Assistente de pesquisa. Digite sua pergunta (ou 'sair' para encerrar).\n")
```

Depois disso, o programa fica em loop:

- lê a mensagem do usuário;
- se for "sair", encerra;
- chama `agent.run(question)`;
- imprime a resposta.

Esse arquivo é o responsável por deixar o sistema interativo no terminal.

---

## 5) Arquivo: src/agente/agent.py

Este é o coração do projeto.

Ele contém a classe `Agent`, que faz a comunicação com a API da Anthropic e controla o loop de ferramenta.

### Atributos da classe

```python
class Agent:
    def __init__(self, client: Anthropic | None = None, model: str | None = None):
        self.client = client or Anthropic(api_key=config.ANTHROPIC_API_KEY)
        self.model = model or config.ANTHROPIC_MODEL
        self.db = Database()
```

Explicando:

- `self.client`: cliente da Anthropic que envia requisições.
- `self.model`: modelo usado, como Claude.
- `self.db`: conexão ao banco de dados para cache e histórico.

### Sistema prompt

```python
SYSTEM_PROMPT = (
    "Voce e um assistente de pesquisa..."
)
```

Esse texto instruí o modelo a:

- usar ferramentas quando necessário;
- consultar a web antes de responder perguntas externas;
- citar fontes.

### Método run()

```python
def run(self, question: str) -> str:
    messages = [{"role": "user", "content": question}]
```

O método cria um histórico inicial da conversa e entra em um laço.

Dentro do `while True` ele chama:

```python
response = self.client.messages.create(
    model=self.model,
    max_tokens=4096,
    system=SYSTEM_PROMPT,
    tools=SCHEMAS,
    messages=messages,
)
```

Esse comando envia:

- o modelo;
- a instrução do sistema;
- a lista de ferramentas disponíveis;
- a conversa atual.

### Quando o modelo não usa ferramenta

Se o modelo respondeu diretamente, isso significa que ele não precisou buscar nada. O código faz:

```python
if response.stop_reason != "tool_use":
    final_answer = "".join(
        block.text for block in response.content if block.type == "text"
    )
    sources = self.db.extract_sources(final_answer)
    self.db.save_question(question, final_answer, sources)
    return final_answer
```

Nesse ponto:

- pega o texto final;
- extrai URLs do texto;
- salva a pergunta e a resposta no banco.

### Quando o modelo usa ferramenta

Se `response.stop_reason == "tool_use"`, o modelo está pedindo uma ação do sistema. O código coleta todas as ferramentas pedidas:

```python
tool_results = [
    self._execute_tool(block)
    for block in response.content
    if block.type == "tool_use"
]
```

Depois, esse resultado volta ao modelo em uma nova mensagem do tipo usuário.

### Método _execute_tool()

Este método executa a ferramenta correta.

Ele verifica se já existe cache antes de chamar a ferramenta. Exemplo:

```python
if block.name == "web_search" and "query" in block.input:
    cached = self.db.get_cached_search(block.input["query"])
    if cached:
        return {"type": "tool_result", "tool_use_id": block.id, "content": cached}
```

Se não estiver em cache, ele chama o runner da ferramenta:

```python
runner = RUNNERS[block.name]
output = runner(**block.input)
```

Depois salva o resultado em banco e retorna para o modelo.

Esse padrão é o núcleo da arquitetura de tool-calling:

- modelo requisita ferramenta;
- código executa;
- retorno volta para o modelo;
- modelo finaliza resposta.

---

## 6) Arquivo: src/agente/tools/__init__.py

Este arquivo registra todas as ferramentas disponíveis ao agente.

Ele monta duas estruturas:

- `TOOLS`: lista de dicionários com schema e função executora;
- `SCHEMAS`: lista de schemas que serão enviados ao modelo;
- `RUNNERS`: mapa de nome da ferramenta para a função correspondente.

Exemplo:

```python
TOOLS = [
    {"schema": web_search.SCHEMA, "run": web_search.run},
    {"schema": fetch_page.SCHEMA, "run": fetch_page.run},
]
```

Isso permite que o modelo veja as ferramentas e que o agente as execute sem depender de frameworks.

---

## 7) Arquivo: src/agente/tools/web_search.py

Esta é a ferramenta de busca.

Ela usa a biblioteca `duckduckgo-search` e retorna resultados estruturados com:

- título;
- URL;
- resumo.

Schema da ferramenta:

```python
SCHEMA = {
    "name": "web_search",
    "description": "Busca na web...",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "max_results": {"type": "integer"},
        },
        "required": ["query"],
    },
}
```

Função executora:

```python
def run(query: str, max_results: int = 5) -> str:
    results = DDGS().text(query, max_results=max_results)
```

Ela pesquisa no DuckDuckGo e organiza cada resultado em texto legível para o modelo.

### Importância desta ferramenta

Sem ela, o agente só poderia responder com base em conhecimento interno. Com ela, ele consegue pesquisar fontes externas em tempo real.

---

## 8) Arquivo: src/agente/tools/fetch_page.py

Essa ferramenta lê uma página web e extrai o texto visível.

Ela usa:

- `requests` para fazer HTTP;
- `BeautifulSoup` para limpar o HTML.

O fluxo é:

1. faz a requisição para a URL;
2. carrega o HTML;
3. remove tags de script, style, header, nav e footer;
4. pega o texto limpo;
5. corta a página para 5000 caracteres para evitar respostas gigantes.

Trecho importante:

```python
soup = BeautifulSoup(response.text, "html.parser")
for tag in soup(["script", "style", "nav", "footer", "header"]):
    tag.decompose()
```

Isso deixa o conteúdo mais legível para o modelo.

---

## 9) Arquivo: src/agente/db.py

Este módulo cuida do banco de dados.

Ele foi pensado para salvar e reaproveitar dados importantes:

- perguntas e respostas;
- resultados de pesquisas;
- páginas já acessadas.

### Objetivo do banco

Sem banco, o agente faria buscas e acessos repetidos a cada execução. Com cache, ele reduz custo e melhora performance.

### Tabelas principais

O código cria três tabelas:

- `questions`: guarda pergunta, resposta e URLs citadas;
- `searches`: guarda queries e resultados de busca;
- `pages`: guarda páginas baixadas e conteúdo extraído.

Exemplo:

```python
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    sources TEXT,
    created_at TEXT NOT NULL
)
```

### Suporte a SQLite e MySQL

A lógica muda de acordo com a variável `DB_BACKEND`:

- `sqlite`: usa um arquivo local em `data/agent.db`;
- `mysql`: usa um banco de dados externo, como o XAMPP.

Essa flexibilidade permite usar o projeto em ambiente simples ou em ambiente mais profissional.

### Métodos importantes

- `save_question()`: grava pergunta e resposta;
- `save_search()`: grava resultado de busca em cache;
- `get_cached_search()`: retorna resultado salvo anteriormente;
- `save_page()`: grava conteúdo de uma página;
- `get_cached_page()`: reutiliza conteúdo salvo;
- `extract_sources()`: procura URLs no texto final para registrar fontes.

---

## 10) Fluxo completo do código em uma pergunta real

Exemplo: "Qual é a capital do Brasil?"

1. `cli.py` lê a pergunta.
2. `Agent.run()` envia para o modelo via Anthropic.
3. O modelo entende que não precisa procurar na web para uma pergunta simples e responde diretamente.
4. O código salva a pergunta e a resposta em `questions`.
5. A resposta é exibida ao usuário.

Exemplo com pergunta que exige busca:

"Quem ganhou as eleições de 2022 no Brasil?"

1. `cli.py` lê a pergunta.
2. `Agent.run()` envia ao modelo.
3. O modelo decide usar `web_search`.
4. `Agent._execute_tool()` chama a função de busca.
5. A busca retorna links e resumos.
6. O modelo escolhe uma página.
7. `fetch_page` lê o conteúdo da URL.
8. O texto é resumido e a resposta final é enviada ao usuário.
9. A resposta e as URLs são salvas no banco.

---

## 11) Testes

A pasta `tests` contém testes de comportamento do agente e das ferramentas.

### test_agent_loop.py

Esse arquivo valida que:

- o agente responde diretamente quando não usa ferramenta;
- o agente executa `web_search` quando necessário;
- erros de ferramentas são tratados sem quebrar a execução.

### test_db.py

Esse teste valida que o sistema de banco funciona, especialmente o cache de buscas e páginas.

### test_web_search.py e test_fetch_page.py

Esses arquivos testam as ferramentas de forma isolada, normalmente com mocks ou respostas simuladas.

Isso evita chamadas reais à internet ou à API da Anthropic durante testes.

---

## 12) Como rodar o projeto

No Windows, no diretório do projeto, use:

```powershell
cd "C:\Users\kelvi\Downloads\Projeto--main\Projeto--main"
.\run.bat
```

Ou manualmente:

```powershell
py -3 -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
copy .env.example .env
python -m agente.cli
```

### Observação

Para usar o projeto de verdade, você precisa configurar a variável `ANTHROPIC_API_KEY` no `.env` com uma chave válida da Anthropic.

---

## 13) Arquitetura em uma frase

O projeto combina três ideias simples:

- modelo de IA para decidir o que fazer;
- ferramentas para buscar e ler a web;
- banco para guardar histórico e cache.

Essa arquitetura deixa o agente funcional, didático e fácil de expandir.

---

## 14) Possíveis melhorias futuras

Algumas melhorias que valem a pena:

- histórico de conversa em múltiplas mensagens;
- ranking de fontes por confiabilidade;
- limite de iterações para evitar loops infinitos;
- suporte à paginação e comparação de fontes;
- exportação dos dados para CSV ou JSON;
- interface web ou API REST.

---

## Resumo final

Este projeto é um exemplo prático de agente com tool-calling em Python. Ele mostra como:

- integrar uma API de IA;
- criar ferramentas externas;
- controlar um loop de decisão do modelo;
- salvar dados em banco;
- manter a aplicação simples e didática.

Se você entender cada módulo deste README, você já tem uma visão clara de como o código funciona como um todo.
