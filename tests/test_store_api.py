from decimal import Decimal

import app as store_app


class FakeConnection:
    def __init__(self, stock=10, force_recovery=0, missing_delivery=False):
        self.force_recovery = force_recovery
        self.missing_delivery = missing_delivery
        self.products = {
            ("Graphic Nexus", "M"): {
                "id_produto": 1001,
                "nome": "Graphic Nexus",
                "tamanho": "M",
                "cor": "Unica",
                "preco": Decimal("249.00"),
                "estoque": stock,
            }
        }
        self.delivery = {
            "id": "local_courier",
            "name": "Entrega local",
            "fee": Decimal("10.00"),
            "estimate": "1 dia útil",
            "requires_address": 1,
        }
        self.order_values = None
        self.order_item_values = []
        self.begun = False
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def cursor(self):
        return FakeCursor(self)

    def begin(self):
        self.begun = True

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


class FakeCursor:
    def __init__(self, connection):
        self.connection = connection
        self.result = None
        self.lastrowid = 73
        self.rowcount = 1

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, parameters=None):
        normalized = " ".join(query.lower().split())
        parameters = parameters or ()
        if "innodb_force_recovery" in normalized:
            self.result = {"force_recovery": self.connection.force_recovery}
        elif "from produto" in normalized and normalized.startswith("select"):
            if "where id_produto =" in normalized:
                self.result = [
                    product
                    for product in self.connection.products.values()
                    if product["id_produto"] == parameters[0]
                ]
            elif "where nome =" in normalized:
                product = self.connection.products.get((parameters[0], parameters[1]))
                if product is not None and (
                    len(parameters) < 3 or product["cor"] == parameters[2]
                ):
                    self.result = [product]
                else:
                    self.result = []
            else:
                self.result = list(self.connection.products.values())
        elif "from delivery_options" in normalized:
            if self.connection.missing_delivery:
                raise store_app.pymysql.err.ProgrammingError(1146, "Table does not exist")
            if "where id =" in normalized:
                self.result = self.connection.delivery
            else:
                self.result = [self.connection.delivery]
        elif normalized.startswith("insert into venda"):
            self.connection.order_values = parameters
        elif normalized.startswith("update produto"):
            quantity, product_id, _ = parameters
            product = next(
                product for product in self.connection.products.values()
                if product["id_produto"] == product_id
            )
            if product["estoque"] < quantity:
                self.rowcount = 0
            else:
                product["estoque"] -= quantity
                self.rowcount = 1
        elif normalized.startswith("insert into item_venda"):
            self.connection.order_item_values.append(parameters)
        else:
            raise AssertionError(f"Unexpected query: {query}")

    def fetchone(self):
        return self.result

    def fetchall(self):
        return self.result


def payload(quantity=1):
    return {
        "customerName": "Cliente Nexus",
        "customerEmail": "cliente@example.com",
        "phone": "11999990000",
        "paymentMethod": "pix",
        "deliveryOptionId": "local_courier",
        "street": "Rua das Flores",
        "number": "10",
        "cep": "01000-000",
        "items": [
            {
                "productId": 1001,
                "name": "Graphic Nexus",
                "size": "M",
                "color": "Unica",
                "quantity": quantity,
            }
        ],
    }


def test_storefront_is_served_by_flask():
    response = store_app.app.test_client().get("/")

    assert response.status_code == 200
    assert b"NEXUS" in response.data


def test_delivery_options_are_returned_from_mysql(monkeypatch):
    connection = FakeConnection()
    monkeypatch.setattr(store_app, "criar_conexao", lambda: connection)

    response = store_app.app.test_client().get("/api/delivery-options")

    assert response.status_code == 200
    assert response.json["data"][0]["id"] == "local_courier"
    assert response.json["data"][0]["fee"] == "10.00"
    assert connection.closed


