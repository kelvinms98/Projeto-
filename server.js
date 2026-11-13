require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const nunjucks = require('nunjucks');
const nodemailer = require('nodemailer');
const { openDatabase, runTransaction } = require('./store-db');

const BASE_DIR = __dirname;
const PUBLIC_EXTENSIONS = new Set([
  '.css', '.html', '.jpg', '.jpeg', '.js', '.png', '.svg', '.webp', '.woff', '.woff2',
]);
const PRIVATE_DIRECTORIES = new Set(['include', 'src', 'src.c', 'supabase', 'templates', 'tests', 'data']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class OrderConflict extends Error {}
class OrderValidationError extends Error {}
class ShippingServiceError extends Error {}

const ORDER_STATUSES = {
  awaiting_payment: { label: 'Aguardando pagamento', next: ['paid', 'cancelled'] },
  paid: { label: 'Pagamento confirmado', next: ['preparing', 'cancelled'] },
  preparing: { label: 'Em separação', next: ['shipped', 'cancelled'] },
  shipped: { label: 'Enviado', next: ['delivered'] },
  delivered: { label: 'Entregue', next: [] },
  cancelled: { label: 'Cancelado', next: [] },
};

const ORDER_STATUS_LABELS = Object.fromEntries(
  Object.entries(ORDER_STATUSES).map(([status, details]) => [status, details.label]),
);

function normalizeCep(value) {
  return String(value || '').replace(/\D/g, '');
}

function validCep(value) {
  return /^\d{5}-?\d{3}$/.test(String(value || '').trim());
}

function envCents(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new ShippingServiceError(`A configuração ${name} deve ser um valor monetário válido.`);
  }
  return Math.round(Number(value) * 100);
}

async function calculateFixedShippingQuote(destinationCep) {
  const baseCents = envCents('NEXUS_SHIPPING_BASE_BRL', 800);
  const serviceCents = envCents('NEXUS_SHIPPING_SERVICE_BRL', 350);
  const feeCents = baseCents + serviceCents;
  return {
    cep: destinationCep,
    distanceMeters: null,
    distanceKm: null,
    duration: null,
    baseFee: money(baseCents / 100),
    serviceFee: money(serviceCents / 100),
    fee: money(feeCents / 100),
    feeCents,
  };
}

async function sendOrderConfirmation({ orderId, customerName, customerEmail, total }) {
  const host = process.env.NEXUS_SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.NEXUS_SMTP_PORT || 465);
  const user = process.env.NEXUS_SMTP_USER || process.env.NEXUS_EMAIL_FROM;
  const password = process.env.NEXUS_SMTP_PASSWORD;
  const from = process.env.NEXUS_EMAIL_FROM;
  if (!user || !password || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Configuração SMTP incompleta.');
  }
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.NEXUS_SMTP_SECURE || (port === 465)).toLowerCase() === 'true',
    auth: { user, pass: password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  await transporter.sendMail({
    from: `"NEXUS" <${from}>`,
    to: customerEmail,
    subject: `Confirmação do pedido #${orderId} - NEXUS`,
    text: [
      `Olá, ${customerName}.`,
      '',
      `Recebemos o seu pedido #${orderId}, no valor de ${formatEmailMoney(total)}.`,
      'O pedido está aguardando a confirmação do pagamento.',
      '',
      'Obrigado por comprar na NEXUS.',
    ].join('\n'),
  });
}

function isSmtpConfigured() {
  const port = Number(process.env.NEXUS_SMTP_PORT || 465);
  const user = process.env.NEXUS_SMTP_USER || process.env.NEXUS_EMAIL_FROM;
  return Boolean(
    user
    && process.env.NEXUS_EMAIL_FROM
    && process.env.NEXUS_SMTP_PASSWORD
    && Number.isInteger(port)
    && port >= 1
    && port <= 65535,
  );
}

function formatEmailMoney(value) {
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

class SQLiteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.readSession = db.prepare('SELECT session_json, expires_at FROM web_sessions WHERE sid = ?');
    this.writeSession = db.prepare(`
      INSERT INTO web_sessions (sid, session_json, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET
        session_json = excluded.session_json,
        expires_at = excluded.expires_at
    `);
    this.deleteSession = db.prepare('DELETE FROM web_sessions WHERE sid = ?');
  }

  get(sid, callback) {
    try {
      const row = this.readSession.get(sid);
      if (!row) return callback(null, null);
      if (row.expires_at !== null && row.expires_at <= Date.now()) {
        this.deleteSession.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.session_json));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, storedSession, callback) {
    try {
      const expiresAt = storedSession.cookie?.expires
        ? new Date(storedSession.cookie.expires).getTime()
        : null;
      this.writeSession.run(sid, JSON.stringify(storedSession), expiresAt);
      if (callback) callback(null);
    } catch (error) {
      if (callback) callback(error);
      else throw error;
    }
  }

  touch(sid, storedSession, callback) {
    this.set(sid, storedSession, callback);
  }

  destroy(sid, callback) {
    try {
      this.deleteSession.run(sid);
      if (callback) callback(null);
    } catch (error) {
      if (callback) callback(error);
      else throw error;
    }
  }
}

function csrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

