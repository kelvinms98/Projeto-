from types import SimpleNamespace

from agente import agent as agent_module
from agente.agent import Agent


class FakeMessages:
    def __init__(self, responses):
        self._responses = iter(responses)

    def create(self, **kwargs):
        return next(self._responses)


class FakeClient:
    def __init__(self, responses):
        self.messages = FakeMessages(responses)


def text_block(text):
    return SimpleNamespace(type="text", text=text)


def tool_use_block(id_, name, input_):
    return SimpleNamespace(type="tool_use", id=id_, name=name, input=input_)


def test_run_returns_text_when_claude_does_not_use_tools():
    response = SimpleNamespace(stop_reason="end_turn", content=[text_block("Ola!")])
    agent = Agent(client=FakeClient([response]), model="fake-model")

    assert agent.run("oi") == "Ola!"


def test_run_executes_tool_and_returns_final_answer(monkeypatch):
    tool_call = SimpleNamespace(
        stop_reason="tool_use",
        content=[tool_use_block("call_1", "web_search", {"query": "python"})],
    )
    final_response = SimpleNamespace(stop_reason="end_turn", content=[text_block("Resposta final")])
    agent = Agent(client=FakeClient([tool_call, final_response]), model="fake-model")

    monkeypatch.setitem(agent_module.RUNNERS, "web_search", lambda query: f"resultados para {query}")

    assert agent.run("pesquise sobre python") == "Resposta final"


def test_run_marks_tool_error_and_continues(monkeypatch):
    tool_call = SimpleNamespace(
        stop_reason="tool_use",
        content=[tool_use_block("call_1", "fetch_page", {"url": "https://exemplo.invalido"})],
    )
    final_response = SimpleNamespace(stop_reason="end_turn", content=[text_block("Nao consegui acessar a pagina.")])
    agent = Agent(client=FakeClient([tool_call, final_response]), model="fake-model")

    def failing_runner(url):
        raise ValueError("falha de conexao")

    monkeypatch.setitem(agent_module.RUNNERS, "fetch_page", failing_runner)

    assert agent.run("leia essa pagina") == "Nao consegui acessar a pagina."
