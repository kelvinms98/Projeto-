import json
import os
import re
from decimal import Decimal
from getpass import getpass
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen


def carregar_env_local(path):
    """Lê as variáveis usadas pelo checkout sem exigir bibliotecas externas."""
    try:
        lines = Path(path).read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key) or key in os.environ:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        os.environ[key] = value


carregar_env_local(Path(__file__).with_name(".env"))
CENT = Decimal("0.01")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
API_URL = os.environ.get("NEXUS_API_URL", "http://127.0.0.1:8081").rstrip("/")
API_CSRF_TOKEN = ""
CURRENT_CUSTOMER = None
API_OPENER = build_opener(HTTPCookieProcessor(CookieJar()))
CEP_API_URL = os.environ.get(
    "NEXUS_CEP_API_URL",
    "https://viacep.com.br/ws",
).rstrip("/")


class ApiError(Exception):
    pass


def requisitar_api(path, payload=None):
    global API_CSRF_TOKEN
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"} if body is not None else {}
    if body is not None and API_CSRF_TOKEN:
        headers["X-CSRF-Token"] = API_CSRF_TOKEN
    request = Request(
        f"{API_URL}{path}",
        data=body,
        headers=headers,
        method="POST" if body is not None else "GET",
    )
    try:
        with API_OPENER.open(request, timeout=8) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        try:
            details = json.loads(error.read().decode("utf-8"))
            message = (
                details.get("error", f"Servidor respondeu HTTP {error.code}.")
                if isinstance(details, dict)
                else f"Servidor respondeu HTTP {error.code}."
            )
        except (json.JSONDecodeError, UnicodeDecodeError):
            message = f"Servidor respondeu HTTP {error.code}."
        raise ApiError(message) from error
    except (URLError, TimeoutError, OSError) as error:
        raise ApiError(
            "Não foi possível conectar ao servidor local. Inicie a loja com run_web.bat "
            "e tente novamente."
        ) from error
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ApiError("O servidor retornou uma resposta inválida.") from error

    if not isinstance(result, dict):
        raise ApiError("O servidor retornou uma resposta inválida.")
    if isinstance(result.get("data"), dict) and result["data"].get("csrfToken"):
        API_CSRF_TOKEN = result["data"]["csrfToken"]
    return result


def buscar_endereco_cep(cep):
    """Consulta o ViaCEP, serviço usado pelo buscador do projeto Te Achando."""
    digits = re.sub(r"\D", "", cep)
    if len(digits) != 8:
        raise ApiError("Informe um CEP válido com 8 números.")
    request = Request(
        f"{CEP_API_URL}/{digits}/json/",
        headers={"Accept": "application/json", "User-Agent": "NEXUS-Store/1.0"},
    )
    try:
        with urlopen(request, timeout=8) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        try:
            details = json.loads(error.read().decode("utf-8"))
            message = (
                details.get("erro", "CEP não encontrado.")
                if isinstance(details, dict) and isinstance(details.get("erro"), str)
                else "CEP não encontrado."
            )
        except (json.JSONDecodeError, UnicodeDecodeError):
            message = "Não foi possível consultar esse CEP."
        raise ApiError(message) from error
    except (URLError, TimeoutError, OSError) as error:
        raise ApiError("Não foi possível conectar ao serviço de busca de CEP.") from error
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ApiError("O serviço de CEP retornou uma resposta inválida.") from error

    if not isinstance(result, dict):
        raise ApiError("O serviço de CEP retornou uma resposta inválida.")
    if result.get("erro"):
        raise ApiError("CEP não encontrado.")
    if not result.get("logradouro"):
        raise ApiError("O serviço não encontrou o endereço desse CEP.")
    # Mantém os nomes de campos do endpoint do Te Achando para o restante do checkout.
    result["cidade"] = result.get("localidade", result.get("cidade", ""))
    return result


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
    amount = Decimal(str(value)).quantize(CENT)
    return f"R$ {amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def selecionar_variante(available_products):
    products_by_name = {}
    for product in available_products:
        products_by_name.setdefault(product["name"], []).append(product)
    names = list(products_by_name)
    if not names:
        print("Não há variantes com estoque e preço cadastrados.")
        return None

    print("\n=== ESCOLHA O PRODUTO ===")
    for index, name in enumerate(names, start=1):
        variants = products_by_name[name]
        print(f"{index} - {name} ({len(variants)} variantes disponíveis)")
    name = names[ler_inteiro("Produto: ", 1, len(names)) - 1]
    variants = products_by_name[name]

    sizes = list(dict.fromkeys(product["size"] for product in variants))
    print(f"\n=== ESCOLHA O TAMANHO DE {name} ===")
    for index, size in enumerate(sizes, start=1):
        print(f"{index} - {size}")
    size = sizes[ler_inteiro("Tamanho: ", 1, len(sizes)) - 1]
    size_variants = [product for product in variants if product["size"] == size]

    colors = list(dict.fromkeys(product["color"] or "Única" for product in size_variants))
    print(f"\n=== ESCOLHA A COR — {name}, TAMANHO {size} ===")
    for index, color in enumerate(colors, start=1):
        product = next(
            item for item in size_variants
            if (item["color"] or "Única") == color
        )
        print(
            f"{index} - {color} | {formatar_reais(product['price'])} "
            f"| Estoque: {product['stock']}"
        )
    color = colors[ler_inteiro("Cor: ", 1, len(colors)) - 1]
    return next(
        product for product in size_variants
        if (product["color"] or "Única") == color
    )

