from .agent import Agent


def main() -> None:
    agent = Agent()
    print("Assistente de pesquisa. Digite sua pergunta (ou 'sair' para encerrar).\n")

    while True:
        question = input("> ").strip()
        if question.lower() in {"sair", "exit", "quit"}:
            break
        if not question:
            continue

        resposta = agent.run(question)
        print(f"\n{resposta}\n")


if __name__ == "__main__":
    main()
