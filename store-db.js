const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DATABASE_PATH = process.env.NEXUS_SQLITE_PATH || path.join(DATA_DIR, 'nexus-store.sqlite3');

function openDatabase(databasePath = DATABASE_PATH, { seed = true } = {}) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS clientes (
      id_cliente INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      telefone TEXT,
      cpf TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      endereco TEXT,
      status TEXT NOT NULL DEFAULT 'ativo'
    );
    CREATE TABLE IF NOT EXISTS customer_credentials (
      customer_id INTEGER PRIMARY KEY REFERENCES clientes(id_cliente) ON DELETE CASCADE,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS funcionarios (
      id_funcionario INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      telefone TEXT,
      cpf TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      endereco TEXT,
      cargo TEXT NOT NULL,
      senha TEXT
    );
    CREATE TABLE IF NOT EXISTS produto (
      id_produto INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      tamanho TEXT NOT NULL,
      cor TEXT NOT NULL DEFAULT '',
      preco REAL NOT NULL CHECK (preco >= 0),
      estoque INTEGER NOT NULL DEFAULT 0 CHECK (estoque >= 0),
      CONSTRAINT uq_produto_variant UNIQUE (
        nome COLLATE NOCASE, tamanho COLLATE NOCASE, cor COLLATE NOCASE
      )
    );
    CREATE TABLE IF NOT EXISTS delivery_options (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      fee REAL NOT NULL DEFAULT 0 CHECK (fee >= 0),
      estimate TEXT NOT NULL,
      requires_address INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS venda (
      id_venda INTEGER PRIMARY KEY,
      id_cliente INTEGER REFERENCES clientes(id_cliente),
      customer_name TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      delivery_option_id TEXT REFERENCES delivery_options(id),
      payment_method TEXT,
      subtotal REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      delivery_fee REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'awaiting_payment',
      tracking_token TEXT,
      delivery_street TEXT,
      delivery_number TEXT,
      delivery_complement TEXT,
      delivery_cep TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS item_venda (
      id_item_venda INTEGER PRIMARY KEY,
      id_venda INTEGER NOT NULL REFERENCES venda(id_venda),
      id_produto INTEGER NOT NULL REFERENCES produto(id_produto),
      product_name TEXT NOT NULL,
      size TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price REAL NOT NULL CHECK (unit_price >= 0)
    );
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      lead_time_days INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      is_demo INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS supplies (
      id INTEGER PRIMARY KEY,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit TEXT NOT NULL,
      current_stock REAL NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
      minimum_stock REAL NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
      unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      is_demo INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      status TEXT NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'received', 'cancelled')),
      total REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
      created_by TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      received_at TEXT
    );
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
      supply_id INTEGER NOT NULL REFERENCES supplies(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_cost REAL NOT NULL CHECK (unit_cost >= 0)
    );
    CREATE TABLE IF NOT EXISTS web_sessions (
      sid TEXT PRIMARY KEY,
      session_json TEXT NOT NULL,
      expires_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_created
      ON purchase_orders(created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_order ON purchase_order_items(order_id);
  `);

  const employeeColumns = new Set(db.prepare('PRAGMA table_info(funcionarios)').all().map((column) => column.name));
  if (!employeeColumns.has('role')) db.exec("ALTER TABLE funcionarios ADD COLUMN role TEXT NOT NULL DEFAULT 'staff'");
  if (!employeeColumns.has('commission_rate')) db.exec('ALTER TABLE funcionarios ADD COLUMN commission_rate REAL NOT NULL DEFAULT 0');
  if (!employeeColumns.has('username')) db.exec('ALTER TABLE funcionarios ADD COLUMN username TEXT');
  if (!employeeColumns.has('salary')) db.exec('ALTER TABLE funcionarios ADD COLUMN salary REAL NOT NULL DEFAULT 0');
  if (!employeeColumns.has('access_status')) {
    db.exec("ALTER TABLE funcionarios ADD COLUMN access_status TEXT NOT NULL DEFAULT 'active'");
  }
  const employeesWithoutLogin = db.prepare(`
    SELECT id_funcionario, email FROM funcionarios WHERE username IS NULL OR username = ''
  `).all();
  const updateEmployeeLogin = db.prepare(`
    UPDATE funcionarios SET username = ? WHERE id_funcionario = ?
  `);
  const findEmployeeLogin = db.prepare(`
    SELECT id_funcionario FROM funcionarios WHERE username = ? COLLATE NOCASE
  `);
  for (const employee of employeesWithoutLogin) {
    const emailPrefix = String(employee.email || '').split('@', 1)[0].toLowerCase();
    const baseLogin = emailPrefix.replace(/[^a-z0-9._-]/g, '').slice(0, 24) || 'funcionario';
    let login = baseLogin;
    let suffix = 1;
    while (findEmployeeLogin.get(login)) {
      login = `${baseLogin.slice(0, 24 - String(suffix).length)}${suffix}`;
      suffix += 1;
    }
    updateEmployeeLogin.run(login, employee.id_funcionario);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_funcionarios_username ON funcionarios(username COLLATE NOCASE)');
  const defaultPasswordHash = crypto.createHash('sha256').update('admin123').digest('hex');
  db.prepare(`
    UPDATE funcionarios SET access_status = 'blocked'
    WHERE senha = ? AND lower(email) = 'kelvinsoares@nexus.com.br'
  `).run(defaultPasswordHash);
  db.exec("UPDATE funcionarios SET role = 'owner' WHERE lower(email) = 'kelvinsoares@nexus.com.br' OR cargo = 'Coordenador TI'");
  db.exec(`
    CREATE TABLE IF NOT EXISTS employee_audit_log (
      id INTEGER PRIMARY KEY,
      actor_id INTEGER NOT NULL REFERENCES funcionarios(id_funcionario),
      employee_id INTEGER NOT NULL REFERENCES funcionarios(id_funcionario),
      action TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_employee_audit_created
      ON employee_audit_log(created_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS product_media (
      product_name TEXT PRIMARY KEY COLLATE NOCASE,
      image_url TEXT NOT NULL,
      updated_by INTEGER REFERENCES funcionarios(id_funcionario),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cash_paid_sales (
      order_id INTEGER PRIMARY KEY REFERENCES venda(id_venda),
      employee_id INTEGER NOT NULL REFERENCES funcionarios(id_funcionario),
      amount REAL NOT NULL CHECK (amount > 0),
      payment_method TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cash_paid_sales_created
      ON cash_paid_sales(created_at DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cash_registers (
      id INTEGER PRIMARY KEY,
      opened_by INTEGER NOT NULL REFERENCES funcionarios(id_funcionario),
      opening_amount REAL NOT NULL CHECK (opening_amount >= 0),
      closing_amount REAL,
      expected_amount REAL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS cash_entries (
      id INTEGER PRIMARY KEY,
      register_id INTEGER NOT NULL REFERENCES cash_registers(id),
      employee_id INTEGER NOT NULL REFERENCES funcionarios(id_funcionario),
      kind TEXT NOT NULL CHECK (kind IN ('sale', 'withdrawal', 'addition')),
      payment_method TEXT NOT NULL DEFAULT 'dinheiro',
      amount REAL NOT NULL CHECK (amount > 0),
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cash_register_status ON cash_registers(status, opened_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cash_entries_register ON cash_entries(register_id, created_at);
  `);

  const saleColumns = new Set(db.prepare('PRAGMA table_info(venda)').all().map((column) => column.name));
  if (!saleColumns.has('id_cliente')) {
    db.exec('ALTER TABLE venda ADD COLUMN id_cliente INTEGER REFERENCES clientes(id_cliente)');
  }
  if (!saleColumns.has('tracking_token')) {
    db.exec('ALTER TABLE venda ADD COLUMN tracking_token TEXT');
  }
  db.exec(`
    UPDATE venda
    SET tracking_token = lower(hex(randomblob(32)))
    WHERE tracking_token IS NULL
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_venda_tracking_token
    ON venda(tracking_token) WHERE tracking_token IS NOT NULL
  `);

  if (seed) seedDefaults(db);
  return db;
}

function seedDefaults(db) {
  runTransaction(db, () => {
    const insertDelivery = db.prepare(`
      INSERT OR IGNORE INTO delivery_options
        (id, name, fee, estimate, requires_address, active, display_order)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);
    [
      ['store_pickup', 'Retirada na loja', 0, 'Combine o horário após a confirmação', 0, 1],
      ['local_courier', 'Entrega local / motoboy', 10, '1 dia útil', 1, 2],
      ['express_carrier', 'Transportadora expressa', 25, '3 dias úteis', 1, 3],
      ['sedex', 'Correios - SEDEX', 38, '5 dias úteis', 1, 4],
    ].forEach((option) => insertDelivery.run(...option));

    const productCount = db.prepare('SELECT COUNT(*) AS count FROM produto').get().count;
    if (productCount === 0) {
      const products = [
        ['Graphic Nexus', 'P', 'Unica', 249, 100],
        ['Graphic Nexus', 'M', 'Unica', 249, 100],
        ['Graphic Nexus', 'G', 'Unica', 249, 100],
        ['Graphic Nexus', 'GG', 'Unica', 249, 100],
        ['Nexus Logo Tee', 'P', 'Unica', 189, 100],
        ['Nexus Logo Tee', 'M', 'Unica', 189, 100],
        ['Nexus Logo Tee', 'G', 'Unica', 189, 100],
        ['Nexus Logo Tee', 'GG', 'Unica', 189, 100],
        ['Cap Nexus', 'Unico', 'Unica', 119, 100],
        ['Utility Cargo', '38', 'Unica', 329, 100],
        ['Utility Cargo', '40', 'Unica', 329, 100],
        ['Utility Cargo', '42', 'Unica', 329, 100],
        ['Utility Cargo', '44', 'Unica', 329, 100],
        ['Utility Cargo', '46', 'Unica', 329, 100],
      ];
      const insertProduct = db.prepare(`
        INSERT INTO produto (nome, tamanho, cor, preco, estoque) VALUES (?, ?, ?, ?, ?)
      `);
      products.forEach((product) => insertProduct.run(...product));
    }

    const supplierCount = db.prepare('SELECT COUNT(*) AS count FROM suppliers').get().count;
    if (supplierCount === 0) {
      const suppliers = [
        ['DEMO-TEXTIL', 'Fio & Trama Têxtil', 'Tecidos', 'Contato fictício', 'compras@fioetrama.example', 7],
        ['DEMO-ESTAMPARIA', 'Cor & Forma Estamparia', 'Estamparia', 'Contato fictício', 'pedidos@coreforma.example', 5],
        ['DEMO-EMBALAGEM', 'Embalagem Circular', 'Embalagens', 'Contato fictício', 'vendas@embalagemcircular.example', 4],
      ];
      const insertSupplier = db.prepare(`
        INSERT INTO suppliers (code, name, category, contact_name, email, lead_time_days)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      suppliers.forEach((supplier) => insertSupplier.run(...supplier));
    }

    const supplyCount = db.prepare('SELECT COUNT(*) AS count FROM supplies').get().count;
    if (supplyCount === 0) {
      const supplies = [
        ['MAT-ALG-30', 'Malha de algodão penteado', 'Matéria-prima', 'kg', 18, 10, 42.9, 'DEMO-TEXTIL'],
        ['MAT-MALHA-PV', 'Malha PV', 'Matéria-prima', 'metro', 32, 12, 28.5, 'DEMO-TEXTIL'],
        ['SUP-TINTA-PR', 'Tinta serigráfica preta', 'Estamparia', 'litro', 4, 5, 58.5, 'DEMO-ESTAMPARIA'],
        ['EMB-SACO-100', 'Sacos para envio reciclados', 'Embalagens', 'pacote c/ 100', 8, 10, 24.9, 'DEMO-EMBALAGEM'],
        ['EMB-CAIXA-32', 'Caixa para envio tamanho M', 'Embalagens', 'unidade', 40, 30, 2.8, 'DEMO-EMBALAGEM'],
        ['SUP-ETIQ-100', 'Etiquetas de composição', 'Suprimentos', 'pacote c/ 100', 3, 4, 18.5, 'DEMO-ESTAMPARIA'],
      ];
      const insertSupply = db.prepare(`
        INSERT INTO supplies
          (sku, name, category, unit, current_stock, minimum_stock, unit_cost, supplier_id)
        SELECT ?, ?, ?, ?, ?, ?, ?, id FROM suppliers WHERE code = ?
      `);
      supplies.forEach((supply) => insertSupply.run(...supply));
    }

  });
}

function runTransaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

module.exports = { DATABASE_PATH, openDatabase, runTransaction };