def autenticar_cliente():
    global CURRENT_CUSTOMER
    try:
        session = requisitar_api("/api/customer/session").get("data")
    except ApiError as error:
        print(f"\n[ERRO] {error}")
        return False
    if not isinstance(session, dict):
        print("\n[ERRO] O servidor retornou uma sessão de cliente inválida.")
        return False
    if session.get("customer"):
        CURRENT_CUSTOMER = session["customer"]
        print(f"Conectado como {CURRENT_CUSTOMER['name']} ({CURRENT_CUSTOMER['email']}).")
        return True

    while True:
        print("\n=== ACESSO DO CLIENTE ===")
        print("1 - Entrar")
        print("2 - Criar conta")
        print("0 - Sair")
        option = ler_inteiro("Escolha: ", 0, 2)
        if option == 0:
            return False

        email = input("E-mail: ").strip().lower()
        if not EMAIL_PATTERN.fullmatch(email) or len(email) > 254:
            print("Informe um e-mail válido.")
            continue
        password = getpass("Senha: ")

        if option == 1:
            payload = {"email": email, "password": password}
            endpoint = "/api/customer/login"
        else:
            name = input("Nome completo: ").strip()
            if not name or len(name) > 120:
                print("Informe um nome completo de até 120 caracteres.")
                continue
            if len(password) < 12:
                print("A senha precisa ter pelo menos 12 caracteres.")
                continue
            if getpass("Confirme a senha: ") != password:
                print("As senhas não são iguais.")
                continue
            payload = {"full_name": name, "email": email, "password": password}
            endpoint = "/api/customer/signup"

        try:
            result = requisitar_api(endpoint, payload).get("data")
        except ApiError as error:
            print(f"[ERRO] {error}")
            continue
        if not isinstance(result, dict) or not isinstance(result.get("customer"), dict):
            print("[ERRO] O servidor retornou dados de conta inválidos.")
            return False
        CURRENT_CUSTOMER = result["customer"]
        print(f"Conectado como {CURRENT_CUSTOMER['name']}.")
        return True


