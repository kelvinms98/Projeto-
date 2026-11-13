require('dotenv').config();

const mysql = require('mysql2/promise');
const { openDatabase, runTransaction } = require('../store-db');

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function dateValue(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  return value || now();
}

const TABLES = [
  {
    source: 'clientes',
    target: 'clientes',
    columns: ['id_cliente', 'nome', 'telefone', 'cpf', 'email', 'endereco', 'status'],
    values: (row) => [
      row.id_cliente, row.nome, row.telefone ?? null, row.cpf ?? null, row.email,
      row.endereco ?? null, row.status || 'ativo',
    ],
  },
  {
    source: 'funcionarios',
    target: 'funcionarios',
    columns: ['id_funcionario', 'nome', 'telefone', 'cpf', 'email', 'endereco', 'cargo', 'senha'],
    values: (row) => [
      row.id_funcionario, row.nome, row.telefone ?? null, row.cpf ?? null,
      row.email, row.endereco ?? null, row.cargo || 'Funcionário', row.senha ?? null,
    ],
  },
  {
    source: 'produto',
    target: 'produto',
    columns: ['id_produto', 'nome', 'tamanho', 'cor', 'preco', 'estoque'],
    values: (row) => [
      row.id_produto, row.nome, row.tamanho, row.cor || '',
      row.preco ?? 0, row.estoque ?? 0,
    ],
  },
  {
    source: 'delivery_options',
    target: 'delivery_options',
    columns: ['id', 'name', 'fee', 'estimate', 'requires_address', 'active', 'display_order'],
    values: (row) => [
      row.id, row.name, row.fee ?? 0, row.estimate || 'Prazo não informado',
      row.requires_address ?? 1, row.active ?? 1, row.display_order ?? 0,
    ],
  },
  {
    source: 'venda',
    target: 'venda',
    columns: [
      'id_venda', 'customer_name', 'customer_email', 'customer_phone',
      'delivery_option_id', 'payment_method', 'subtotal', 'discount_amount',
      'delivery_fee', 'total', 'status', 'delivery_street', 'delivery_number',
      'delivery_complement', 'delivery_cep', 'created_at',
    ],
    values: (row) => [
      row.id_venda, row.customer_name ?? null, row.customer_email ?? null,
      row.customer_phone ?? null, row.delivery_option_id ?? null,
      row.payment_method ?? null, row.subtotal ?? row.valor_total ?? 0,
      row.discount_amount ?? 0, row.delivery_fee ?? 0,
      row.total ?? row.valor_total ?? row.subtotal ?? 0,
      row.status || 'legacy', row.delivery_street ?? null,
      row.delivery_number ?? null, row.delivery_complement ?? null,
      row.delivery_cep ?? null, dateValue(row.created_at),
    ],
  },
  {
    source: 'item_venda',
    target: 'item_venda',
    columns: [
      'id_item_venda', 'id_venda', 'id_produto', 'product_name',
      'size', 'quantity', 'unit_price',
    ],
    values: (row) => [
      row.id_item_venda, row.id_venda, row.id_produto,
      row.product_name || 'Produto legado', row.size || '',
      row.quantity ?? 1, row.unit_price ?? 0,
    ],
  },
  {
    source: 'suppliers',
    target: 'suppliers',
    columns: [
      'id', 'code', 'name', 'category', 'contact_name', 'email', 'phone',
      'lead_time_days', 'notes', 'is_demo', 'active', 'created_at',
    ],
    values: (row) => [
      row.id, row.code, row.name, row.category, row.contact_name || '',
      row.email || '', row.phone || '', row.lead_time_days ?? 0,
      row.notes ?? null, row.is_demo ?? 1, row.active ?? 1,
      dateValue(row.created_at),
    ],
  },
  {
    source: 'supplies',
    target: 'supplies',
    columns: [
      'id', 'sku', 'name', 'category', 'unit', 'current_stock',
      'minimum_stock', 'unit_cost', 'supplier_id', 'is_demo', 'active', 'created_at',
    ],
    values: (row) => [
      row.id, row.sku, row.name, row.category, row.unit,
      row.current_stock ?? 0, row.minimum_stock ?? 0, row.unit_cost ?? 0,
      row.supplier_id, row.is_demo ?? 1, row.active ?? 1, dateValue(row.created_at),
    ],
  },
  {
    source: 'purchase_orders',
    target: 'purchase_orders',
    columns: [
      'id', 'supplier_id', 'status', 'total', 'created_by',
      'notes', 'created_at', 'received_at',
    ],
    values: (row) => [
      row.id, row.supplier_id, row.status || 'requested',
      row.total ?? 0, row.created_by || 'Legado', row.notes ?? null,
      dateValue(row.created_at), row.received_at instanceof Date
        ? row.received_at.toISOString().slice(0, 19).replace('T', ' ')
        : row.received_at ?? null,
    ],
  },
  {
    source: 'purchase_order_items',
    target: 'purchase_order_items',
    columns: ['id', 'order_id', 'supply_id', 'quantity', 'unit_cost'],
    values: (row) => [
      row.id, row.order_id, row.supply_id, row.quantity ?? 1, row.unit_cost ?? 0,
    ],
  },
];

