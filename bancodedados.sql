CREATE DATABASE IF NOT EXISTS NEXUS
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE NEXUS;

CREATE TABLE IF NOT EXISTS clientes (
  id_cliente INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  telefone VARCHAR(32),
  cpf VARCHAR(14) UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  endereco VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'ativo'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS funcionarios (
  id_funcionario INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  telefone VARCHAR(32),
  cpf VARCHAR(14) UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  endereco VARCHAR(255),
  cargo VARCHAR(80) NOT NULL,
  senha CHAR(64) NULL
) ENGINE=InnoDB;

SET @has_employee_auto_increment = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'funcionarios'
    AND COLUMN_NAME = 'id_funcionario'
    AND EXTRA LIKE '%auto_increment%'
);
SET @employee_id_migration = IF(
  @has_employee_auto_increment = 0,
  'ALTER TABLE funcionarios MODIFY id_funcionario INT NOT NULL AUTO_INCREMENT',
  'SELECT 1'
);
PREPARE employee_id_migration FROM @employee_id_migration;
EXECUTE employee_id_migration;
DEALLOCATE PREPARE employee_id_migration;

SET @has_password_column = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'funcionarios'
    AND COLUMN_NAME = 'senha'
);
SET @password_migration = IF(
  @has_password_column = 0,
  'ALTER TABLE funcionarios ADD COLUMN senha CHAR(64) NULL',
  'SELECT 1'
);
PREPARE password_migration FROM @password_migration;
EXECUTE password_migration;
DEALLOCATE PREPARE password_migration;

ALTER TABLE funcionarios MODIFY COLUMN senha CHAR(64) NULL;
UPDATE funcionarios
SET senha = SHA2(senha, 256)
WHERE senha IS NOT NULL
  AND senha <> ''
  AND CHAR_LENGTH(senha) < 64;

CREATE TABLE IF NOT EXISTS produto (
  id_produto INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  tamanho VARCHAR(20) NOT NULL,
  cor VARCHAR(30) NOT NULL DEFAULT '',
  preco DECIMAL(10,2) NOT NULL,
  estoque INT NOT NULL DEFAULT 0,
  CONSTRAINT chk_produto_preco CHECK (preco >= 0),
  CONSTRAINT chk_produto_estoque CHECK (estoque >= 0)
) ENGINE=InnoDB;

SET @has_auto_increment = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'produto'
    AND COLUMN_NAME = 'id_produto'
    AND EXTRA LIKE '%auto_increment%'
);
SET @product_id_migration = IF(
  @has_auto_increment = 0,
  'ALTER TABLE produto MODIFY id_produto INT NOT NULL AUTO_INCREMENT',
  'SELECT 1'
);
PREPARE product_id_migration FROM @product_id_migration;
EXECUTE product_id_migration;
DEALLOCATE PREPARE product_id_migration;

SET @has_product_variant_index = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'produto'
    AND INDEX_NAME = 'uq_produto_variant'
);
SET @product_variant_migration = IF(
  @has_product_variant_index = 0,
  'ALTER TABLE produto ADD UNIQUE KEY uq_produto_variant (nome, tamanho, cor)',
  'SELECT 1'
);
PREPARE product_variant_migration FROM @product_variant_migration;
EXECUTE product_variant_migration;
DEALLOCATE PREPARE product_variant_migration;

