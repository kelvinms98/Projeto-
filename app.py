import os
import re
import secrets
from decimal import Decimal
from pathlib import Path

import pymysql
from dotenv import load_dotenv
from flask import Flask, abort, jsonify, redirect, render_template, request, send_from_directory, session, url_for


BASE_DIR = Path(__file__).resolve().parent
TEMPLATE_DIR = BASE_DIR / "templates"
load_dotenv(BASE_DIR / ".env")
CENT = Decimal("0.01")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PUBLIC_EXTENSIONS = {".css", ".html", ".jpg", ".jpeg", ".js", ".png", ".svg", ".webp", ".woff", ".woff2"}
PRIVATE_DIRECTORIES = {"include", "src", "src.c", "supabase", "templates", "tests"}

app = Flask(__name__, template_folder=str(TEMPLATE_DIR))
app.secret_key = os.environ.get("NEXUS_SECRET_KEY") or secrets.token_hex(32)


class OrderConflict(Exception):
    pass


def _csrf_token():
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return token


def _valid_csrf_token():
    expected = session.get("csrf_token", "")
    supplied = request.form.get("csrf_token", "")
    return bool(expected and supplied and secrets.compare_digest(expected, supplied))


def _set_dashboard_notice(message, kind="error"):
    session["dashboard_notice"] = {"message": message, "kind": kind}