def test_delivery_options_report_a_missing_database_table(monkeypatch):
    connection = FakeConnection(missing_delivery=True)
    monkeypatch.setattr(store_app, "criar_conexao", lambda: connection)

    response = store_app.app.test_client().get("/api/delivery-options")

    assert response.status_code == 503
    assert "delivery_options" in response.json["error"]
    assert "recuperação normal do InnoDB" in response.json["error"]
    assert connection.closed


def test_products_are_returned_with_database_variant_ids(monkeypatch):
    connection = FakeConnection()
    monkeypatch.setattr(store_app, "criar_conexao", lambda: connection)

    response = store_app.app.test_client().get("/api/products")

    assert response.status_code == 200
    assert response.json["data"][0] == {
        "id": 1001,
        "name": "Graphic Nexus",
        "size": "M",
        "color": "Unica",
        "price": "249.00",
        "stock": 10,
    }
    assert connection.closed


def test_order_uses_database_price_and_decreases_stock(monkeypatch):
    connection = FakeConnection()
    monkeypatch.setattr(store_app, "criar_conexao", lambda: connection)
    order = payload()
    order["items"].append(
        {
            "productId": 1001,
            "name": "Graphic Nexus",
            "size": "M",
            "color": "Unica",
            "quantity": 2,
        }
    )

    response = store_app.app.test_client().post("/api/orders", json=order)

    assert response.status_code == 201
    assert response.json["orderId"] == 73
    assert response.json["total"] == "682.30"
    assert connection.products[("Graphic Nexus", "M")]["estoque"] == 7
    assert len(connection.order_item_values) == 1
    assert connection.order_item_values[0][4] == 3
    assert connection.committed
    assert connection.closed


def test_order_rejects_invalid_quantity_before_connecting(monkeypatch):
    monkeypatch.setattr(
        store_app,
        "criar_conexao",
        lambda: (_ for _ in ()).throw(AssertionError("Database must not be used")),
    )
    order = payload()
    order["items"][0]["quantity"] = True

    response = store_app.app.test_client().post("/api/orders", json=order)

    assert response.status_code == 400
    assert "quantidade" in response.json["error"].lower()


def test_order_is_disabled_during_innodb_recovery(monkeypatch):
    connection = FakeConnection(force_recovery=1)
    monkeypatch.setattr(store_app, "criar_conexao", lambda: connection)

    response = store_app.app.test_client().post("/api/orders", json=payload())

    assert response.status_code == 503
    assert "modo de recuperação" in response.json["error"]
    assert not connection.begun
    assert not connection.committed
    assert connection.closed


def test_order_rolls_back_when_stock_is_insufficient(monkeypatch):
    connection = FakeConnection(stock=1)
    monkeypatch.setattr(store_app, "criar_conexao", lambda: connection)

    response = store_app.app.test_client().post("/api/orders", json=payload(quantity=2))

    assert response.status_code == 409
    assert connection.rolled_back
    assert not connection.committed
    assert connection.order_values is None
    assert connection.closed


def test_supply_purchase_is_blocked_during_innodb_recovery(monkeypatch):
    connection = FakeConnection(force_recovery=1)
    monkeypatch.setattr(store_app, "criar_conexao", lambda: connection)
    client = store_app.app.test_client()
    with client.session_transaction() as state:
        state["usuario"] = "Funcionário"
        state["csrf_token"] = "test-token"

    response = client.post(
        "/dashboard/purchases",
        data={"csrf_token": "test-token", "supply_id": "1", "quantity": "2"},
    )

    assert response.status_code == 302
    assert not connection.begun
    assert not connection.committed
    assert connection.closed


def test_supply_purchase_requires_csrf_token(monkeypatch):
    monkeypatch.setattr(
        store_app,
        "criar_conexao",
        lambda: (_ for _ in ()).throw(AssertionError("Database must not be used")),
    )
    client = store_app.app.test_client()
    with client.session_transaction() as state:
        state["usuario"] = "Funcionário"
        state["csrf_token"] = "test-token"

    response = client.post(
        "/dashboard/purchases",
        data={"supply_id": "1", "quantity": "2"},
    )

    assert response.status_code == 400