function validCsrf(req) {
  const expected = req.session.csrfToken;
  const supplied = req.get('x-csrf-token') || req.body?.csrf_token;
  if (typeof expected !== 'string' || typeof supplied !== 'string') return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length
    && crypto.timingSafeEqual(expectedBytes, suppliedBytes);
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function roundHalfEvenRatio(numerator, denominator) {
  const lower = Math.floor(numerator / denominator);
  const remainder = numerator % denominator;
  if (remainder * 2 < denominator) return lower;
  if (remainder * 2 > denominator) return lower + 1;
  return lower % 2 === 0 ? lower : lower + 1;
}

function renderLogin(res, error, token, status = 200) {
  return res.status(status).render('login.html', { erro: error, csrf_token: token });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function isScryptHash(value) {
  return typeof value === 'string' && /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/i.test(value);
}

function verifyPassword(password, storedHash) {
  if (isScryptHash(storedHash)) {
    const [, saltHex, expectedHex] = storedHash.split('$');
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return crypto.timingSafeEqual(actual, expected);
  }
  const sha256 = crypto.createHash('sha256').update(password).digest('hex');
  return storedHash === sha256 || storedHash === password;
}

function roleAllowed(req, roles) {
  return roles.includes(req.session.role || 'staff');
}

function auditEmployeeChange(db, actorId, employeeId, action, details) {
  db.prepare(`
    INSERT INTO employee_audit_log (actor_id, employee_id, action, details)
    VALUES (?, ?, ?, ?)
  `).run(actorId, employeeId, action, JSON.stringify(details));
}

function createApp({
  db = openDatabase(),
  sessionSecret = process.env.NEXUS_SECRET_KEY || crypto.randomBytes(32).toString('hex'),
  calculateShippingQuote = calculateFixedShippingQuote,
  sendConfirmationEmail = sendOrderConfirmation,
} = {}) {
  const app = express();
  const views = nunjucks.configure(path.join(BASE_DIR, 'templates'), {
    autoescape: true,
    express: app,
    noCache: process.env.NODE_ENV !== 'production',
  });
  views.addFilter('money', money);
  app.engine('html', nunjucks.render);
  app.set('view engine', 'html');
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use(express.json({ limit: '64kb' }));
  app.use(session({
    name: 'nexus.sid',
    secret: sessionSecret,
    store: new SQLiteSessionStore(db),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
  }));

  function requireCustomer(req, res, next) {
    if (!req.session.customer_id) {
      return res.status(401).json({ error: 'Entre na sua conta para continuar.', loginUrl: '/conta.html' });
    }
    try {
      const customer = db.prepare(`
        SELECT id_cliente, nome, email, telefone
        FROM clientes WHERE id_cliente = ? AND status = 'ativo'
      `).get(req.session.customer_id);
      if (!customer) {
        delete req.session.customer_id;
        return res.status(401).json({ error: 'A conta não está disponível. Entre novamente.', loginUrl: '/conta.html' });
      }
      req.customer = customer;
      return next();
    } catch (error) {
      return next(error);
    }
  }

  function finishCustomerLogin(req, res, next, customer) {
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.customer_id = customer.id_cliente;
      csrfToken(req);
      return req.session.save((saveError) => {
        if (saveError) return next(saveError);
        return res.json({
          data: {
            customer: {
              id: String(customer.id_cliente),
              name: customer.nome,
              email: customer.email,
              phone: customer.telefone || '',
            },
            csrfToken: req.session.csrfToken,
          },
        });
      });
    });
  }

  app.use('/dashboard', (req, res, next) => {
    if (!req.session.funcionario_id) return res.redirect('/login');
    try {
      const employee = db.prepare(`
        SELECT nome, role, access_status
        FROM funcionarios WHERE id_funcionario = ?
      `).get(req.session.funcionario_id);
      if (!employee || employee.access_status !== 'active') {
        return req.session.destroy((error) => {
          if (error) return next(error);
          res.clearCookie('nexus.sid');
          return res.redirect('/login');
        });
      }
      req.session.usuario = employee.nome;
      req.session.role = employee.role || 'staff';
      return next();
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: 'sqlite' }));

  app.get('/api/customer/session', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      const customer = req.session.customer_id
        ? db.prepare(`
          SELECT id_cliente, nome, email, telefone
          FROM clientes WHERE id_cliente = ? AND status = 'ativo'
        `).get(req.session.customer_id)
        : null;
      if (!customer && req.session.customer_id) delete req.session.customer_id;
      return res.json({
        data: {
          customer: customer ? {
            id: String(customer.id_cliente),
            name: customer.nome,
            email: customer.email,
            phone: customer.telefone || '',
          } : null,
          csrfToken: csrfToken(req),
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/customer/signup', (req, res, next) => {
    if (!validCsrf(req)) return res.status(403).json({ error: 'A sessão expirou. Atualize a página e tente novamente.' });
    const name = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!name || name.length > 120) {
      return res.status(400).json({ error: 'Informe seu nome completo.' });
    }
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }
    if (password.length < 12 || password.length > 256) {
      return res.status(400).json({ error: 'A senha precisa ter de 12 a 256 caracteres.' });
    }
    try {
      if (db.prepare('SELECT id_cliente FROM clientes WHERE lower(email) = ?').get(email)) {
        return res.status(409).json({ error: 'Já existe uma conta com este e-mail. Entre ou use outro e-mail.' });
      }
      const customerId = runTransaction(db, () => {
        const inserted = db.prepare(`
          INSERT INTO clientes (nome, email, status) VALUES (?, ?, 'ativo')
        `).run(name, email);
        db.prepare(`
          INSERT INTO customer_credentials (customer_id, password_hash) VALUES (?, ?)
        `).run(inserted.lastInsertRowid, hashPassword(password));
        return Number(inserted.lastInsertRowid);
      });
      res.status(201);
      return finishCustomerLogin(req, res, next, {
        id_cliente: customerId,
        nome: name,
        email,
        telefone: '',
      });
    } catch (error) {
      if (String(error.code || '').startsWith('SQLITE_CONSTRAINT')) {
        return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
      }
      return next(error);
    }
  });

  app.post('/api/customer/login', (req, res, next) => {
    if (!validCsrf(req)) return res.status(403).json({ error: 'A sessão expirou. Atualize a página e tente novamente.' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (email.length > 254 || !EMAIL_PATTERN.test(email) || !password || password.length > 256) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    try {
      const customer = db.prepare(`
        SELECT c.id_cliente, c.nome, c.email, c.telefone, c.status, credentials.password_hash
        FROM clientes AS c
        JOIN customer_credentials AS credentials ON credentials.customer_id = c.id_cliente
        WHERE lower(c.email) = ?
      `).get(email);
      if (!customer || customer.status !== 'ativo' || !verifyPassword(password, customer.password_hash)) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }
      return finishCustomerLogin(req, res, next, customer);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/customer/logout', requireCustomer, (req, res, next) => {
    if (!validCsrf(req)) return res.status(403).json({ error: 'A sessão expirou. Atualize a página e tente novamente.' });
    delete req.session.customer_id;
    return req.session.save((error) => {
      if (error) return next(error);
      return res.json({ data: { signedOut: true } });
    });
  });

  app.put('/api/customer/profile', requireCustomer, (req, res, next) => {
    if (!validCsrf(req)) return res.status(403).json({ error: 'A sessão expirou. Atualize a página e tente novamente.' });
    const name = String(req.body?.full_name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    if (!name || name.length > 120 || phone.length > 30) {
      return res.status(400).json({ error: 'Confira o nome e o telefone.' });
    }
    try {
      db.prepare('UPDATE clientes SET nome = ?, telefone = ? WHERE id_cliente = ?')
        .run(name, phone || null, req.customer.id_cliente);
      return res.json({
        data: {
          id: String(req.customer.id_cliente),
          name,
          email: req.customer.email,
          phone,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/customer/orders', requireCustomer, (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      const orders = db.prepare(`
        SELECT v.id_venda, v.status, v.total, v.created_at, v.tracking_token,
               d.name AS delivery_name
        FROM venda AS v
        LEFT JOIN delivery_options AS d ON d.id = v.delivery_option_id
        WHERE v.id_cliente = ?
        ORDER BY v.created_at DESC, v.id_venda DESC
      `).all(req.customer.id_cliente);
      const itemsQuery = db.prepare(`
        SELECT product_name, size, quantity, unit_price
        FROM item_venda WHERE id_venda = ? ORDER BY id_item_venda
      `);
      return res.json({
        data: orders.map((order) => ({
          ...order,
          items: itemsQuery.all(order.id_venda),
          statusLabel: ORDER_STATUS_LABELS[order.status] || order.status,
          total: money(order.total),
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/customer/vip-progress', requireCustomer, (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      const progress = db.prepare(`
        SELECT
          COALESCE(SUM(CASE
            WHEN status IN ('paid', 'preparing', 'shipped', 'delivered')
              THEN ROUND(CASE WHEN subtotal > discount_amount
                THEN subtotal - discount_amount ELSE 0 END * 100)
            ELSE 0
          END), 0) AS eligible_spend_cents,
          COUNT(CASE WHEN status IN ('paid', 'preparing', 'shipped', 'delivered') THEN 1 END)
            AS confirmed_orders,
          COUNT(CASE WHEN status = 'awaiting_payment' THEN 1 END) AS pending_orders
        FROM venda
        WHERE id_cliente = ?
      `).get(req.customer.id_cliente);
      const targetCents = 100000;
      const spendCents = Math.max(0, Math.round(Number(progress.eligible_spend_cents) || 0));
      const remainingCents = Math.max(0, targetCents - spendCents);
      const progressPercent = Math.min(100, Math.round((spendCents / targetCents) * 10000) / 100);
      return res.json({
        data: {
          customerName: req.customer.nome,
          spent: spendCents / 100,
          target: targetCents / 100,
          remaining: remainingCents / 100,
          progressPercent,
          isVip: spendCents >= targetCents,
          confirmedOrders: Number(progress.confirmed_orders),
          pendingOrders: Number(progress.pending_orders),
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/', (_req, res) => res.sendFile(path.join(BASE_DIR, 'index.html')));

  app.post('/api/shipping-quote', requireCustomer, async (req, res) => {
    if (!validCsrf(req)) return res.status(403).json({ error: 'A sessão expirou. Atualize a página e tente novamente.' });
    if (!validCep(req.body?.cep)) {
      return res.status(400).json({ error: 'Informe um CEP de destino válido com 8 dígitos.' });
    }
    const cep = normalizeCep(req.body?.cep);
    try {
      const quote = await calculateShippingQuote(cep);
      return res.json({
        data: {
          cep: quote.cep,
          distanceKm: quote.distanceKm,
          duration: quote.duration,
          baseFee: quote.baseFee,
          serviceFee: quote.serviceFee,
          fee: quote.fee,
        },
      });
    } catch (error) {
      if (error instanceof ShippingServiceError) {
        return res.status(503).json({ error: error.message });
      }
      console.error('Shipping quote failed:', error);
      return res.status(502).json({ error: 'Não foi possível calcular o frete neste momento.' });
    }
  });

  app.get('/api/delivery-options', requireCustomer, (_req, res, next) => {
    try {
      const options = db.prepare(`
        SELECT id, name, fee, estimate, requires_address
        FROM delivery_options
        WHERE active = 1
        ORDER BY display_order, name
      `).all();
      res.json({
        data: options.map((option) => ({
          ...option,
          fee: money(option.fee),
          requires_address: Boolean(option.requires_address),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/products', (_req, res, next) => {
    try {
      const products = db.prepare(`
        SELECT p.id_produto, p.nome, p.tamanho, p.cor, p.preco, p.estoque,
               pm.image_url, pm.updated_by
        FROM produto AS p
        LEFT JOIN product_media AS pm ON pm.product_name = p.nome COLLATE NOCASE
        ORDER BY nome, cor, tamanho, id_produto
      `).all();
      const galleryByName = new Map();
      for (const image of db.prepare(`
        SELECT product_name, image_url
        FROM product_gallery
        ORDER BY display_order, id
      `).all()) {
        const key = image.product_name.toLowerCase();
        if (!galleryByName.has(key)) galleryByName.set(key, []);
        galleryByName.get(key).push(image.image_url);
      }
      res.json({
        data: products.map((product) => ({
          id: Number(product.id_produto),
          name: product.nome,
          size: product.tamanho,
          color: product.cor,
          price: product.preco === null ? null : money(product.preco),
          stock: Number(product.estoque),
          imageUrl: product.image_url || null,
          hasCustomImage: product.updated_by !== null && product.updated_by !== undefined,
          galleryImages: galleryByName.get(product.nome.toLowerCase()) || [],
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/orders', requireCustomer, async (req, res, next) => {
    if (!validCsrf(req)) return res.status(403).json({ error: 'A sessão expirou. Atualize a página e tente novamente.' });
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'Envie os dados do pedido em formato JSON.' });
    }

    const customerName = req.customer.nome;
    const customerEmail = req.customer.email;
    const phone = String(payload.phone || req.customer.telefone || '').trim();
    const paymentMethod = String(payload.paymentMethod || '').trim();
    const deliveryId = String(payload.deliveryOptionId || '').trim();
    const items = payload.items;

    if (!['pix', 'cartao', 'boleto'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Selecione uma forma de pagamento válida.' });
    }
    if (phone.length > 32) return res.status(400).json({ error: 'O telefone informado é muito longo.' });
    if (!deliveryId || deliveryId.length > 64) {
      return res.status(400).json({ error: 'Selecione uma modalidade de entrega.' });
    }
    if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
      return res.status(400).json({ error: 'O carrinho está vazio ou tem itens demais.' });
    }

    const quantities = new Map();
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return res.status(400).json({ error: 'Há um item inválido no carrinho.' });
      }
      const name = item.name;
      const size = item.size;
      const color = item.color;
      const productId = item.productId;
      const quantity = item.quantity;
      if (
        typeof name !== 'string' || !name.trim() || name.trim().length > 100
        || typeof size !== 'string' || !size.trim() || size.trim().length > 20
        || (color !== undefined && color !== null && (typeof color !== 'string' || color.length > 30))
        || (productId !== undefined && productId !== null
          && (!Number.isInteger(productId) || productId < 1))
        || !Number.isInteger(quantity) || quantity < 1 || quantity > 50
      ) {
        return res.status(400).json({ error: 'Confira o produto, o tamanho e a quantidade.' });
      }
      const key = JSON.stringify([productId ?? null, name.trim(), size.trim(), color ?? null]);
      const nextQuantity = (quantities.get(key)?.quantity || 0) + quantity;
      if (nextQuantity > 50) {
        return res.status(400).json({ error: 'A quantidade máxima por produto é 50 unidades.' });
      }
      quantities.set(key, {
        productId: productId ?? null,
        name: name.trim(),
        size: size.trim(),
        color: color ?? null,
        quantity: nextQuantity,
      });
    }

    const address = {
      street: String(payload.street || '').trim(),
      number: String(payload.number || '').trim(),
      complement: String(payload.complement || '').trim(),
      cep: String(payload.cep || '').trim(),
    };
    if (
      address.street.length > 160 || address.number.length > 20
      || address.complement.length > 120 || address.cep.length > 12
    ) {
      return res.status(400).json({ error: 'Confira os dados do endereço.' });
    }

    try {
      const selectedDelivery = db.prepare(`
        SELECT id, name, fee, requires_address
        FROM delivery_options WHERE id = ? AND active = 1
      `).get(deliveryId);
      if (!selectedDelivery) {
        throw new OrderConflict('A modalidade de entrega selecionada não está disponível.');
      }
      if (
        selectedDelivery.requires_address
        && (!address.street || !address.number || !address.cep)
      ) {
        throw new OrderValidationError('Preencha rua, número e CEP para esta modalidade de entrega.');
      }
      if (selectedDelivery.requires_address && !validCep(address.cep)) {
        throw new OrderValidationError('Informe um CEP de destino válido com 8 dígitos.');
      }
      const shippingQuote = selectedDelivery.requires_address
        ? await calculateShippingQuote(normalizeCep(address.cep))
        : null;
      const trackingToken = crypto.randomBytes(32).toString('hex');
      const createOrder = runTransaction(db, () => {
        const delivery = db.prepare(`
          SELECT id, name, fee, requires_address
          FROM delivery_options WHERE id = ? AND active = 1
        `).get(deliveryId);
        if (!delivery) throw new OrderConflict('A modalidade de entrega selecionada não está disponível.');
        if (delivery.requires_address && (!address.street || !address.number || !address.cep)) {
          throw new OrderValidationError('Preencha rua, número e CEP para esta modalidade de entrega.');
        }

        const selectedProducts = [];
        let subtotalCents = 0;
        for (const item of quantities.values()) {
          const product = item.productId
            ? db.prepare(`
              SELECT id_produto, nome, tamanho, cor, preco, estoque
              FROM produto WHERE id_produto = ?
            `).get(item.productId)
            : db.prepare(`
              SELECT id_produto, nome, tamanho, cor, preco, estoque
              FROM produto WHERE nome = ? AND tamanho = ?
                AND (? IS NULL OR cor = ?)
              ORDER BY id_produto LIMIT 2
            `).all(item.name, item.size, item.color, item.color);
          const matches = Array.isArray(product) ? product : product ? [product] : [];
          if (!matches.length) {
            throw new OrderConflict(`${item.name} no tamanho ${item.size} não está disponível.`);
          }
          if (matches.length > 1) {
            throw new OrderConflict(
              `Há mais de uma variante de ${item.name} no tamanho ${item.size}. Selecione a cor e tente novamente.`,
            );
          }
          const selected = matches[0];
          if (
            selected.nome !== item.name || selected.tamanho !== item.size
            || (item.color !== null && selected.cor !== item.color)
          ) {
            throw new OrderConflict('A variante do produto mudou. Atualize o carrinho.');
          }
          if (selected.preco === null) {
            throw new OrderConflict(`O preço de ${item.name} no tamanho ${item.size} não está cadastrado.`);
          }
          if (Number(selected.estoque) < item.quantity) {
            throw new OrderConflict(`Estoque insuficiente para ${item.name} no tamanho ${item.size}.`);
          }
          const priceCents = Math.round(Number(selected.preco) * 100);
          subtotalCents += priceCents * item.quantity;
          selectedProducts.push({ product: selected, quantity: item.quantity, priceCents });
        }

        const discountCents = paymentMethod === 'pix' ? roundHalfEvenRatio(subtotalCents, 10) : 0;
        const deliveryCents = shippingQuote
          ? shippingQuote.feeCents
          : Math.round(Number(delivery.fee) * 100);
        const totalCents = subtotalCents - discountCents + deliveryCents;
        const insertOrder = db.prepare(`
          INSERT INTO venda (
            id_cliente, customer_name, customer_email, customer_phone, delivery_option_id,
            payment_method, subtotal, discount_amount, delivery_fee, total,
            status, tracking_token, delivery_street, delivery_number, delivery_complement, delivery_cep
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, ?, ?, ?)
        `);
        const order = insertOrder.run(
          req.customer.id_cliente,
          customerName,
          customerEmail,
          phone || null,
          deliveryId,
          paymentMethod,
          subtotalCents / 100,
          discountCents / 100,
          deliveryCents / 100,
          totalCents / 100,
          trackingToken,
          address.street || null,
          address.number || null,
          address.complement || null,
          address.cep || null,
        );

        const updateStock = db.prepare(`
          UPDATE produto SET estoque = estoque - ?
          WHERE id_produto = ? AND estoque >= ?
        `);
        const insertItem = db.prepare(`
          INSERT INTO item_venda
            (id_venda, id_produto, product_name, size, quantity, unit_price)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const item of selectedProducts) {
          const result = updateStock.run(
            item.quantity,
            item.product.id_produto,
            item.quantity,
          );
          if (result.changes !== 1) {
            throw new OrderConflict(`O estoque de ${item.product.nome} acabou durante a finalização.`);
          }
          insertItem.run(
            order.lastInsertRowid,
            item.product.id_produto,
            item.product.nome,
            item.product.tamanho,
            item.quantity,
            item.priceCents / 100,
          );
        }
        return {
          orderId: Number(order.lastInsertRowid),
          total: money(totalCents / 100),
          shippingDistanceKm: shippingQuote?.distanceKm ?? null,
          trackingToken,
        };
      });
      let emailSent = false;
      const emailConfigured = isSmtpConfigured() || sendConfirmationEmail !== sendOrderConfirmation;
      let emailMessage = 'Pedido registrado. A confirmação automática por e-mail está desativada.';
      if (emailConfigured) {
        emailMessage = 'O pedido foi registrado, mas não foi possível enviar o e-mail de confirmação. Confira a configuração SMTP.';
        try {
          await sendConfirmationEmail({
            ...createOrder,
            customerName,
            customerEmail,
          });
          emailSent = true;
          emailMessage = 'E-mail de confirmação enviado.';
        } catch (error) {
          console.error(`Confirmation email for order #${createOrder.orderId} failed:`, error.message);
        }
      }
      return res.status(201).json({
        ...createOrder,
        status: 'awaiting_payment',
        message: 'Pedido registrado e aguardando a confirmação do pagamento.',
        emailSent,
        emailConfigured,
        emailMessage,
      });
    } catch (error) {
      if (error instanceof OrderConflict) return res.status(409).json({ error: error.message });
      if (error instanceof OrderValidationError) return res.status(400).json({ error: error.message });
      if (error instanceof ShippingServiceError) return res.status(503).json({ error: error.message });
      return next(error);
    }
  });

  app.get('/api/orders/track/:token', (req, res, next) => {
    const token = String(req.params.token || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(token)) {
      return res.status(404).json({ error: 'Link de acompanhamento inválido.' });
    }
    try {
      const order = db.prepare(`
        SELECT v.id_venda, v.status, v.created_at, v.payment_method, v.total,
               v.delivery_cep, d.name AS delivery_name
        FROM venda AS v
        LEFT JOIN delivery_options AS d ON d.id = v.delivery_option_id
        WHERE v.tracking_token = ?
      `).get(token);
      if (!order) {
        return res.status(404).json({ error: 'Pedido não encontrado. Confira o link de acompanhamento.' });
      }
      const items = db.prepare(`
        SELECT product_name, size, quantity, unit_price
        FROM item_venda WHERE id_venda = ? ORDER BY id_item_venda
      `).all(order.id_venda).map((item) => ({
        name: item.product_name,
        size: item.size,
        quantity: Number(item.quantity),
        unitPrice: money(item.unit_price),
      }));
      return res.json({
        data: {
          orderId: Number(order.id_venda),
          status: order.status,
          statusLabel: ORDER_STATUS_LABELS[order.status] || order.status,
          createdAt: order.created_at,
          paymentMethod: ({ pix: 'PIX', cartao: 'Cartão', boleto: 'Boleto' })[order.payment_method]
            || order.payment_method,
          total: money(order.total),
          deliveryName: order.delivery_name || 'Entrega',
          cep: order.delivery_cep,
          items,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.route('/login')
    .get((req, res) => {
      if (req.session.usuario) return res.redirect('/dashboard');
      return renderLogin(res, '', csrfToken(req));
    })
    .post((req, res, next) => {
      if (!validCsrf(req)) {
        return renderLogin(res, 'A sessão expirou. Atualize a página e tente novamente.', csrfToken(req), 400);
      }
      const login = String(req.body.login || req.body.email || '').trim();
      const password = String(req.body.senha || '');
      if (!login || !password) {
        return renderLogin(res, 'Preencha o usuário e a senha.', csrfToken(req));
      }
      try {
        const user = db.prepare(`
          SELECT id_funcionario, nome, senha, role, access_status
          FROM funcionarios
          WHERE (username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE)
            AND access_status = 'active'
        `).get(login, login);
        if (user && verifyPassword(password, user.senha)) {
          if (!isScryptHash(user.senha)) {
            db.prepare('UPDATE funcionarios SET senha = ? WHERE id_funcionario = ?')
              .run(hashPassword(password), user.id_funcionario);
          }
          req.session.regenerate((error) => {
            if (error) return next(error);
            req.session.usuario = user.nome;
            req.session.funcionario_id = user.id_funcionario;
            req.session.role = user.role || 'staff';
            csrfToken(req);
            return req.session.save((saveError) => {
              if (saveError) return next(saveError);
              res.redirect('/dashboard');
            });
          });
          return;
        }
        return renderLogin(res, 'E-mail ou senha incorretos.', csrfToken(req));
      } catch (error) {
        return next(error);
      }
    });

  app.post('/logout', (req, res) => {
    if (!validCsrf(req)) return res.sendStatus(400);
    req.session.destroy((error) => {
      if (error) return res.status(500).send('Não foi possível encerrar a sessão.');
      res.clearCookie('nexus.sid');
      res.redirect('/login');
    });
  });

  app.get('/staff', (_req, res) => res.redirect('/dashboard'));
  app.get('/login.html', (_req, res) => res.redirect('/login'));

  app.get('/dashboard', (req, res, next) => {
    if (!req.session.usuario) return res.redirect('/login');
    try {
      const employees = db.prepare(`
        SELECT id_funcionario, nome, username, email, cargo, role, commission_rate,
               salary, access_status
        FROM funcionarios ORDER BY nome
      `).all();
      const products = db.prepare(`
        SELECT id_produto, nome, tamanho, cor, preco, estoque
        FROM produto ORDER BY estoque ASC, nome, tamanho, cor LIMIT 100
      `).all();
      const orderRows = db.prepare(`
        SELECT v.id_venda, v.customer_name, v.customer_email, v.customer_phone,
               v.delivery_option_id, v.payment_method, v.subtotal, v.discount_amount,
               v.delivery_fee, v.total, v.status, v.delivery_street, v.delivery_number,
               v.delivery_complement, v.delivery_cep, v.created_at, v.tracking_token,
               d.name AS delivery_name
        FROM venda AS v
        LEFT JOIN delivery_options AS d ON d.id = v.delivery_option_id
        ORDER BY v.created_at DESC, v.id_venda DESC
        LIMIT 100
      `).all();
      const orderItems = db.prepare(`
        SELECT product_name, size, quantity, unit_price
        FROM item_venda WHERE id_venda = ? ORDER BY id_item_venda
      `);
      const customerOrders = orderRows.map((order) => ({
        ...order,
        items: orderItems.all(order.id_venda),
        status_label: ORDER_STATUS_LABELS[order.status] || order.status,
        payment_label: ({ pix: 'PIX', cartao: 'Cartão', boleto: 'Boleto' })[order.payment_method]
          || order.payment_method,
        next_statuses: (ORDER_STATUSES[order.status]?.next || []).map((status) => ({
          value: status,
          label: ORDER_STATUS_LABELS[status],
        })),
      }));
      const reservationSummary = db.prepare(`
        SELECT
          COUNT(DISTINCT CASE WHEN v.status = 'awaiting_payment' THEN v.id_venda END) AS pending_orders,
          COALESCE(SUM(CASE WHEN v.status IN ('awaiting_payment', 'paid', 'preparing')
            THEN iv.quantity ELSE 0 END), 0) AS reserved_units
        FROM venda AS v
        LEFT JOIN item_venda AS iv ON iv.id_venda = v.id_venda
      `).get();
      const completedStatuses = "'paid', 'preparing', 'shipped', 'delivered'";
      const salesSummary = db.prepare(`
        SELECT
          COUNT(CASE WHEN status IN (${completedStatuses}) THEN 1 END) AS completed_orders,
          COALESCE(SUM(CASE WHEN status IN (${completedStatuses}) THEN total ELSE 0 END), 0) AS revenue,
          COUNT(CASE WHEN status = 'awaiting_payment' THEN 1 END) AS pending_orders,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled_orders
        FROM venda
        WHERE date(created_at) >= date('now', '-29 days')
      `).get();
      const dailySales = db.prepare(`
        WITH RECURSIVE days(day) AS (
          SELECT date('now', '-6 days')
          UNION ALL
          SELECT date(day, '+1 day') FROM days WHERE day < date('now')
        )
        SELECT strftime('%d/%m', days.day) AS label,
               COUNT(CASE WHEN v.status IN (${completedStatuses}) THEN 1 END) AS orders,
               COALESCE(SUM(CASE WHEN v.status IN (${completedStatuses}) THEN v.total ELSE 0 END), 0) AS revenue
        FROM days
        LEFT JOIN venda AS v ON date(v.created_at) = days.day
        GROUP BY days.day
        ORDER BY days.day
      `).all().map((day) => ({
        ...day,
        orders: Number(day.orders),
        revenue: money(day.revenue),
      }));
      const suppliers = db.prepare(`
        SELECT id, code, name, category, contact_name, email, phone, lead_time_days, is_demo
        FROM suppliers WHERE active = 1 ORDER BY name
      `).all();
      const supplies = db.prepare(`
        SELECT i.id, i.sku, i.name, i.category, i.unit, i.current_stock,
               i.minimum_stock, i.unit_cost, i.supplier_id, s.name AS supplier_name
        FROM supplies AS i
        JOIN suppliers AS s ON s.id = i.supplier_id
        WHERE i.active = 1 AND s.active = 1
        ORDER BY (i.current_stock <= i.minimum_stock) DESC, i.name
      `).all();
      const purchaseOrders = db.prepare(`
        SELECT po.id, s.name AS supplier_name, po.status, po.total,
               po.created_at, po.notes, COUNT(poi.id) AS item_count
        FROM purchase_orders AS po
        JOIN suppliers AS s ON s.id = po.supplier_id
        LEFT JOIN purchase_order_items AS poi ON poi.order_id = po.id
        GROUP BY po.id, s.name, po.status, po.total, po.created_at, po.notes
        ORDER BY po.created_at DESC, po.id DESC LIMIT 10
      `).all().map((order) => ({
        ...order,
        status_label: order.status === 'requested'
          ? 'Aguardando recebimento'
          : order.status === 'received' ? 'Recebido' : order.status,
      }));
      const cashRegister = db.prepare(`
        SELECT cr.*, f.nome AS opened_by_name,
          COALESCE((SELECT SUM(CASE WHEN kind = 'sale' AND payment_method = 'dinheiro' THEN amount
            WHEN kind = 'addition' THEN amount WHEN kind = 'withdrawal' THEN -amount ELSE 0 END)
            FROM cash_entries WHERE register_id = cr.id), 0) AS cash_delta
        FROM cash_registers cr JOIN funcionarios f ON f.id_funcionario = cr.opened_by
        WHERE cr.status = 'open' ORDER BY cr.id DESC LIMIT 1
      `).get() || null;
      const cashHistory = db.prepare(`
        SELECT cr.id, cr.opened_at, cr.closed_at, cr.opening_amount, cr.closing_amount,
          cr.expected_amount, cr.status, f.nome AS opened_by_name
        FROM cash_registers cr JOIN funcionarios f ON f.id_funcionario = cr.opened_by
        ORDER BY cr.id DESC LIMIT 10
      `).all();
      const cashEntries = cashRegister ? db.prepare(`
        SELECT ce.*, f.nome AS employee_name FROM cash_entries ce
        JOIN funcionarios f ON f.id_funcionario = ce.employee_id
        WHERE ce.register_id = ? ORDER BY ce.id DESC LIMIT 30
      `).all(cashRegister.id) : [];
      const photoCounts = db.prepare(`
        SELECT COUNT(*) AS total,
          SUM(CASE WHEN pm.image_url IS NULL OR trim(pm.image_url) = '' THEN 1 ELSE 0 END) AS missing
        FROM (SELECT MIN(nome) AS nome FROM produto GROUP BY nome COLLATE NOCASE) AS p
        LEFT JOIN product_media AS pm ON pm.product_name = p.nome COLLATE NOCASE
      `).get();
      const productsWithoutPhotos = db.prepare(`
        SELECT p.nome FROM (SELECT MIN(nome) AS nome FROM produto GROUP BY nome COLLATE NOCASE) AS p
        LEFT JOIN product_media AS pm ON pm.product_name = p.nome COLLATE NOCASE
        WHERE pm.image_url IS NULL OR trim(pm.image_url) = ''
        ORDER BY p.nome
      `).all().map((row) => row.nome);
      const paidSales = db.prepare(`
        SELECT v.id_venda, v.customer_name, v.total, v.payment_method, v.status,
               v.created_at, f.nome AS confirmed_by
        FROM venda AS v
        LEFT JOIN cash_paid_sales AS cps ON cps.order_id = v.id_venda
        LEFT JOIN funcionarios AS f ON f.id_funcionario = cps.employee_id
        WHERE v.status IN ('paid', 'preparing', 'shipped', 'delivered')
        ORDER BY v.created_at DESC, v.id_venda DESC LIMIT 30
      `).all();
      const paidSalesTotal = db.prepare(`
        SELECT COALESCE(SUM(v.total), 0) AS total
        FROM venda AS v
        WHERE v.status IN ('paid', 'preparing', 'shipped', 'delivered')
      `).get().total;
      const paidSalesCount = db.prepare(`
        SELECT COUNT(*) AS count FROM venda
        WHERE status IN ('paid', 'preparing', 'shipped', 'delivered')
      `).get().count;
      const employeeAudit = roleAllowed(req, ['owner']) ? db.prepare(`
        SELECT a.action, a.details, a.created_at, actor.nome AS actor_name,
               subject.nome AS employee_name
        FROM employee_audit_log AS a
        JOIN funcionarios AS actor ON actor.id_funcionario = a.actor_id
        JOIN funcionarios AS subject ON subject.id_funcionario = a.employee_id
        ORDER BY a.id DESC LIMIT 20
      `).all().map((entry) => ({
        ...entry,
        details: JSON.parse(entry.details),
        details_text: entry.details,
      })) : [];
      const notice = req.session.dashboard_notice || null;
      delete req.session.dashboard_notice;
      const totalProducts = Number(photoCounts.total || 0);
      const productsWithPhotos = totalProducts - Number(photoCounts.missing || 0);
      const demoSuppliers = [
        { name: 'Fio & Trama Têxtil', category: 'Tecidos', email: 'compras@fioetrama.example' },
        { name: 'Cor & Forma Estamparia', category: 'Estamparia', email: 'pedidos@coreforma.example' },
        { name: 'Embalagem Circular', category: 'Embalagens', email: 'vendas@embalagemcircular.example' },
      ];
      return res.render('dashboard.html', {
        nome: req.session.usuario,
        papel: req.session.role || 'staff',
        funcionarios: employees,
        produtos: products,
        unidades_estoque: products.reduce((sum, product) => sum + Number(product.estoque), 0),
        pedidos_venda: customerOrders,
        pedidos_aguardando: Number(reservationSummary.pending_orders || 0),
        unidades_reservadas: Number(reservationSummary.reserved_units || 0),
        relatorio_vendas: {
          pedidos: Number(salesSummary.completed_orders || 0),
          faturamento: money(salesSummary.revenue),
          aguardando: Number(salesSummary.pending_orders || 0),
          cancelados: Number(salesSummary.cancelled_orders || 0),
          diario: dailySales,
        },
        fornecedores: suppliers,
        materiais: supplies,
        pedidos_compra: purchaseOrders,
        caixa_aberto: cashRegister,
        caixa_historico: cashHistory,
        caixa_movimentos: cashEntries,
        entradas_confirmadas: paidSales,
        total_entradas_confirmadas: money(paidSalesTotal),
        total_pedidos_pagamento_confirmado: Number(paidSalesCount),
        produtos_com_foto: productsWithPhotos,
        percentual_fotos: totalProducts
          ? Math.round((productsWithPhotos * 100) / totalProducts)
          : 0,
        produtos_sem_foto: productsWithoutPhotos,
        auditoria_funcionarios: employeeAudit,
        fornecedores_demo: demoSuppliers,
        csrf_token: csrfToken(req),
        aviso: notice,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/dashboard/products/:productId/stock', (req, res, next) => {
    if (!req.session.funcionario_id) return res.redirect('/login');
    if (!roleAllowed(req, ['owner', 'manager'])) return res.sendStatus(403);
    if (!validCsrf(req)) return res.sendStatus(400);
    const productId = Number(req.params.productId);
    const stock = Number(req.body.stock);
    if (!Number.isSafeInteger(productId) || !Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) {
      req.session.dashboard_notice = { message: 'Informe um estoque inteiro entre 0 e 1.000.000.', kind: 'error' };
      return res.redirect('/dashboard#estoque');
    }
    try {
      const result = db.prepare('UPDATE produto SET estoque = ? WHERE id_produto = ?').run(stock, productId);
      req.session.dashboard_notice = result.changes
        ? { message: 'Estoque atualizado.', kind: 'success' }
        : { message: 'Produto não encontrado.', kind: 'error' };
      return res.redirect('/dashboard#estoque');
    } catch (error) { return next(error); }
  });

  app.post('/dashboard/employees', (req, res, next) => {
    if (!req.session.funcionario_id) return res.redirect('/login');
    if (!roleAllowed(req, ['owner'])) return res.sendStatus(403);
    if (!validCsrf(req)) return res.sendStatus(400);
    const nome = String(req.body.nome || '').trim();
    const username = String(req.body.username || '').trim().toLowerCase();
    const email = String(req.body.email || '').trim().toLowerCase();
    const cargo = String(req.body.cargo || '').trim();
    const password = String(req.body.senha || '');
    const role = String(req.body.role || 'staff');
    const salary = Number(req.body.salary || 0);
    if (
      !nome || nome.length > 120 || !/^[a-z0-9._-]{3,32}$/.test(username)
      || !EMAIL_PATTERN.test(email) || !cargo || cargo.length > 80
      || password.length < 12 || password.length > 256
      || !['manager', 'cashier', 'staff'].includes(role)
      || !Number.isFinite(salary) || salary < 0 || salary > 10000000
    ) {
      req.session.dashboard_notice = {
        message: 'Confira os dados, senha (mínimo 12 caracteres), função e salário.',
        kind: 'error',
      };
      return res.redirect('/dashboard#equipe');
    }
    try {
      const hash = hashPassword(password);
      const employeeId = runTransaction(db, () => {
        const result = db.prepare(`
          INSERT INTO funcionarios
            (nome, username, email, cargo, senha, role, salary, access_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
        `).run(nome, username, email, cargo, hash, role, salary);
        const id = Number(result.lastInsertRowid);
        auditEmployeeChange(
          db,
          req.session.funcionario_id,
          id,
          'created',
          { username, role, salary },
        );
        return id;
      });
      req.session.dashboard_notice = { message: `Funcionário ${nome} cadastrado.`, kind: 'success' };
      return res.redirect('/dashboard#equipe');
    } catch (error) {
      req.session.dashboard_notice = {
        message: error.code === 'SQLITE_CONSTRAINT_UNIQUE'
          ? 'Este usuário ou e-mail já está cadastrado.'
          : 'Não foi possível cadastrar o funcionário.',
        kind: 'error',
      };
      return res.redirect('/dashboard#equipe');
    }
  });

  app.post('/dashboard/employees/:employeeId', (req, res) => {
    if (!req.session.funcionario_id) return res.redirect('/login');
    if (!roleAllowed(req, ['owner'])) return res.sendStatus(403);
    if (!validCsrf(req)) return res.sendStatus(400);
    const employeeId = Number(req.params.employeeId);
    const role = String(req.body.role || '');
    const accessStatus = String(req.body.access_status || '');
    const salary = Number(req.body.salary);
    const password = String(req.body.senha || '');
    const employee = Number.isSafeInteger(employeeId) && employeeId > 0
      ? db.prepare(`
        SELECT id_funcionario, username, role, access_status, salary
        FROM funcionarios WHERE id_funcionario = ?
      `).get(employeeId)
      : null;
    if (
      !employee
      || !['owner', 'manager', 'cashier', 'staff'].includes(role)
      || !['active', 'blocked'].includes(accessStatus)
      || !Number.isFinite(salary) || salary < 0 || salary > 10000000
      || (password && (password.length < 12 || password.length > 256))
    ) {
      req.session.dashboard_notice = { message: 'Confira função, acesso, salário e a nova senha (mínimo 12 caracteres).', kind: 'error' };
      return res.redirect('/dashboard#equipe');
    }
    if (employeeId === req.session.funcionario_id && (role !== 'owner' || accessStatus !== 'active')) {
      req.session.dashboard_notice = { message: 'Não é permitido bloquear ou rebaixar sua própria conta de proprietário.', kind: 'error' };
      return res.redirect('/dashboard#equipe');
    }
    if (employee.role === 'owner' && (role !== 'owner' || accessStatus !== 'active')) {
      const otherOwners = db.prepare(`
        SELECT COUNT(*) AS count FROM funcionarios
        WHERE role = 'owner' AND access_status = 'active' AND id_funcionario != ?
      `).get(employeeId).count;
      if (otherOwners < 1) {
        req.session.dashboard_notice = { message: 'Mantenha pelo menos um proprietário ativo no sistema.', kind: 'error' };
        return res.redirect('/dashboard#equipe');
      }
    }
    const updateEmployee = db.prepare(`
      UPDATE funcionarios
      SET role = ?, access_status = ?, salary = ?, senha = COALESCE(?, senha)
      WHERE id_funcionario = ?
    `);
    const passwordHash = password ? hashPassword(password) : null;
    runTransaction(db, () => {
      updateEmployee.run(role, accessStatus, salary, passwordHash, employeeId);
      auditEmployeeChange(db, req.session.funcionario_id, employeeId, 'updated', {
        username: employee.username,
        role: { from: employee.role, to: role },
        accessStatus: { from: employee.access_status, to: accessStatus },
        salary: { from: Number(employee.salary), to: salary },
        passwordReset: Boolean(password),
      });
    });
    req.session.dashboard_notice = { message: 'Acesso e dados do funcionário atualizados.', kind: 'success' };
    return res.redirect('/dashboard#equipe');
  });

  app.post('/dashboard/products/media', (req, res) => {
    if (!req.session.funcionario_id) return res.redirect('/login');
    if (!roleAllowed(req, ['owner', 'manager'])) return res.sendStatus(403);
    if (!validCsrf(req)) return res.sendStatus(400);
    const productName = String(req.body.product_name || '').trim();
    const imageUrl = String(req.body.image_url || '').trim();
    const remoteImage = /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s]*)?$/i.test(imageUrl);
    const localImage = /^(?:\/(?!\/))?[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(imageUrl)
      && imageUrl.split('/').every((part) => part !== '.' && part !== '..');
    if (
      !productName || productName.length > 120 || !imageUrl || imageUrl.length > 500
      || !(remoteImage || localImage)
      || !db.prepare('SELECT 1 FROM produto WHERE nome = ? COLLATE NOCASE').get(productName)
    ) {
      req.session.dashboard_notice = { message: 'Informe o produto cadastrado e uma URL https ou caminho local de imagem válido.', kind: 'error' };
      return res.redirect('/dashboard#fotos');
    }
    db.prepare(`
      INSERT INTO product_media (product_name, image_url, updated_by)
      VALUES (?, ?, ?)
      ON CONFLICT(product_name) DO UPDATE SET
        image_url = excluded.image_url,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `).run(productName, imageUrl, req.session.funcionario_id);
    req.session.dashboard_notice = { message: `Foto cadastrada para ${productName}.`, kind: 'success' };
    return res.redirect('/dashboard#fotos');
  });

  app.post('/dashboard/cash/open', (req, res) => {
    if (!req.session.funcionario_id) return res.redirect('/login');
    if (!roleAllowed(req, ['owner', 'manager', 'cashier'])) return res.sendStatus(403);
    if (!validCsrf(req)) return res.sendStatus(400);
    const opening = Number(req.body.opening_amount);
    if (!Number.isFinite(opening) || opening < 0 || opening > 10000000) {
      req.session.dashboard_notice = { message: 'Informe um saldo inicial válido.', kind: 'error' };
      return res.redirect('/dashboard#caixa');
    }
    try {
      const result = runTransaction(db, () => {
        if (db.prepare("SELECT id FROM cash_registers WHERE status = 'open'").get()) throw new Error('Já existe um caixa aberto.');
        return db.prepare('INSERT INTO cash_registers (opened_by, opening_amount) VALUES (?, ?)')
          .run(req.session.funcionario_id, opening);
      });
      req.session.dashboard_notice = { message: `Caixa #${result.lastInsertRowid} aberto.`, kind: 'success' };
    } catch (error) { req.session.dashboard_notice = { message: error.message, kind: 'error' }; }
    return res.redirect('/dashboard#caixa');
  });

  app.post('/dashboard/cash/entries', (req, res) => {
    if (!req.session.funcionario_id) return res.redirect('/login');
    if (!roleAllowed(req, ['owner', 'manager', 'cashier'])) return res.sendStatus(403);
    if (!validCsrf(req)) return res.sendStatus(400);
    const kind = String(req.body.kind || '');
    const payment = String(req.body.payment_method || 'dinheiro');
    const amount = Number(req.body.amount);
    const note = String(req.body.note || '').trim().slice(0, 200);
    const register = db.prepare("SELECT id FROM cash_registers WHERE status = 'open' ORDER BY id DESC LIMIT 1").get();
    if (!register || !['sale', 'withdrawal', 'addition'].includes(kind) || !['dinheiro', 'pix', 'cartao'].includes(payment) || !Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
      req.session.dashboard_notice = { message: 'Confira o caixa aberto e os dados do lançamento.', kind: 'error' };
    } else {
      db.prepare(`INSERT INTO cash_entries (register_id, employee_id, kind, payment_method, amount, note) VALUES (?,?,?,?,?,?)`)
        .run(register.id, req.session.funcionario_id, kind, payment, amount, note || null);
      req.session.dashboard_notice = { message: 'Movimento registrado no caixa.', kind: 'success' };
    }
    return res.redirect('/dashboard#caixa');
  });

  app.post('/dashboard/cash/close', (req, res) => {
    if (!req.session.funcionario_id) return res.redirect('/login');
    if (!roleAllowed(req, ['owner', 'manager', 'cashier'])) return res.sendStatus(403);
    if (!validCsrf(req)) return res.sendStatus(400);
    const register = db.prepare("SELECT * FROM cash_registers WHERE status = 'open' ORDER BY id DESC LIMIT 1").get();
    const counted = Number(req.body.closing_amount);
    if (!register || !Number.isFinite(counted) || counted < 0 || counted > 10000000) {
      req.session.dashboard_notice = { message: 'Informe a contagem final do caixa.', kind: 'error' };
    } else {
      const movements = db.prepare(`SELECT COALESCE(SUM(CASE WHEN kind='sale' AND payment_method='dinheiro' THEN amount WHEN kind='addition' THEN amount WHEN kind='withdrawal' THEN -amount ELSE 0 END),0) AS delta FROM cash_entries WHERE register_id = ?`).get(register.id);
      const expected = Math.round((Number(register.opening_amount) + Number(movements.delta)) * 100) / 100;
      db.prepare("UPDATE cash_registers SET status='closed', closing_amount=?, expected_amount=?, closed_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'")
        .run(counted, expected, register.id);
      const difference = (counted - expected).toFixed(2).replace('.', ',');
      req.session.dashboard_notice = { message: `Caixa fechado. Esperado R$ ${expected.toFixed(2).replace('.', ',')}; diferença R$ ${difference}.`, kind: 'success' };
    }
    return res.redirect('/dashboard#caixa');
  });

  app.post('/dashboard/orders/:orderId/status', (req, res, next) => {
    if (!req.session.usuario) return res.redirect('/login');
    if (!roleAllowed(req, ['owner', 'manager', 'cashier'])) return res.sendStatus(403);
    if (!validCsrf(req)) return res.sendStatus(400);
    const orderId = Number(req.params.orderId);
    const nextStatus = String(req.body.status || '').trim();
    if (!Number.isSafeInteger(orderId) || orderId < 1) {
      req.session.dashboard_notice = { message: 'Número de pedido inválido.', kind: 'error' };
      return res.redirect('/dashboard#pedidos');
    }

    try {
      const updated = runTransaction(db, () => {
        const order = db.prepare('SELECT id_venda, status FROM venda WHERE id_venda = ?').get(orderId);
        const allowedNext = ORDER_STATUSES[order?.status]?.next || [];
        if (!order || !allowedNext.includes(nextStatus)) {
          throw new OrderConflict('O status selecionado não é válido para este pedido.');
        }

        if (nextStatus === 'cancelled') {
          const items = db.prepare(`
            SELECT id_produto, quantity FROM item_venda WHERE id_venda = ?
          `).all(orderId);
          if (!items.length) throw new OrderConflict('O pedido não possui itens para devolver ao estoque.');
          const releaseStock = db.prepare(`
            UPDATE produto SET estoque = estoque + ? WHERE id_produto = ?
          `);
          for (const item of items) {
            if (releaseStock.run(item.quantity, item.id_produto).changes !== 1) {
              throw new OrderConflict('Não foi possível liberar uma das peças reservadas.');
            }
          }
        }

        db.prepare('UPDATE venda SET status = ? WHERE id_venda = ?').run(nextStatus, orderId);
        if (nextStatus === 'paid') {
          db.prepare(`
            INSERT INTO cash_paid_sales (order_id, employee_id, amount, payment_method)
            SELECT id_venda, ?, total, payment_method
            FROM venda WHERE id_venda = ?
            ON CONFLICT(order_id) DO NOTHING
          `).run(req.session.funcionario_id, orderId);
        }
        return { previousStatus: order.status, nextStatus };
      });
      const message = updated.nextStatus === 'cancelled'
        ? `Pedido #${orderId} cancelado; as peças reservadas voltaram ao estoque disponível.`
        : `Pedido #${orderId} atualizado para ${ORDER_STATUS_LABELS[updated.nextStatus]}.`;
      req.session.dashboard_notice = { message, kind: 'success' };
      return res.redirect('/dashboard#pedidos');
    } catch (error) {
      req.session.dashboard_notice = {
        message: error instanceof OrderConflict ? error.message : 'Não foi possível atualizar o pedido.',
        kind: 'error',
      };
      if (!(error instanceof OrderConflict)) console.error('Could not update customer order:', error);
      return res.redirect('/dashboard#pedidos');
    }
  });

  app.get('/dashboard/orders/:orderId/receipt', (req, res, next) => {
    if (!req.session.funcionario_id) return res.redirect('/login');
    if (!roleAllowed(req, ['owner', 'manager', 'cashier'])) return res.sendStatus(403);
    const orderId = Number(req.params.orderId);
    if (!Number.isSafeInteger(orderId) || orderId < 1) return res.sendStatus(404);
    try {
      const order = db.prepare(`
        SELECT v.*, d.name AS delivery_name
        FROM venda AS v
        LEFT JOIN delivery_options AS d ON d.id = v.delivery_option_id
        WHERE v.id_venda = ?
      `).get(orderId);
      if (!order) return res.sendStatus(404);
      if (!['paid', 'preparing', 'shipped', 'delivered'].includes(order.status)) {
        return res.status(409).send('O recibo interno só pode ser gerado após a confirmação do pagamento.');
      }
      const items = db.prepare(`
        SELECT product_name, size, quantity, unit_price
        FROM item_venda WHERE id_venda = ? ORDER BY id_item_venda
      `).all(orderId);
      return res.render('receipt.html', {
        pedido: {
          ...order,
          id_venda: Number(order.id_venda),
          items,
          payment_label: ({ pix: 'PIX', cartao: 'Cartão', boleto: 'Boleto' })[order.payment_method]
            || order.payment_method,
          status_label: ORDER_STATUS_LABELS[order.status] || order.status,
        },
        data_emissao: new Date().toLocaleString('pt-BR'),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/dashboard/purchases', (req, res, next) => {
    if (!req.session.usuario) return res.redirect('/login');
    if (!roleAllowed(req, ['owner', 'manager'])) return res.sendStatus(403);
    if (!validCsrf(req)) return res.sendStatus(400);
    const supplyId = Number(req.body.supply_id);
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(supplyId) || !Number.isInteger(quantity)) {
      req.session.dashboard_notice = { message: 'Selecione um material e informe uma quantidade inteira.', kind: 'error' };
      return res.redirect('/dashboard');
    }
    if (supplyId < 1 || quantity < 1 || quantity > 10000) {
      req.session.dashboard_notice = { message: 'A quantidade deve estar entre 1 e 10.000 unidades.', kind: 'error' };
      return res.redirect('/dashboard');
    }

    try {
      const createPurchase = runTransaction(db, () => {
        const supply = db.prepare(`
          SELECT i.id, i.supplier_id, i.name, i.unit, i.unit_cost
          FROM supplies AS i
          JOIN suppliers AS s ON s.id = i.supplier_id
          WHERE i.id = ? AND i.active = 1 AND s.active = 1
        `).get(supplyId);
        if (!supply) throw new OrderConflict('O material selecionado não está disponível.');
        const total = Math.round(Number(supply.unit_cost) * quantity * 100) / 100;
        const notes = String(req.body.notes || '').trim().slice(0, 255);
        const order = db.prepare(`
          INSERT INTO purchase_orders (supplier_id, status, total, created_by, notes)
          VALUES (?, 'requested', ?, ?, ?)
        `).run(supply.supplier_id, total, req.session.usuario, notes || null);
        db.prepare(`
          INSERT INTO purchase_order_items (order_id, supply_id, quantity, unit_cost)
          VALUES (?, ?, ?, ?)
        `).run(order.lastInsertRowid, supply.id, quantity, supply.unit_cost);
        return { id: Number(order.lastInsertRowid), name: supply.name };
      });
      req.session.dashboard_notice = {
        message: `Pedido de demonstração #${createPurchase.id} registrado para ${createPurchase.name}. Ele não foi enviado ao fornecedor.`,
        kind: 'success',
      };
      return res.redirect('/dashboard');
    } catch (error) {
      if (error instanceof OrderConflict) {
        req.session.dashboard_notice = { message: error.message, kind: 'error' };
        return res.redirect('/dashboard');
      }
      return next(error);
    }
  });

  app.post('/dashboard/purchases/:orderId/receive', (req, res, next) => {
    if (!req.session.usuario) return res.redirect('/login');
    if (!roleAllowed(req, ['owner', 'manager'])) return res.sendStatus(403);
    if (!validCsrf(req)) return res.sendStatus(400);
    const orderId = Number(req.params.orderId);
    try {
      runTransaction(db, () => {
        const order = db.prepare('SELECT id, status FROM purchase_orders WHERE id = ?').get(orderId);
        if (!order || order.status !== 'requested') {
          throw new OrderConflict('Este pedido não existe ou já foi recebido.');
        }
        const items = db.prepare(`
          SELECT supply_id, quantity FROM purchase_order_items WHERE order_id = ?
        `).all(orderId);
        if (!items.length) throw new OrderConflict('O pedido não possui materiais para receber.');
        const updateStock = db.prepare('UPDATE supplies SET current_stock = current_stock + ? WHERE id = ?');
        for (const item of items) {
          if (updateStock.run(item.quantity, item.supply_id).changes !== 1) {
            throw new OrderConflict('Um material deste pedido não existe mais no estoque.');
          }
        }
        db.prepare(`
          UPDATE purchase_orders SET status = 'received', received_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(orderId);
      });
      req.session.dashboard_notice = {
        message: `Pedido de demonstração #${orderId} recebido; estoque atualizado.`,
        kind: 'success',
      };
      return res.redirect('/dashboard');
    } catch (error) {
      req.session.dashboard_notice = {
        message: error instanceof OrderConflict ? error.message : 'Não foi possível confirmar o recebimento.',
        kind: 'error',
      };
      if (!(error instanceof OrderConflict)) console.error('Could not receive supplier purchase:', error);
      return res.redirect('/dashboard');
    }
  });

  app.get('*', (req, res, next) => {
    let relativePath;
    try {
      relativePath = decodeURIComponent(req.path.slice(1));
    } catch {
      return res.sendStatus(400);
    }
    const parts = relativePath.split(/[\\/]/);
    const resolvedPath = path.resolve(BASE_DIR, relativePath);
    if (
      path.isAbsolute(relativePath)
      || parts.some((part) => part.startsWith('.') || PRIVATE_DIRECTORIES.has(part.toLowerCase()))
      || !PUBLIC_EXTENSIONS.has(path.extname(relativePath).toLowerCase())
      || !resolvedPath.startsWith(`${BASE_DIR}${path.sep}`)
    ) {
      return res.sendStatus(404);
    }
    return res.sendFile(resolvedPath, (error) => {
      if (error) next(error);
    });
  });

  app.use((error, _req, res, _next) => {
    console.error('NEXUS server request failed:', error);
    if (res.headersSent) return;
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Envie um JSON válido.' });
    }
    if (error.status === 413) {
      return res.status(413).json({ error: 'A solicitação excede o tamanho permitido.' });
    }
    return res.status(500).json({ error: 'O servidor não conseguiu concluir a solicitação.' });
  });

  return { app, db };
}

if (require.main === module) {
  const { app, db } = createApp();
  const host = process.env.NEXUS_WEB_HOST || '0.0.0.0';
  const port = Number(process.env.NEXUS_WEB_PORT || 8081);
  const server = app.listen(port, host, () => {
    console.log(`NEXUS em http://${host === '0.0.0.0' ? 'localhost' : host}:${port} (SQLite)`);
  });
  const close = () => server.close(() => {
    db.close();
    process.exit(0);
  });
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

module.exports = { createApp, money };