CREATE TABLE IF NOT EXISTS delivery_options (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  estimate VARCHAR(120) NOT NULL,
  requires_address TINYINT(1) NOT NULL DEFAULT 1,
  active TINYINT(1) NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0,
  CONSTRAINT chk_delivery_fee CHECK (fee >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS venda (
  id_venda BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(120) NOT NULL,
  customer_email VARCHAR(254) NOT NULL,
  customer_phone VARCHAR(32),
  delivery_option_id VARCHAR(64) NOT NULL,
  payment_method VARCHAR(16) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'awaiting_payment',
  delivery_street VARCHAR(160),
  delivery_number VARCHAR(20),
  delivery_complement VARCHAR(120),
  delivery_cep VARCHAR(12),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_venda_delivery FOREIGN KEY (delivery_option_id) REFERENCES delivery_options(id),
  CONSTRAINT chk_venda_amounts CHECK (subtotal >= 0 AND discount_amount >= 0 AND delivery_fee >= 0 AND total >= 0)
) ENGINE=InnoDB;

ALTER TABLE venda
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS customer_email VARCHAR(254) NULL,
  ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS delivery_option_id VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(16) NULL,
  ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2) NULL,
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(10,2) NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total DECIMAL(10,2) NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS delivery_street VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS delivery_number VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS delivery_complement VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS delivery_cep VARCHAR(12) NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE venda
SET subtotal = COALESCE(subtotal, valor_total, 0),
    discount_amount = COALESCE(discount_amount, 0),
    delivery_fee = COALESCE(delivery_fee, 0),
    total = COALESCE(total, valor_total, subtotal, 0),
    status = COALESCE(status, 'legacy')
WHERE subtotal IS NULL
   OR discount_amount IS NULL
   OR delivery_fee IS NULL
   OR total IS NULL
   OR status IS NULL;

CREATE TABLE IF NOT EXISTS item_venda (
  id_item_venda BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_venda BIGINT NOT NULL,
  id_produto INT NOT NULL,
  product_name VARCHAR(100) NOT NULL,
  size VARCHAR(20) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_item_venda FOREIGN KEY (id_venda) REFERENCES venda(id_venda),
  CONSTRAINT fk_item_produto FOREIGN KEY (id_produto) REFERENCES produto(id_produto),
  CONSTRAINT chk_item_venda_quantity CHECK (quantity > 0),
  CONSTRAINT chk_item_venda_price CHECK (unit_price >= 0)
) ENGINE=InnoDB;

ALTER TABLE item_venda
  ADD COLUMN IF NOT EXISTS product_name VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS size VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2) NULL;

INSERT IGNORE INTO delivery_options (id, name, fee, estimate, requires_address, active, display_order)
VALUES
  ('store_pickup', 'Retirada na loja', 0.00, 'Combine o horário após a confirmação', 0, 1, 1),
  ('local_courier', 'Entrega local / motoboy', 10.00, '1 dia útil', 1, 1, 2),
  ('express_carrier', 'Transportadora expressa', 25.00, '3 dias úteis', 1, 1, 3),
  ('sedex', 'Correios - SEDEX', 38.00, '5 dias úteis', 1, 1, 4);

INSERT INTO produto (nome, tamanho, cor, preco, estoque)
SELECT seed.nome, seed.tamanho, seed.cor, seed.preco, seed.estoque
FROM (
  SELECT 'Graphic Nexus' AS nome, 'P' AS tamanho, 'Unica' AS cor, 249.00 AS preco, 100 AS estoque
  UNION ALL SELECT 'Graphic Nexus', 'M', 'Unica', 249.00, 100
  UNION ALL SELECT 'Graphic Nexus', 'G', 'Unica', 249.00, 100
  UNION ALL SELECT 'Graphic Nexus', 'GG', 'Unica', 249.00, 100
  UNION ALL SELECT 'Nexus Logo Tee', 'P', 'Unica', 189.00, 100
  UNION ALL SELECT 'Nexus Logo Tee', 'M', 'Unica', 189.00, 100
  UNION ALL SELECT 'Nexus Logo Tee', 'G', 'Unica', 189.00, 100
  UNION ALL SELECT 'Nexus Logo Tee', 'GG', 'Unica', 189.00, 100
  UNION ALL SELECT 'Cap Nexus', 'Unico', 'Unica', 119.00, 100
  UNION ALL SELECT 'Utility Cargo', '38', 'Unica', 329.00, 100
  UNION ALL SELECT 'Utility Cargo', '40', 'Unica', 329.00, 100
  UNION ALL SELECT 'Utility Cargo', '42', 'Unica', 329.00, 100
  UNION ALL SELECT 'Utility Cargo', '44', 'Unica', 329.00, 100
  UNION ALL SELECT 'Utility Cargo', '46', 'Unica', 329.00, 100
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM produto);

INSERT IGNORE INTO funcionarios (nome, email, cargo, senha)
VALUES ('Administrador NEXUS', 'kelvinsoares@nexus.com.br', 'Coordenador TI', SHA2('admin123', 256));

SET @has_delivery_foreign_key = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'venda'
    AND CONSTRAINT_NAME = 'fk_venda_delivery'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @delivery_foreign_key_migration = IF(
  @has_delivery_foreign_key = 0,
  'ALTER TABLE venda ADD CONSTRAINT fk_venda_delivery FOREIGN KEY (delivery_option_id) REFERENCES delivery_options(id)',
  'SELECT 1'
);
PREPARE delivery_foreign_key_migration FROM @delivery_foreign_key_migration;
EXECUTE delivery_foreign_key_migration;
DEALLOCATE PREPARE delivery_foreign_key_migration;