def criar_conexao():
    return pymysql.connect(
        host=os.environ.get("NEXUS_DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("NEXUS_DB_PORT", "3306")),
        user=os.environ.get("NEXUS_DB_USER", "root"),
        password=os.environ.get("NEXUS_DB_PASSWORD", ""),
        database=os.environ.get("NEXUS_DB_NAME", "NEXUS"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
        connect_timeout=5,
    )


@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/api/delivery-options")
def delivery_options():
    connection = None
    try:
        connection = criar_conexao()
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, name, fee, estimate, requires_address
                FROM delivery_options
                WHERE active = 1
                ORDER BY display_order, name
                """
            )
            options = cursor.fetchall()
        return jsonify(
            data=[
                {
                    **option,
                    "fee": str(Decimal(option["fee"]).quantize(CENT)),
                    "requires_address": bool(option["requires_address"]),
                }
                for option in options
            ]
        )
    except pymysql.err.ProgrammingError as exc:
        app.logger.exception("Could not load delivery options from MySQL")
        if exc.args and exc.args[0] == 1146:
            return jsonify(
                error=(
                    "A tabela delivery_options não existe no banco. Faça backup e aplique "
                    "bancodedados.sql somente após confirmar a recuperação normal do InnoDB."
                )
            ), 503
        return jsonify(error="Não foi possível carregar as opções de entrega. Verifique o MySQL do XAMPP."), 503
    except pymysql.MySQLError:
        app.logger.exception("Could not load delivery options from MySQL")
        return jsonify(error="Não foi possível carregar as opções de entrega. Verifique o MySQL do XAMPP."), 503
    finally:
        if connection is not None:
            connection.close()


@app.get("/api/products")
def products():
    connection = None
    try:
        connection = criar_conexao()
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id_produto, nome, tamanho, cor, preco, estoque
                FROM produto
                ORDER BY nome, cor, tamanho, id_produto
                """
            )
            products = cursor.fetchall()
        return jsonify(
            data=[
                {
                    "id": int(product["id_produto"]),
                    "name": product["nome"],
                    "size": product["tamanho"],
                    "color": product["cor"],
                    "price": (
                        str(Decimal(product["preco"]).quantize(CENT))
                        if product["preco"] is not None
                        else None
                    ),
                    "stock": int(product["estoque"]),
                }
                for product in products
            ]
        )
    except pymysql.MySQLError:
        app.logger.exception("Could not load products from MySQL")
        return jsonify(error="Não foi possível carregar os produtos do MySQL do XAMPP."), 503
    finally:
        if connection is not None:
            connection.close()


@app.post("/api/orders")
def create_order():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(error="Envie os dados do pedido em formato JSON."), 400

    customer_name = str(payload.get("customerName") or "").strip()
    customer_email = str(payload.get("customerEmail") or "").strip().lower()
    phone = str(payload.get("phone") or "").strip()
    payment_method = str(payload.get("paymentMethod") or "").strip()
    delivery_id = str(payload.get("deliveryOptionId") or "").strip()
    items = payload.get("items")

    if not customer_name or len(customer_name) > 120:
        return jsonify(error="Informe um nome válido para o pedido."), 400
    if len(customer_email) > 254 or not EMAIL_PATTERN.fullmatch(customer_email):
        return jsonify(error="Informe um e-mail válido para receber a confirmação do pedido."), 400
    if len(phone) > 32:
        return jsonify(error="O telefone informado é muito longo."), 400
    if payment_method not in {"pix", "cartao", "boleto"}:
        return jsonify(error="Selecione uma forma de pagamento válida."), 400
    if not delivery_id or len(delivery_id) > 64:
        return jsonify(error="Selecione uma modalidade de entrega."), 400
    if not isinstance(items, list) or not items or len(items) > 20:
        return jsonify(error="O carrinho está vazio ou tem itens demais."), 400

    quantities = {}
    for item in items:
        if not isinstance(item, dict):
            return jsonify(error="Há um item inválido no carrinho."), 400
        name = item.get("name")
        size = item.get("size")
        color = item.get("color")
        product_id = item.get("productId")
        quantity = item.get("quantity")
        if (
            not isinstance(name, str)
            or not name.strip()
            or len(name.strip()) > 100
            or not isinstance(size, str)
            or not size.strip()
            or len(size.strip()) > 20
            or (color is not None and (not isinstance(color, str) or len(color) > 30))
            or (
                product_id is not None
                and (
                    isinstance(product_id, bool)
                    or not isinstance(product_id, int)
                    or product_id < 1
                )
            )
            or isinstance(quantity, bool)
            or not isinstance(quantity, int)
            or quantity < 1
            or quantity > 50
        ):
            return jsonify(error="Confira o produto, o tamanho e a quantidade."), 400
        key = (product_id, name.strip(), size.strip(), color)
        quantities[key] = quantities.get(key, 0) + quantity
        if quantities[key] > 50:
            return jsonify(error="A quantidade máxima por produto é 50 unidades."), 400

    connection = None
    try:
        connection = criar_conexao()
        with connection.cursor() as cursor:
            cursor.execute("SELECT @@innodb_force_recovery AS force_recovery")
            recovery = cursor.fetchone()
        if recovery is None or int(recovery["force_recovery"]) != 0:
            return jsonify(
                error=(
                    "Compras temporariamente indisponíveis enquanto o MySQL do XAMPP "
                    "estiver em modo de recuperação."
                )
            ), 503

        connection.begin()
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, name, fee, estimate, requires_address
                FROM delivery_options
                WHERE id = %s AND active = 1
                """,
                (delivery_id,),
            )
            delivery = cursor.fetchone()
            if delivery is None:
                raise OrderConflict("A modalidade de entrega selecionada não está disponível.")

            address = {
                "street": str(payload.get("street") or "").strip(),
                "number": str(payload.get("number") or "").strip(),
                "complement": str(payload.get("complement") or "").strip(),
                "cep": str(payload.get("cep") or "").strip(),
            }
            if delivery["requires_address"] and (
                not address["street"] or not address["number"] or not address["cep"]
            ):
                raise ValueError("Preencha rua, número e CEP para esta modalidade de entrega.")
            if any(len(value) > limit for value, limit in (
                (address["street"], 160),
                (address["number"], 20),
                (address["complement"], 120),
                (address["cep"], 12),
            )):
                raise ValueError("Confira os dados do endereço.")

            selected_products = []
            subtotal = Decimal("0.00")
            for (product_id, name, size, color), quantity in quantities.items():
                if product_id is not None:
                    cursor.execute(
                        """
                        SELECT id_produto, nome, tamanho, cor, preco, estoque
                        FROM produto
                        WHERE id_produto = %s
                        FOR UPDATE
                        """,
                        (product_id,),
                    )
                else:
                    product_query = """
                        SELECT id_produto, nome, tamanho, cor, preco, estoque
                        FROM produto
                        WHERE nome = %s AND tamanho = %s
                    """
                    parameters = [name, size]
                    if color is not None:
                        product_query += " AND cor = %s"
                        parameters.append(color)
                    product_query += " ORDER BY id_produto LIMIT 2 FOR UPDATE"
                    cursor.execute(product_query, parameters)
                matching_products = cursor.fetchall()
                if not matching_products:
                    raise OrderConflict(f"{name} no tamanho {size} não está disponível.")
                if len(matching_products) > 1:
                    raise OrderConflict(
                        f"Há mais de uma variante de {name} no tamanho {size}. "
                        "Selecione a cor e tente novamente."
                    )
                product = matching_products[0]
                if (
                    product["nome"] != name
                    or product["tamanho"] != size
                    or (color is not None and product["cor"] != color)
                ):
                    raise OrderConflict("A variante do produto mudou. Atualize o carrinho.")
                if product["preco"] is None:
                    raise OrderConflict(f"O preço de {name} no tamanho {size} não está cadastrado.")
                if int(product["estoque"]) < quantity:
                    raise OrderConflict(f"Estoque insuficiente para {name} no tamanho {size}.")
                price = Decimal(product["preco"]).quantize(CENT)
                subtotal += price * quantity
                selected_products.append((product, quantity, price))

            subtotal = subtotal.quantize(CENT)
            discount = (subtotal * Decimal("0.10")).quantize(CENT) if payment_method == "pix" else Decimal("0.00")
            delivery_fee = Decimal(delivery["fee"]).quantize(CENT)
            total = (subtotal - discount + delivery_fee).quantize(CENT)

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
                    discount,
                    delivery_fee,
                    total,
                    address["street"] or None,
                    address["number"] or None,
                    address["complement"] or None,
                    address["cep"] or None,
                ),
            )
            order_id = cursor.lastrowid

            for product, quantity, price in selected_products:
                cursor.execute(
                    "UPDATE produto SET estoque = estoque - %s WHERE id_produto = %s AND estoque >= %s",
                    (quantity, product["id_produto"], quantity),
                )
                if cursor.rowcount != 1:
                    raise OrderConflict(f"O estoque de {product['nome']} acabou durante a finalização.")
                cursor.execute(
                    """
                    INSERT INTO item_venda (id_venda, id_produto, product_name, size, quantity, unit_price)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (order_id, product["id_produto"], product["nome"], product["tamanho"], quantity, price),
                )

        connection.commit()
        return jsonify(
            orderId=order_id,
            total=str(total),
            status="awaiting_payment",
            message="Pedido registrado e aguardando a confirmação do pagamento.",
        ), 201
    except ValueError as exc:
        if connection is not None:
            connection.rollback()
        return jsonify(error=str(exc)), 400
    except OrderConflict as exc:
        if connection is not None:
            connection.rollback()
        return jsonify(error=str(exc)), 409
    except pymysql.MySQLError:
        if connection is not None:
            connection.rollback()
        app.logger.exception("Could not create the order in MySQL")
        return jsonify(error="Não foi possível registrar o pedido. Verifique a conexão com o MySQL e tente novamente."), 503
    finally:
        if connection is not None:
            connection.close()


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        if not _valid_csrf_token():
            return render_template(
                "login.html",
                erro="A sessão expirou. Atualize a página e tente novamente.",
                csrf_token=_csrf_token(),
            ), 400

        email = (request.form.get("email") or "").strip()
        password = request.form.get("senha") or ""
        if not email or not password:
            return render_template(
                "login.html",
                erro="Preencha o e-mail e a senha.",
                csrf_token=_csrf_token(),
            )

        connection = None
        try:
            connection = criar_conexao()
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id_funcionario, nome FROM funcionarios
                    WHERE email = %s
                      AND (senha = SHA2(%s, 256) OR (CHAR_LENGTH(senha) < 64 AND senha = %s))
                    """,
                    (email, password, password),
                )
                user = cursor.fetchone()
            if user:
                session.clear()
                session["usuario"] = user["nome"]
                session["funcionario_id"] = user["id_funcionario"]
                _csrf_token()
                return redirect(url_for("dashboard"))
            return render_template(
                "login.html",
                erro="E-mail ou senha incorretos.",
                csrf_token=_csrf_token(),
            )
        except pymysql.MySQLError:
            app.logger.exception("Staff login failed because MySQL is unavailable")
            return render_template(
                "login.html",
                erro="Não foi possível conectar ao banco de dados do XAMPP.",
                csrf_token=_csrf_token(),
            ), 503
        finally:
            if connection is not None:
                connection.close()

    if "usuario" in session:
        return redirect(url_for("dashboard"))
    return render_template("login.html", csrf_token=_csrf_token())


@app.post("/logout")
def logout():
    if not _valid_csrf_token():
        abort(400)
    session.clear()
    return redirect(url_for("login"))


@app.get("/staff")
def staff_portal():
    return redirect(url_for("dashboard"))


@app.get("/dashboard")
def dashboard():
    if "usuario" not in session:
        return redirect(url_for("login"))

    connection = None
    try:
        connection = criar_conexao()
        with connection.cursor() as cursor:
            cursor.execute("SELECT @@innodb_force_recovery AS force_recovery")
            recovery = cursor.fetchone()
            recovery_level = int(recovery["force_recovery"]) if recovery else 1
            cursor.execute("SELECT id_funcionario, nome, email, cargo FROM funcionarios ORDER BY nome")
            employees = cursor.fetchall()
            cursor.execute(
                """
                SELECT id_produto, nome, tamanho, cor, preco, estoque
                FROM produto
                ORDER BY estoque ASC, nome, tamanho, cor
                LIMIT 100
                """
            )
            products = cursor.fetchall()

            suppliers = []
            supplies = []
            purchase_orders = []
            procurement_schema_missing = False
            try:
                cursor.execute(
                    """
                    SELECT id, code, name, category, contact_name, email, phone,
                           lead_time_days, is_demo
                    FROM suppliers
                    WHERE active = 1
                    ORDER BY name
                    """
                )
                suppliers = cursor.fetchall()
                cursor.execute(
                    """
                    SELECT i.id, i.sku, i.name, i.category, i.unit, i.current_stock,
                           i.minimum_stock, i.unit_cost, i.supplier_id, s.name AS supplier_name
                    FROM supplies AS i
                    JOIN suppliers AS s ON s.id = i.supplier_id
                    WHERE i.active = 1 AND s.active = 1
                    ORDER BY (i.current_stock <= i.minimum_stock) DESC, i.name
                    """
                )
                supplies = cursor.fetchall()
                cursor.execute(
                    """
                    SELECT po.id, s.name AS supplier_name, po.status, po.total,
                           po.created_at, po.notes, COUNT(poi.id) AS item_count
                    FROM purchase_orders AS po
                    JOIN suppliers AS s ON s.id = po.supplier_id
                    LEFT JOIN purchase_order_items AS poi ON poi.order_id = po.id
                    GROUP BY po.id, s.name, po.status, po.total, po.created_at, po.notes
                    ORDER BY po.created_at DESC, po.id DESC
                    LIMIT 10
                    """
                )
                purchase_orders = cursor.fetchall()
            except pymysql.err.ProgrammingError as exc:
                if not exc.args or exc.args[0] != 1146:
                    raise
                procurement_schema_missing = True

        notice = session.pop("dashboard_notice", None)
        demo_suppliers = [
            {"name": "Fio & Trama Têxtil", "category": "Tecidos", "email": "compras@fioetrama.example"},
            {"name": "Cor & Forma Estamparia", "category": "Estamparia", "email": "pedidos@coreforma.example"},
            {"name": "Embalagem Circular", "category": "Embalagens", "email": "vendas@embalagemcircular.example"},
        ]
        return render_template(
            "dashboard.html",
            nome=session["usuario"],
            funcionarios=employees,
            produtos=products,
            fornecedores=suppliers,
            materiais=supplies,
            pedidos_compra=purchase_orders,
            fornecedores_demo=demo_suppliers,
            esquema_compras_ausente=procurement_schema_missing,
            modo_recuperacao=recovery_level,
            csrf_token=_csrf_token(),
            aviso=notice,
        )
    except pymysql.MySQLError:
        app.logger.exception("Could not load the staff dashboard")
        return "Não foi possível carregar o painel. Verifique o MySQL do XAMPP.", 503
    finally:
        if connection is not None:
            connection.close()


@app.post("/dashboard/purchases")
def create_supply_purchase():
    if "usuario" not in session:
        return redirect(url_for("login"))
    if not _valid_csrf_token():
        abort(400)

    try:
        supply_id = int(request.form.get("supply_id", ""))
        quantity = int(request.form.get("quantity", ""))
    except (TypeError, ValueError):
        _set_dashboard_notice("Selecione um material e informe uma quantidade inteira.")
        return redirect(url_for("dashboard"))
    if supply_id < 1 or not 1 <= quantity <= 10000:
        _set_dashboard_notice("A quantidade deve estar entre 1 e 10.000 unidades.")
        return redirect(url_for("dashboard"))

    connection = None
    transaction_started = False
    try:
        connection = criar_conexao()
        with connection.cursor() as cursor:
            cursor.execute("SELECT @@innodb_force_recovery AS force_recovery")
            recovery = cursor.fetchone()
            if recovery is None or int(recovery["force_recovery"]) != 0:
                _set_dashboard_notice(
                    "Banco em modo de recuperação: pedidos e alterações de estoque estão bloqueados."
                )
                return redirect(url_for("dashboard"))

        connection.begin()
        transaction_started = True
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT i.id, i.supplier_id, i.name, i.unit, i.unit_cost
                FROM supplies AS i
                JOIN suppliers AS s ON s.id = i.supplier_id
                WHERE i.id = %s AND i.active = 1 AND s.active = 1
                FOR UPDATE
                """,
                (supply_id,),
            )
            supply = cursor.fetchone()
            if supply is None:
                raise OrderConflict("O material selecionado não está disponível.")

            total = (Decimal(supply["unit_cost"]) * quantity).quantize(CENT)
            notes = (request.form.get("notes") or "").strip()[:255]
            cursor.execute(
                """
                INSERT INTO purchase_orders (supplier_id, status, total, created_by, notes)
                VALUES (%s, 'requested', %s, %s, %s)
                """,
                (supply["supplier_id"], total, session["usuario"], notes or None),
            )
            order_id = cursor.lastrowid
            cursor.execute(
                """
                INSERT INTO purchase_order_items (order_id, supply_id, quantity, unit_cost)
                VALUES (%s, %s, %s, %s)
                """,
                (order_id, supply["id"], quantity, supply["unit_cost"]),
            )
        connection.commit()
        _set_dashboard_notice(
            f"Pedido de demonstração #{order_id} registrado para {supply['name']}. "
            "Ele não foi enviado ao fornecedor.",
            "success",
        )
    except OrderConflict as exc:
        if transaction_started:
            connection.rollback()
        _set_dashboard_notice(str(exc))
    except pymysql.err.ProgrammingError as exc:
        if transaction_started:
            connection.rollback()
        if exc.args and exc.args[0] == 1146:
            _set_dashboard_notice("O módulo de compras ainda não foi instalado no banco.")
        else:
            app.logger.exception("Could not create a demo supply purchase")
            _set_dashboard_notice("Não foi possível registrar o pedido de demonstração.")
    except pymysql.MySQLError:
        if transaction_started:
            connection.rollback()
        app.logger.exception("Could not create a demo supply purchase")
        _set_dashboard_notice("Não foi possível registrar o pedido de demonstração.")
    finally:
        if connection is not None:
            connection.close()
    return redirect(url_for("dashboard"))