def realizar_compra():
    try:
        products = requisitar_api("/api/products").get("data")
        deliveries = requisitar_api("/api/delivery-options").get("data")
    except ApiError as error:
        print(f"\n[ERRO] {error}")
        return

    if not isinstance(products, list) or not isinstance(deliveries, list):
        print("\n[ERRO] O servidor retornou dados inválidos para a loja.")
        return

    cart = []
    while True:
        print("\n=== PRODUTOS DISPONÍVEIS ===")
        if not products:
            print("Não há produtos cadastrados.")
            return
        for product in products:
            status = (
                "ESGOTADO" if product["stock"] == 0
                else "SEM PREÇO" if product["price"] is None
                else f"Estoque: {product['stock']}"
            )
            print(
                f"{product['name']} | Tam. {product['size']} | "
                f"{product['color'] or 'Única'} | "
                f"{formatar_reais(product['price']) if product['price'] is not None else 'Preço não cadastrado'} | {status}"
            )

        print("\n1 - Adicionar produto")
        print("2 - Ver/gerir carrinho")
        print("3 - Finalizar compra")
        print("0 - Sair sem finalizar")
        option = ler_inteiro("Escolha: ", 0, 3)

        if option == 0:
            return
        if option == 1:
            available_products = [
                product for product in products
                if product["stock"] > 0 and product["price"] is not None
            ]
            product = selecionar_variante(available_products)
            if product is None:
                continue
            quantity = ler_inteiro("Quantidade: ", 1, 50)
            existing = next(
                (item for item in cart if item["productId"] == product["id"]),
                None,
            )
            cart_quantity = quantity + (existing["quantity"] if existing else 0)
            if cart_quantity > product["stock"]:
                print(f"Estoque insuficiente. Disponível: {product['stock']}.")
                continue
            if existing:
                existing["quantity"] = cart_quantity
            else:
                cart.append({
                    "productId": product["id"],
                    "name": product["name"],
                    "size": product["size"],
                    "color": product["color"],
                    "price": Decimal(str(product["price"])),
                    "quantity": quantity,
                })
            print(f"{product['name']} adicionado ao carrinho.")
            continue

        if option == 2:
            if not cart:
                print("Seu carrinho está vazio.")
                continue
            subtotal = sum(
                (item["price"] * item["quantity"] for item in cart),
                Decimal("0.00"),
            )
            for index, item in enumerate(cart, start=1):
                print(
                    f"{index}. {item['quantity']}x {item['name']} "
                    f"(tam. {item['size']}, cor {item['color']}) - "
                    f"{formatar_reais(item['price'] * item['quantity'])}"
                )
            print(f"Subtotal: {formatar_reais(subtotal)}")
            print("1 - Remover item | 2 - Esvaziar carrinho | 3 - Voltar")
            action = ler_inteiro("Escolha: ", 1, 3)
            if action == 1:
                index = ler_inteiro("Número do item: ", 1, len(cart))
                removed = cart.pop(index - 1)
                print(f"{removed['name']} removido.")
            elif action == 2:
                cart.clear()
                print("Carrinho esvaziado.")
            continue

        if not cart:
            print("Adicione produtos antes de finalizar.")
            continue
        if not deliveries:
            print("Nenhuma modalidade de entrega está disponível.")
            return
        break

    print("\n=== CÁLCULO DO FRETE ===")
    cep = input("CEP de destino (deixe vazio para retirada na loja): ").strip()
    shipping_quote = None
    cep_address = None
    if cep:
        if not re.fullmatch(r"\d{5}-?\d{3}", cep):
            print("CEP inválido. Entregas com endereço não serão exibidas.")
        else:
            try:
                cep_address = buscar_endereco_cep(cep)
                print(
                    "Endereço encontrado: "
                    f"{cep_address['logradouro']}, {cep_address.get('bairro', '')}, "
                    f"{cep_address.get('cidade', '')} - {cep_address.get('uf', '')}."
                )
            except ApiError as error:
                print(f"[AVISO] Não foi possível localizar o endereço pelo CEP: {error}")
            try:
                shipping_quote = requisitar_api(
                    "/api/shipping-quote",
                    {"cep": cep},
                ).get("data")
                print(
                    f"Frete: {formatar_reais(shipping_quote['baseFee'])} + "
                    f"taxa de serviço: {formatar_reais(shipping_quote['serviceFee'])} = "
                    f"{formatar_reais(shipping_quote['fee'])}."
                )
            except ApiError as error:
                print(f"[AVISO] Não foi possível calcular o frete: {error}")
                print("Você ainda pode escolher a retirada na loja.")
    delivery_choices = [
        delivery for delivery in deliveries
        if not delivery["requires_address"] or shipping_quote
    ]
    if not delivery_choices:
        print("Não há modalidades de entrega disponíveis.")
        return

    print("\n=== ENTREGA ===")
    for index, delivery in enumerate(delivery_choices, start=1):
        fee = shipping_quote["fee"] if delivery["requires_address"] else delivery["fee"]
        estimate = (
            "taxa fixa: frete + serviço"
            if delivery["requires_address"] and shipping_quote
            else delivery["estimate"]
        )
        print(
            f"{index} - {delivery['name']} | {formatar_reais(fee)} | {estimate}"
        )
    delivery = delivery_choices[
        ler_inteiro("Escolha a entrega: ", 1, len(delivery_choices)) - 1
    ]

    print("\n=== PAGAMENTO ===")
    print("1 - PIX (10% de desconto)")
    print("2 - Cartão")
    print("3 - Boleto")
    payment_method = {
        1: "pix",
        2: "cartao",
        3: "boleto",
    }[ler_inteiro("Escolha a forma de pagamento: ", 1, 3)]

    customer_name = CURRENT_CUSTOMER["name"]
    customer_email = CURRENT_CUSTOMER["email"]

    phone = input("Telefone (opcional): ").strip()
    if len(phone) > 32:
        print("Telefone muito longo.")
        return

    address = {"street": "", "number": "", "complement": "", "cep": cep}
    if delivery["requires_address"]:
        street_default = cep_address.get("logradouro", "") if cep_address else ""
        street_prompt = f"Rua [{street_default}]: " if street_default else "Rua: "
        address["street"] = input(street_prompt).strip() or street_default
        address["number"] = input("Número: ").strip()
        address["complement"] = input("Complemento (opcional): ").strip()
        if not address["street"] or not address["number"] or not address["cep"]:
            print("Rua, número e CEP são obrigatórios para esta entrega.")
            return

    payload = {
        "customerName": customer_name,
        "customerEmail": customer_email,
        "phone": phone,
        "paymentMethod": payment_method,
        "deliveryOptionId": delivery["id"],
        **address,
        "items": [
            {
                "productId": item["productId"],
                "name": item["name"],
                "size": item["size"],
                "color": item["color"],
                "quantity": item["quantity"],
            }
            for item in cart
        ],
    }
    try:
        result = requisitar_api("/api/orders", payload)
    except ApiError as error:
        print(f"\n[ERRO] {error}")
        return

    print(f"\nPedido #{result['orderId']} registrado: {formatar_reais(result['total'])}.")
    print("Status: aguardando confirmação do pagamento.")
    if result.get("trackingToken"):
        tracking_url = f"{API_URL}/acompanhar-pedido.html?token={result['trackingToken']}"
        print(f"Acompanhe o pedido: {tracking_url}")
    if result.get("emailSent"):
        print(f"Confirmação enviada para {customer_email}.")
    elif not result.get("emailConfigured", True):
        print("[INFO] O e-mail foi salvo no pedido; a confirmação automática está desativada.")
    else:
        print(f"[AVISO] {result.get('emailMessage', 'O e-mail de confirmação não foi enviado.')}")


def menu_compras():
    if not autenticar_cliente():
        return
    while True:
        try:
            realizar_compra()
        except (EOFError, KeyboardInterrupt):
            print("\nSistema de compras encerrado.")
            return

        while True:
            try:
                option = input("\n1 - Fazer outra compra | 0 - Sair\nEscolha: ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\nSistema de compras encerrado.")
                return
            if option == "1":
                break
            if option == "0":
                print("Sistema de compras encerrado.")
                return
            print("Escolha 1 para nova compra ou 0 para sair.")


if __name__ == "__main__":
    menu_compras()