async function importDatabase() {
  const source = await mysql.createConnection({
    host: process.env.LEGACY_DB_HOST || process.env.NEXUS_DB_HOST || '127.0.0.1',
    port: Number(process.env.LEGACY_DB_PORT || process.env.NEXUS_DB_PORT || 3306),
    user: process.env.LEGACY_DB_USER || process.env.NEXUS_DB_USER || 'root',
    password: process.env.LEGACY_DB_PASSWORD ?? process.env.NEXUS_DB_PASSWORD ?? '',
    database: process.env.LEGACY_DB_NAME || process.env.NEXUS_DB_NAME || 'NEXUS',
    connectTimeout: 5000,
  });
  let target;
  try {
    const [recoveryRows] = await source.query('SELECT @@innodb_force_recovery AS recovery_level');
    const recoveryLevel = Number(recoveryRows[0]?.recovery_level);
    if (recoveryLevel !== 0) {
      throw new Error(
        `Importação cancelada: o MariaDB está em innodb_force_recovery=${recoveryLevel}. ` +
        'Recupere e valide o banco antes de importar.',
      );
    }

    target = openDatabase(undefined, { seed: false });
    const existingRows = target.prepare(`
      SELECT
        (SELECT COUNT(*) FROM clientes) +
        (SELECT COUNT(*) FROM funcionarios) +
        (SELECT COUNT(*) FROM produto) +
        (SELECT COUNT(*) FROM venda) +
        (SELECT COUNT(*) FROM item_venda) +
        (SELECT COUNT(*) FROM delivery_options) +
        (SELECT COUNT(*) FROM suppliers) +
        (SELECT COUNT(*) FROM supplies) +
        (SELECT COUNT(*) FROM purchase_orders) +
        (SELECT COUNT(*) FROM purchase_order_items) +
        (SELECT COUNT(*) FROM web_sessions) AS total
    `).get().total;
    if (existingRows > 0) {
      throw new Error('O banco SQLite já contém dados. Faça a importação para um arquivo SQLite novo.');
    }

    const [tableRows] = await source.query('SHOW TABLES');
    const availableTables = new Set(Object.values(tableRows).map((row) => Object.values(row)[0]));
    const imported = {};
    const copyRows = (data) => runTransaction(target, () => {
      for (const table of TABLES) {
        if (!availableTables.has(table.source)) continue;
        const placeholders = table.columns.map(() => '?').join(', ');
        const columnNames = table.columns.map((column) => `"${column}"`).join(', ');
        const insert = target.prepare(
          `INSERT INTO "${table.target}" (${columnNames}) VALUES (${placeholders})`,
        );
        for (const row of data[table.source]) insert.run(...table.values(row));
        imported[table.source] = data[table.source].length;
      }
    });

    const data = {};
    for (const table of TABLES) {
      if (!availableTables.has(table.source)) continue;
      const [rows] = await source.query(`SELECT * FROM \`${table.source}\``);
      data[table.source] = rows;
    }
    const deliveryIds = new Set((data.delivery_options || []).map((option) => String(option.id)));
    if (data.venda) {
      data.venda = data.venda.map((order) => (
        order.delivery_option_id && !deliveryIds.has(String(order.delivery_option_id))
          ? { ...order, delivery_option_id: null }
          : order
      ));
    }
    copyRows(data);
    const deliveryCount = target.prepare('SELECT COUNT(*) AS count FROM delivery_options').get().count;
    if (deliveryCount === 0) {
      target.prepare(`
        INSERT INTO delivery_options
          (id, name, fee, estimate, requires_address, active, display_order)
        VALUES ('store_pickup', 'Retirada na loja', 0, 'Combine o horário após a confirmação', 0, 1, 1)
      `).run();
    }
    console.log('Importação concluída. Registros por tabela:');
    for (const [table, count] of Object.entries(imported)) {
      console.log(`- ${table}: ${count}`);
    }
  } finally {
    if (target) target.close();
    await source.end();
  }
}

importDatabase().catch((error) => {
  console.error('Falha ao importar o banco MySQL para SQLite:', error.message);
  process.exitCode = 1;
});
