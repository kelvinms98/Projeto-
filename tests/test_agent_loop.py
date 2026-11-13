from types import SimpleNamespace

import requests

from agente import agent as agent_module
from agente.agent import Agent


class FakeChat:
    def __init__(self, responses):
        self._responses = iter(responses)

    def send_message(self, _message):
        return next(self._responses)


class FakeChats:
    def __init__(self, responses):
        self.chat = FakeChat(responses)

    def create(self, **_kwargs):
        return self.chat


class FakeClient:
    def __init__(self, responses):
        self.chats = FakeChats(responses)


class FakeDatabase:
    def extract_sources(self, _text):
        return []

    def save_question(self, _question, _answer, _sources):
        return None


def make_agent(monkeypatch, responses):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(agent_module.config, "GEMINI_API_KEY", None)
    monkeypatch.setattr(agent_module, "Database", FakeDatabase)
    return Agent(client=FakeClient(responses), model="fake-model")


def function_response(name, args):
    return SimpleNamespace(function_calls=[SimpleNamespace(name=name, args=args)], text=None)


def final_response(text):
    return SimpleNamespace(function_calls=[], text=text)


def test_run_returns_text_when_gemini_does_not_use_tools(monkeypatch):
    agent = make_agent(monkeypatch, [final_response("Ola!")])

    assert agent.run("oi") == "Ola!"


def test_run_executes_tool_and_returns_final_answer(monkeypatch):
    agent = make_agent(
        monkeypatch,
        [
            function_response("web_search", {"query": "python"}),
            final_response("Resposta final"),
        ],
    )
    monkeypatch.setattr(agent_module, "web_search_run", lambda query: f"resultados para {query}")

    assert agent.run("pesquise sobre python") == "Resposta final"


def test_run_marks_tool_error_and_continues(monkeypatch):
    agent = make_agent(
        monkeypatch,
        [
            function_response("fetch_page", {"url": "https://exemplo.invalido"}),
            final_response("Nao consegui acessar a pagina."),
        ],
    )

    def failing_runner(url):
        raise requests.ConnectionError(f"falha de conexao: {url}")

    monkeypatch.setattr(agent_module, "fetch_page_run", failing_runner)

    assert agent.run("leia essa pagina") == "Nao consegui acessar a pagina."
