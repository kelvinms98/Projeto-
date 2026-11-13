const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createApp } = require('../server');
const { openDatabase } = require('../store-db');
const crypto = require('node:crypto');

let db;
let server;
let baseUrl;
let customerCookie;
let customerCsrf;
const sentEmails = [];
let failConfirmationEmail = false;

function scryptHash(password) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

async function login(username, password) {
  const loginPage = await fetch(`${baseUrl}/login`);
  const loginHtml = await loginPage.text();
  const initialCookie = loginPage.headers.get('set-cookie').split(';', 1)[0];
  const csrfToken = loginHtml.match(/name="csrf_token" value="([^"]+)"/)[1];
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie: initialCookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ login: username, senha: password, csrf_token: csrfToken }),
  });
  return { response, cookie: response.headers.get('set-cookie')?.split(';', 1)[0] };
}

function customerHeaders(extra = {}) {
  return {
    cookie: customerCookie,
    'x-csrf-token': customerCsrf,
    ...extra,
  };
}

before(async () => {
  db = openDatabase(':memory:');
  const { app } = createApp({
    db,
    sessionSecret: 'test-session-secret',
    calculateShippingQuote: async (cep) => ({
      cep,
      distanceMeters: 1200,
      distanceKm: 1.2,
      duration: '240s',
      fee: '15.00',
      feeCents: 1500,
    }),
    sendConfirmationEmail: async (email) => {
      if (failConfirmationEmail) throw new Error('SMTP indisponível');
      sentEmails.push(email);
    },
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  const sessionResponse = await fetch(`${baseUrl}/api/customer/session`);
  const sessionData = await sessionResponse.json();
  const initialCookie = sessionResponse.headers.get('set-cookie').split(';', 1)[0];
  const signupResponse = await fetch(`${baseUrl}/api/customer/signup`, {
    method: 'POST',
    headers: {
      cookie: initialCookie,
      'x-csrf-token': sessionData.data.csrfToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      full_name: 'Cliente Nexus',
      email: 'cliente@example.com',
      password: 'senha-forte-cliente-123',
    }),
  });
  assert.equal(signupResponse.status, 201);
  const signupData = await signupResponse.json();
  customerCookie = signupResponse.headers.get('set-cookie').split(';', 1)[0];
  customerCsrf = signupData.data.csrfToken;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) db.close();
});

test('serves products and delivery options from SQLite', async () => {
  const [productsResponse, deliveriesResponse] = await Promise.all([
    fetch(`${baseUrl}/api/products`),
    fetch(`${baseUrl}/api/delivery-options`, { headers: { cookie: customerCookie } }),
  ]);
  const products = await productsResponse.json();
  const deliveries = await deliveriesResponse.json();

  assert.equal(productsResponse.status, 200);
  assert.equal(products.data[0].name, 'Cap Nexus');
  assert.equal(deliveriesResponse.status, 200);
  assert.equal(deliveries.data[0].fee, '0.00');
});