CREATE TABLE IF NOT EXISTS suppliers (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(80) NOT NULL,
  contact_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(32) NOT NULL DEFAULT '',
  lead_time_days SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  notes VARCHAR(255) NULL,
  is_demo TINYINT(1) NOT NULL DEFAULT 1,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS supplies (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(80) NOT NULL,
  unit VARCHAR(32) NOT NULL,
  current_stock DECIMAL(12,3) NOT NULL DEFAULT 0,
  minimum_stock DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  supplier_id BIGINT NOT NULL,
  is_demo TINYINT(1) NOT NULL DEFAULT 1,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_supplies_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT chk_supplies_stock CHECK (current_stock >= 0 AND minimum_stock >= 0),
  CONSTRAINT chk_supplies_cost CHECK (unit_cost >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  supplier_id BIGINT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'requested',
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_by VARCHAR(100) NOT NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_at TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT fk_purchase_orders_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT chk_purchase_orders_status CHECK (status IN ('requested', 'received', 'cancelled')),
  CONSTRAINT chk_purchase_orders_total CHECK (total >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  supply_id BIGINT NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_cost DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_purchase_item_order FOREIGN KEY (order_id) REFERENCES purchase_orders(id),
  CONSTRAINT fk_purchase_item_supply FOREIGN KEY (supply_id) REFERENCES supplies(id),
  CONSTRAINT chk_purchase_item_quantity CHECK (quantity > 0),
  CONSTRAINT chk_purchase_item_cost CHECK (unit_cost >= 0)
) ENGINE=InnoDB;

INSERT IGNORE INTO suppliers
  (code, name, category, contact_name, email, phone, lead_time_days, notes, is_demo)
VALUES
  ('DEMO-TEXTIL', 'Fio & Trama Têxtil', 'Tecidos', 'Contato fictício', 'compras@fioetrama.example', '', 7, 'Fornecedor fictício de demonstração; não enviar pedidos.', 1),
  ('DEMO-ESTAMPARIA', 'Cor & Forma Estamparia', 'Estamparia', 'Contato fictício', 'pedidos@coreforma.example', '', 5, 'Fornecedor fictício de demonstração; não enviar pedidos.', 1),
  ('DEMO-EMBALAGEM', 'Embalagem Circular', 'Embalagens', 'Contato fictício', 'vendas@embalagemcircular.example', '', 4, 'Fornecedor fictício de demonstração; não enviar pedidos.', 1);

INSERT IGNORE INTO supplies
  (sku, name, category, unit, current_stock, minimum_stock, unit_cost, supplier_id, is_demo)
SELECT seed.sku, seed.name, seed.category, seed.unit, seed.current_stock,
       seed.minimum_stock, seed.unit_cost, suppliers.id, 1
FROM (
  SELECT 'MAT-ALG-30' AS sku, 'Malha de algodão penteado' AS name, 'Matéria-prima' AS category,
         'kg' AS unit, 18.000 AS current_stock, 10.000 AS minimum_stock, 42.90 AS unit_cost,
         'DEMO-TEXTIL' AS supplier_code
  UNION ALL SELECT 'MAT-MALHA-PV', 'Malha PV', 'Matéria-prima', 'metro', 32.000, 12.000, 28.50, 'DEMO-TEXTIL'
  UNION ALL SELECT 'SUP-TINTA-PR', 'Tinta serigráfica preta', 'Estamparia', 'litro', 4.000, 5.000, 58.50, 'DEMO-ESTAMPARIA'
  UNION ALL SELECT 'EMB-SACO-100', 'Sacos para envio reciclados', 'Embalagens', 'pacote c/ 100', 8.000, 10.000, 24.90, 'DEMO-EMBALAGEM'
  UNION ALL SELECT 'EMB-CAIXA-32', 'Caixa para envio tamanho M', 'Embalagens', 'unidade', 40.000, 30.000, 2.80, 'DEMO-EMBALAGEM'
  UNION ALL SELECT 'SUP-ETIQ-100', 'Etiquetas de composição', 'Suprimentos', 'pacote c/ 100', 3.000, 4.000, 18.50, 'DEMO-ESTAMPARIA'
) AS seed
JOIN suppliers ON suppliers.code = seed.supplier_code;
