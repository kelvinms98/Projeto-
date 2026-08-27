import os
from dotenv import load_dotenv, find_dotenv
from google import genai
from google.genai import types

from . import config
from .db import Database
from .tools.web_search import run as web_search_run
from .tools.fetch_page import run as fetch_page_run

# Localiza o arquivo .env a partir da raiz do projeto e força a sobrescrita
load_dotenv(find_dotenv(), override=True)

SYSTEM_PROMPT = (
    "Voce e um assistente de pesquisa. Use as ferramentas disponiveis para buscar "
    "na web e ler paginas antes de responder perguntas que dependam de informacao "
    "externa. Sempre cite as URLs das fontes que usou na resposta final."
)

web_search_decl = types.FunctionDeclaration(
    name="web_search",
    description="Busca na web/DuckDuckGo e retorna resultados contendo URL, titulo e trecho.",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "query": types.Schema(
                type=types.Type.STRING,
                description="Termo ou frase para pesquisar na web."
            )
        },
        required=["query"]
    )
)

fetch_page_decl = types.FunctionDeclaration(
    name="fetch_page",
    description="Acessa uma URL e extrai o texto do conteudo da pagina.",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "url": types.Schema(
                type=types.Type.STRING,
                description="URL completa da pagina web a ser lida."
            )
        },
        required=["url"]
    )
)

tools_config = [types.Tool(function_declarations=[web_search_decl, fetch_page_decl])]


class Agent:
    def __init__(self, client: genai.Client | None = None, model: str | None = None):
        api_key = os.getenv("GEMINI_API_KEY") or getattr(config, "GEMINI_API_KEY", None)
        
        if not api_key:
            raise RuntimeError(
                "Variável GEMINI_API_KEY não encontrada. Defina-a no .env ou como variável de ambiente."
            )
            
        self.client = client or genai.Client(api_key=api_key)
        
        # Obtém o modelo e aplica o .strip() para remover espaços e quebras de linha acidentais
        env_model = os.getenv("GEMINI_MODEL") or getattr(config, "GEMINI_MODEL", None)
        raw_model = model or env_model or "gemini-2.0-flash"
        self.model = raw_model.strip()
        
        self.db = Database()

    def run(self, question: str) -> str:
        runners = {
            "web_search": web_search_run,
            "fetch_page": fetch_page_run,
        }
        
        config_gen = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            tools=tools_config,
            temperature=0.3,
        )

        chat = self.client.chats.create(model=self.model, config=config_gen)
        response = chat.send_message(question)

        while response.function_calls:
            for function_call in response.function_calls:
                name = function_call.name
                args = dict(function_call.args) if function_call.args else {}

                if name in runners:
                    try:
                        output = runners[name](**args)
                    except Exception as exc:
                        output = f"Erro ao executar a ferramenta {name}: {str(exc)}"

                    response = chat.send_message(
                        types.Part.from_function_response(
                            name=name,
                            response={"result": output}
                        )
                    )

        final_text = response.text or ""
        sources = self.db.extract_sources(final_text)
        self.db.save_question(question, final_text, sources)
        return final_text