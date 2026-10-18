import os
import re
from decimal import Decimal
from pathlib import Path

import pymysql
from dotenv import load_dotenv


load_dotenv(Path(__file__).with_name(".env"))
CENT = Decimal("0.01")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def criar_conexao():
    return pymysql.connect(
        host=os.environ.get("NEXUS_DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("NEXUS_DB_PORT", "3306")),
        user=os.environ.get("NEXUS_DB_USER", "root"),
        password=os.environ.get("NEXUS_DB_PASSWORD", ""),
        database=os.environ.get("NEXUS_DB_NAME", "NEXUS"),
        charset="utf8mb4",
        connect_timeout=5,
        autocommit=False,
    )


def ler_inteiro(prompt, minimo, maximo):
    while True:
        try:
            value = int(input(prompt))
        except ValueError:
            print("Digite um número válido.")
            continue
        if minimo <= value <= maximo:
            return value
        print(f"Digite um número entre {minimo} e {maximo}.")


def formatar_reais(value):
    return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def realizar_compra():
    conexao = None
    cursor = None
    try:
        conexao = criar_conexao()
        cursor = conexao.cursor()
        cursor.execute("SELECT @@innodb_force_recovery")
        recovery = cursor.fetchone()
        if recovery is None or int(recovery[0]) != 0:
            print(
                "\n[ERRO] Compras desativadas: o MySQL do XAMPP está em modo "
                "de recuperação."
            )
            return

        carrinho = []

        while True:
            cursor.execute(
                "SELECT id_produto, nome, tamanho, cor, preco, estoque "
                "FROM produto ORDER BY id_produto"
            )
            produtos = cursor.fetchall()
            print("\n=== PRODUTOS DISPONÍVEIS ===")
            if not produtos:
                print("Não há produtos cadastrados.")
                return

            for produto in produtos:
                produto_id, nome, tamanho, cor, preco, estoque = produto
                status = "ESGOTADO" if estoque == 0 else f"Estoque: {estoque}"
                print(
                    f"ID {produto_id} | {nome} | Tam. {tamanho} | {cor} | "
                    f"{formatar_reais(Decimal(preco))} | {status}"
                )

            print("\n1 - Adicionar produto")
            print("2 - Ver/gerir carrinho")
            print("3 - Finalizar compra")
            print("0 - Sair sem finalizar")
            opcao = ler_inteiro("Escolha: ", 0, 3)

            if opcao == 0:
                return
            if opcao == 1:
                produto_id = ler_inteiro("ID do produto: ", 1, 2_147_483_647)
                quantidade = ler_inteiro("Quantidade: ", 1, 50)
                cursor.execute(
                    """
                    SELECT id_produto, nome, tamanho, cor, preco, estoque
                    FROM produto WHERE id_produto = %s
                    """,
                    (produto_id,),
                )
                produto = cursor.fetchone()
                if produto is None:
                    print("Produto não encontrado.")
                    continue

                produto_id, nome, tamanho, cor, preco, estoque = produto
                item_existente = next(
                    (item for item in carrinho if item["id"] == produto_id),
                    None,
                )
                quantidade_no_carrinho = quantidade + (
                    item_existente["quantidade"] if item_existente else 0
                )
                if estoque < quantidade_no_carrinho:
                    print(f"Estoque insuficiente. Disponível: {estoque}.")
                    continue

                if item_existente:
                    item_existente["quantidade"] = quantidade_no_carrinho
                else:
                    carrinho.append(
                        {
                            "id": produto_id,
                            "nome": nome,
                            "tamanho": tamanho,
                            "cor": cor,
                            "preco": Decimal(preco),
                            "quantidade": quantidade,
                        }
                    )
                print(f"{nome} adicionado ao carrinho.")
                continue

            if opcao == 2:
                if not carrinho:
                    print("Seu carrinho está vazio.")
                    continue
                subtotal = sum(
                    (item["preco"] * item["quantidade"] for item in carrinho),
                    Decimal("0.00"),
                )
                for index, item in enumerate(carrinho, start=1):
                    print(
                        f"{index}. {item['quantidade']}x {item['nome']} "
                        f"(tam. {item['tamanho']}) - "
                        f"{formatar_reais(item['preco'] * item['quantidade'])}"
                    )
                print(f"Subtotal: {formatar_reais(subtotal)}")
                print("1 - Remover item | 2 - Esvaziar carrinho | 3 - Voltar")
                acao = ler_inteiro("Escolha: ", 1, 3)
                if acao == 1:
                    indice = ler_inteiro("Número do item: ", 1, len(carrinho))
                    removido = carrinho.pop(indice - 1)
                    print(f"{removido['nome']} removido.")
                elif acao == 2:
                    carrinho.clear()
                    print("Carrinho esvaziado.")
                continue

            if not carrinho:
                print("Adicione produtos antes de finalizar.")
                continue
            break

        cursor.execute(
            """
            SELECT id, name, fee, estimate, requires_address
            FROM delivery_options
            WHERE active = 1
            ORDER BY display_order, name
            """
        )
        entregas = cursor.fetchall()
        if not entregas:
            print("Nenhuma modalidade de entrega está disponível.")
            return

        print("\n=== ENTREGA ===")
        for index, entrega in enumerate(entregas, start=1):
            print(
                f"{index} - {entrega[1]} | {formatar_reais(Decimal(entrega[2]))} "
                f"| {entrega[3]}"
            )
        entrega_escolhida = entregas[
            ler_inteiro("Escolha a entrega: ", 1, len(entregas)) - 1
        ]
        delivery_id, _, delivery_fee, _, requires_address = entrega_escolhida

        print("\n=== PAGAMENTO ===")
        print("1 - PIX (10% de desconto)")
        print("2 - Cartão")
        print("3 - Boleto")
        payment_method = {
            1: "pix",
            2: "cartao",
            3: "boleto",
        }[ler_inteiro("Escolha a forma de pagamento: ", 1, 3)]

        customer_name = input("Nome para o pedido: ").strip()
        while not customer_name or len(customer_name) > 120:
            print("Informe um nome de até 120 caracteres.")
            customer_name = input("Nome para o pedido: ").strip()

        customer_email = input("E-mail para confirmação: ").strip().lower()
        while not EMAIL_PATTERN.fullmatch(customer_email) or len(customer_email) > 254:
            print("Informe um e-mail válido.")
            customer_email = input("E-mail para confirmação: ").strip().lower()
        phone = input("Telefone (opcional): ").strip()
        if len(phone) > 32:
            print("Telefone muito longo.")
            return

        address = {"street": "", "number": "", "complement": "", "cep": ""}
        if requires_address:
            address["street"] = input("Rua: ").strip()
            address["number"] = input("Número: ").strip()
            address["complement"] = input("Complemento (opcional): ").strip()
            address["cep"] = input("CEP: ").strip()
            if not address["street"] or not address["number"] or not address["cep"]:
                print("Rua, número e CEP são obrigatórios para esta entrega.")
                return

        conexao.begin()
        itens_confirmados = []
        subtotal = Decimal("0.00")
        for item in carrinho:
            cursor.execute(
                """
                SELECT nome, tamanho, preco, estoque
                FROM produto WHERE id_produto = %s FOR UPDATE
                """,
                (item["id"],),
            )
            produto = cursor.fetchone()
            if produto is None or produto[3] < item["quantidade"]:
                raise ValueError(
                    f"Estoque insuficiente para {item['nome']}. "
                    "O carrinho não foi registrado."
                )
            nome, tamanho, preco, _ = produto
            preco = Decimal(preco).quantize(CENT)
            subtotal += preco * item["quantidade"]
            itens_confirmados.append((item["id"], nome, tamanho, preco, item["quantidade"]))

        subtotal = subtotal.quantize(CENT)
        desconto = (
            (subtotal * Decimal("0.10")).quantize(CENT)
            if payment_method == "pix"
            else Decimal("0.00")
        )
        delivery_fee = Decimal(delivery_fee).quantize(CENT)
        total = (subtotal - desconto + delivery_fee).quantize(CENT)

        cursor.execute(
            """
            INSERT INTO venda (
                customer_name, customer_email, customer_phone, delivery_option_id,
                payment_method, subtotal, discount_amount, delivery_fee, total,
                status, delivery_street, delivery_number, delivery_complement, delivery_cep
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'awaiting_payment', %s, %s, %s, %s)
            """,
            (
                customer_name,
                customer_email,
                phone or None,
                delivery_id,
                payment_method,
                subtotal,
                desconto,
                delivery_fee,
                total,
                address["street"] or None,
                address["number"] or None,
                address["complement"] or None,
                address["cep"] or None,
            ),
        )
        order_id = cursor.lastrowid

        for product_id, name, size, price, quantity in itens_confirmados:
            cursor.execute(
                "UPDATE produto SET estoque = estoque - %s "
                "WHERE id_produto = %s AND estoque >= %s",
                (quantity, product_id, quantity),
            )
            if cursor.rowcount != 1:
                raise ValueError(f"O estoque de {name} mudou. Tente novamente.")
            cursor.execute(
                """
                INSERT INTO item_venda (
                    id_venda, id_produto, product_name, size, quantity, unit_price
                ) VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (order_id, product_id, name, size, quantity, price),
            )

        conexao.commit()
        print(f"\nPedido #{order_id} registrado: {formatar_reais(total)}.")
        print("Status: aguardando confirmação do pagamento.")
    except ValueError as erro:
        if conexao is not None:
            conexao.rollback()
        print(f"\n[ERRO] {erro}")
    except pymysql.MySQLError as erro:
        if conexao is not None:
            conexao.rollback()
        print(f"\n[ERRO DE MYSQL] {erro}")
    finally:
        if cursor is not None:
            cursor.close()
        if conexao is not None:
            conexao.close()


if __name__ == "__main__":
    realizar_compra()