test('requires a customer account for purchasing APIs and rejects weak registration passwords', async () => {
  const [deliveryResponse, shippingResponse, orderResponse] = await Promise.all([
    fetch(`${baseUrl}/api/delivery-options`),
    fetch(`${baseUrl}/api/shipping-quote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cep: '01000-000' }),
    }),
    fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
  ]);
  assert.equal(deliveryResponse.status, 401);
  assert.equal(shippingResponse.status, 401);
  assert.equal(orderResponse.status, 401);

  const missingCsrf = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { cookie: customerCookie, 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(missingCsrf.status, 403);

  const accountSession = await fetch(`${baseUrl}/api/customer/session`);
  const session = await accountSession.json();
  const response = await fetch(`${baseUrl}/api/customer/signup`, {
    method: 'POST',
    headers: {
      cookie: accountSession.headers.get('set-cookie').split(';', 1)[0],
      'x-csrf-token': session.data.csrfToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ full_name: 'Outro Cliente', email: 'outro@example.com', password: 'curta' }),
  });
  assert.equal(response.status, 400);
});

test('logs customers in with an individual account and protects account data', async () => {
  const sessionResponse = await fetch(`${baseUrl}/api/customer/session`);
  const session = await sessionResponse.json();
  const cookie = sessionResponse.headers.get('set-cookie').split(';', 1)[0];
  const loginResponse = await fetch(`${baseUrl}/api/customer/login`, {
    method: 'POST',
    headers: {
      cookie,
      'x-csrf-token': session.data.csrfToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email: 'cliente@example.com', password: 'senha-forte-cliente-123' }),
  });
  const loginResult = await loginResponse.json();
  assert.equal(loginResponse.status, 200);
  assert.equal(loginResult.data.customer.email, 'cliente@example.com');

  const invalidLogin = await fetch(`${baseUrl}/api/customer/login`, {
    method: 'POST',
    headers: {
      cookie: loginResponse.headers.get('set-cookie').split(';', 1)[0],
      'x-csrf-token': loginResult.data.csrfToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email: 'cliente@example.com', password: 'senha-incorreta' }),
  });
  assert.equal(invalidLogin.status, 401);
});

test('uses a unique database index for each product variant', () => {
  const insert = db.prepare(`
    INSERT INTO produto (nome, tamanho, cor, preco, estoque)
    VALUES ('graphic nexus', 'm', 'unica', 250, 2)
  `);
  assert.throws(insert.run.bind(insert), /UNIQUE constraint failed/);
});

test('calculates shipping quotes for a normalized destination CEP', async () => {
  const response = await fetch(`${baseUrl}/api/shipping-quote`, {
    method: 'POST',
    headers: customerHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ cep: '01000-000' }),
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.data.cep, '01000000');
  assert.equal(result.data.distanceKm, 1.2);
  assert.equal(result.data.fee, '15.00');
});

test('rejects malformed destination CEPs before requesting a quote', async () => {
  const response = await fetch(`${baseUrl}/api/shipping-quote`, {
    method: 'POST',
    headers: customerHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ cep: 'abc01000' }),
  });

  assert.equal(response.status, 400);
});

test('creates orders transactionally and decrements stock', async () => {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: customerHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      customerName: 'Nome enviado pelo navegador',
      customerEmail: 'outro@example.com',
      phone: '',
      paymentMethod: 'pix',
      deliveryOptionId: 'local_courier',
      street: 'Rua das Flores',
      number: '10',
      cep: '01000-000',
      items: [{
        productId: 2,
        name: 'Graphic Nexus',
        size: 'M',
        color: 'Unica',
        quantity: 3,
      }],
    }),
  });
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.equal(result.total, '687.30');
  assert.equal(result.status, 'awaiting_payment');
  assert.equal(result.emailSent, true);
  assert.equal(sentEmails[0].customerEmail, 'cliente@example.com');
  assert.equal(sentEmails[0].orderId, result.orderId);
  const savedOrder = db.prepare('SELECT customer_name, customer_email, id_cliente FROM venda WHERE id_venda = ?')
    .get(result.orderId);
  assert.equal(savedOrder.customer_name, 'Cliente Nexus');
  assert.equal(savedOrder.customer_email, 'cliente@example.com');
  assert.equal(savedOrder.id_cliente, 1);
  assert.equal(db.prepare('SELECT estoque FROM produto WHERE id_produto = 2').get().estoque, 97);
  assert.equal(db.prepare('SELECT delivery_fee FROM venda WHERE id_venda = ?').get(result.orderId).delivery_fee, 15);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM item_venda').get().count, 1);
  const customerOrders = await fetch(`${baseUrl}/api/customer/orders`, { headers: { cookie: customerCookie } });
  assert.equal((await customerOrders.json()).data.length, 1);
});

test('rejects out-of-stock orders without changing inventory', async () => {
  db.prepare('UPDATE produto SET estoque = 0 WHERE id_produto = 2').run();
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: customerHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      customerName: 'Cliente Nexus',
      customerEmail: 'cliente@example.com',
      paymentMethod: 'pix',
      deliveryOptionId: 'local_courier',
      street: 'Rua das Flores',
      number: '10',
      cep: '01000-000',
      items: [{
        productId: 2,
        name: 'Graphic Nexus',
        size: 'M',
        color: 'Unica',
        quantity: 1,
      }],
    }),
  });

  assert.equal(response.status, 409);
  assert.equal(db.prepare('SELECT estoque FROM produto WHERE id_produto = 2').get().estoque, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM venda').get().count, 1);
});

test('keeps a registered order when its confirmation email cannot be sent', async () => {
  failConfirmationEmail = true;
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: customerHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      customerName: 'Cliente Nexus',
      customerEmail: 'cliente@example.com',
      paymentMethod: 'pix',
      deliveryOptionId: 'store_pickup',
      items: [{
        productId: 1,
        name: 'Graphic Nexus',
        size: 'P',
        color: 'Unica',
        quantity: 1,
      }],
    }),
  });
  const result = await response.json();
  failConfirmationEmail = false;

  assert.equal(response.status, 201);
  assert.equal(result.emailSent, false);
  assert.match(result.emailMessage, /não foi possível enviar/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM venda').get().count, 2);
});

test('secures the admin panel and manages employees, cash, photos and receipts', async () => {
  db.prepare(`
    INSERT INTO funcionarios
      (nome, username, email, cargo, senha, role, access_status)
    VALUES (?, ?, ?, ?, ?, 'owner', 'active')
  `).run(
    'Administrador Nexus',
    'owner.nexus',
    'owner@example.com',
    'Administrador',
    scryptHash('test-owner-password'),
  );
  const loginPage = await fetch(`${baseUrl}/login`);
  const loginHtml = await loginPage.text();
  const initialCookie = loginPage.headers.get('set-cookie').split(';', 1)[0];
  const initialToken = loginHtml.match(/name="csrf_token" value="([^"]+)"/)[1];
  const loginResponse = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie: initialCookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ login: 'owner.nexus', senha: 'test-owner-password', csrf_token: initialToken }),
  });
  const sessionCookie = loginResponse.headers.get('set-cookie').split(';', 1)[0];
  assert.equal(loginResponse.status, 302);
  assert.equal(loginResponse.headers.get('location'), '/dashboard');

  const dashboardResponse = await fetch(`${baseUrl}/dashboard`, {
    headers: { cookie: sessionCookie },
  });
  const dashboardHtml = await dashboardResponse.text();
  const csrfToken = dashboardHtml.match(/name="csrf_token" value="([^"]+)"/)[1];
  assert.equal(dashboardResponse.status, 200);
  assert.match(dashboardHtml, /Materiais e suprimentos/);
  assert.match(dashboardHtml, /Fotos do catálogo/);
  assert.match(dashboardHtml, /Equipe e acessos/);
  assert.match(dashboardHtml, /Caixa e entradas confirmadas/);

  const orderStatusResponse = await fetch(`${baseUrl}/dashboard/orders/1/status`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: sessionCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ status: 'paid', csrf_token: csrfToken }),
  });
  assert.equal(orderStatusResponse.status, 302);
  assert.equal(db.prepare('SELECT amount FROM cash_paid_sales WHERE order_id = 1').get().amount, 687.3);

  const receiptResponse = await fetch(`${baseUrl}/dashboard/orders/1/receipt`, {
    headers: { cookie: sessionCookie },
  });
  const receiptHtml = await receiptResponse.text();
  assert.equal(receiptResponse.status, 200);
  assert.match(receiptHtml, /RECIBO INTERNO/);
  assert.match(receiptHtml, /NÃO É NOTA FISCAL/);

  const openCashResponse = await fetch(`${baseUrl}/dashboard/cash/open`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: sessionCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ opening_amount: '100', csrf_token: csrfToken }),
  });
  assert.equal(openCashResponse.status, 302);
  const entryResponse = await fetch(`${baseUrl}/dashboard/cash/entries`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: sessionCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      kind: 'addition',
      payment_method: 'dinheiro',
      amount: '30',
      note: 'Troco inicial',
      csrf_token: csrfToken,
    }),
  });
  assert.equal(entryResponse.status, 302);
  const closeCashResponse = await fetch(`${baseUrl}/dashboard/cash/close`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: sessionCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ closing_amount: '130', csrf_token: csrfToken }),
  });
  assert.equal(closeCashResponse.status, 302);
  assert.equal(db.prepare('SELECT expected_amount FROM cash_registers WHERE id = 1').get().expected_amount, 130);

  const addEmployeeResponse = await fetch(`${baseUrl}/dashboard/employees`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: sessionCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      nome: 'Gerente de Loja',
      username: 'gerente.loja',
      email: 'gerente@example.com',
      cargo: 'Gerente',
      role: 'manager',
      salary: '2500',
      senha: 'temporary-manager-password',
      csrf_token: csrfToken,
    }),
  });
  assert.equal(addEmployeeResponse.status, 302);
  const employee = db.prepare(`
    SELECT id_funcionario, senha, salary, role FROM funcionarios WHERE username = ?
  `).get('gerente.loja');
  assert.match(employee.senha, /^scrypt\$/);
  assert.equal(employee.salary, 2500);
  assert.equal(employee.role, 'manager');

  const mediaResponse = await fetch(`${baseUrl}/dashboard/products/media`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: sessionCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      product_name: 'Graphic Nexus',
      image_url: 'imagens/graphic-nexus.jpg',
      csrf_token: csrfToken,
    }),
  });
  assert.equal(mediaResponse.status, 302);
  const productsResponse = await fetch(`${baseUrl}/api/products`);
  const products = await productsResponse.json();
  assert.equal(products.data.find((product) => product.name === 'Graphic Nexus').imageUrl, 'imagens/graphic-nexus.jpg');

  const managerLogin = await login('gerente.loja', 'temporary-manager-password');
  assert.equal(managerLogin.response.status, 302);
  const managerForbidden = await fetch(`${baseUrl}/dashboard/employees/${employee.id_funcionario}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: managerLogin.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      role: 'staff',
      access_status: 'blocked',
      salary: '0',
      csrf_token: csrfToken,
    }),
  });
  assert.equal(managerForbidden.status, 403);

  const blockEmployeeResponse = await fetch(`${baseUrl}/dashboard/employees/${employee.id_funcionario}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: sessionCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      role: 'manager',
      access_status: 'blocked',
      salary: '2700',
      senha: '',
      csrf_token: csrfToken,
    }),
  });
  assert.equal(blockEmployeeResponse.status, 302);
  assert.equal(
    db.prepare('SELECT access_status, salary FROM funcionarios WHERE id_funcionario = ?')
      .get(employee.id_funcionario).access_status,
    'blocked',
  );
  const blockedSession = await fetch(`${baseUrl}/dashboard`, {
    headers: { cookie: managerLogin.cookie },
    redirect: 'manual',
  });
  assert.equal(blockedSession.status, 302);
  assert.equal(blockedSession.headers.get('location'), '/login');
  assert.equal(blockedSession.headers.get('location'), '/login');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM employee_audit_log').get().count, 2);

  const purchaseResponse = await fetch(`${baseUrl}/dashboard/purchases`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie: sessionCookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ supply_id: '1', quantity: '2', csrf_token: csrfToken }),
  });
  assert.equal(purchaseResponse.status, 302);
  assert.equal(db.prepare('SELECT status FROM purchase_orders WHERE id = 1').get().status, 'requested');

  const receiveResponse = await fetch(`${baseUrl}/dashboard/purchases/1/receive`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie: sessionCookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ csrf_token: csrfToken }),
  });
  assert.equal(receiveResponse.status, 302);
  assert.equal(db.prepare('SELECT status FROM purchase_orders WHERE id = 1').get().status, 'received');
  assert.equal(db.prepare('SELECT current_stock FROM supplies WHERE id = 1').get().current_stock, 20);
});