@app.post("/dashboard/purchases/<int:order_id>/receive")
def receive_supply_purchase(order_id):
    if "usuario" not in session:
        return redirect(url_for("login"))
    if not _valid_csrf_token():
        abort(400)

    connection = None
    transaction_started = False
    try:
        connection = criar_conexao()
        with connection.cursor() as cursor:
            cursor.execute("SELECT @@innodb_force_recovery AS force_recovery")
            recovery = cursor.fetchone()
            if recovery is None or int(recovery["force_recovery"]) != 0:
                _set_dashboard_notice(
                    "Banco em modo de recuperação: pedidos e alterações de estoque estão bloqueados."
                )
                return redirect(url_for("dashboard"))

        connection.begin()
        transaction_started = True
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, status FROM purchase_orders WHERE id = %s FOR UPDATE",
                (order_id,),
            )
            order = cursor.fetchone()
            if order is None or order["status"] != "requested":
                raise OrderConflict("Este pedido não existe ou já foi recebido.")
            cursor.execute(
                """
                SELECT supply_id, quantity
                FROM purchase_order_items
                WHERE order_id = %s
                """,
                (order_id,),
            )
            items = cursor.fetchall()
            if not items:
                raise OrderConflict("O pedido não possui materiais para receber.")
            for item in items:
                cursor.execute(
                    "UPDATE supplies SET current_stock = current_stock + %s WHERE id = %s",
                    (item["quantity"], item["supply_id"]),
                )
                if cursor.rowcount != 1:
                    raise OrderConflict("Um material deste pedido não existe mais no estoque.")
            cursor.execute(
                "UPDATE purchase_orders SET status = 'received', received_at = CURRENT_TIMESTAMP WHERE id = %s",
                (order_id,),
            )
        connection.commit()
        _set_dashboard_notice(
            f"Pedido de demonstração #{order_id} recebido; estoque atualizado.",
            "success",
        )
    except OrderConflict as exc:
        if transaction_started:
            connection.rollback()
        _set_dashboard_notice(str(exc))
    except pymysql.err.ProgrammingError as exc:
        if transaction_started:
            connection.rollback()
        if exc.args and exc.args[0] == 1146:
            _set_dashboard_notice("O módulo de compras ainda não foi instalado no banco.")
        else:
            app.logger.exception("Could not receive a demo supply purchase")
            _set_dashboard_notice("Não foi possível confirmar o recebimento.")
    except pymysql.MySQLError:
        if transaction_started:
            connection.rollback()
        app.logger.exception("Could not receive a demo supply purchase")
        _set_dashboard_notice("Não foi possível confirmar o recebimento.")
    finally:
        if connection is not None:
            connection.close()
    return redirect(url_for("dashboard"))


@app.get("/<path:filename>")
def public_files(filename):
    path = Path(filename)
    if (
        path.is_absolute()
        or any(part.startswith(".") or part.lower() in PRIVATE_DIRECTORIES for part in path.parts)
        or path.suffix.lower() not in PUBLIC_EXTENSIONS
    ):
        abort(404)
    return send_from_directory(BASE_DIR, filename)


if __name__ == "__main__":
    app.run(
        host=os.environ.get("NEXUS_WEB_HOST", "0.0.0.0"),
        port=int(os.environ.get("NEXUS_WEB_PORT", "8080")),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
