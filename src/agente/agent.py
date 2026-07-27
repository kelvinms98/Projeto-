from anthropic import Anthropic

from . import config
from .tools import RUNNERS, SCHEMAS

SYSTEM_PROMPT = (
    "Voce e um assistente de pesquisa. Use as ferramentas disponiveis para buscar "
    "na web e ler paginas antes de responder perguntas que dependam de informacao "
    "externa. Sempre cite as URLs das fontes que usou na resposta final."
)


class Agent:
    def __init__(self, client: Anthropic | None = None, model: str | None = None):
        self.client = client or Anthropic(api_key=config.ANTHROPIC_API_KEY)
        self.model = model or config.ANTHROPIC_MODEL

    def run(self, question: str) -> str:
        messages = [{"role": "user", "content": question}]

        while True:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                tools=SCHEMAS,
                messages=messages,
            )

            if response.stop_reason != "tool_use":
                return "".join(
                    block.text for block in response.content if block.type == "text"
                )

            messages.append({"role": "assistant", "content": response.content})

            tool_results = [
                self._execute_tool(block)
                for block in response.content
                if block.type == "tool_use"
            ]
            messages.append({"role": "user", "content": tool_results})

    @staticmethod
    def _execute_tool(block) -> dict:
        runner = RUNNERS[block.name]
        try:
            output = runner(**block.input)
            return {"type": "tool_result", "tool_use_id": block.id, "content": output}
        except Exception as exc:  # noqa: BLE001 - erro da tool vira tool_result, nao derruba o agente
            return {
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": str(exc),
                "is_error": True,
            }
