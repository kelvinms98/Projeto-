require('dotenv').config();

const crypto = require('node:crypto');
const { openDatabase } = require('../store-db');

async function main() {
  if (process.env.NEXUS_SETUP_ADMIN !== '1') {
    throw new Error('Execute o configurador local configurar_admin.bat.');
  }
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const credentials = JSON.parse(input);
  const username = String(credentials.username || '').trim().toLowerCase();
  const name = String(credentials.name || '').trim();
  const email = String(credentials.email || '').trim().toLowerCase();
  const password = String(credentials.password || '');
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error('Usuário inválido.');
  if (!name || name.length > 120) throw new Error('Nome inválido.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
  if (password.length < 12 || password.length > 256) {
    throw new Error('A senha deve ter entre 12 e 256 caracteres.');
  }

  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  const passwordHash = `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
  const db = openDatabase();
  try {
    const existing = db.prepare(`
      SELECT id_funcionario FROM funcionarios
      WHERE username = ? COLLATE NOCASE
    `).get(username);
    if (existing) {
      db.prepare(`
        UPDATE funcionarios
        SET nome = ?, email = ?, cargo = 'Administrador',
            senha = ?, role = 'owner', access_status = 'active'
        WHERE id_funcionario = ?
      `).run(name, email, passwordHash, existing.id_funcionario);
    } else {
      db.prepare(`
        INSERT INTO funcionarios
          (nome, username, email, cargo, senha, role, access_status)
        VALUES (?, ?, ?, 'Administrador', ?, 'owner', 'active')
      `).run(name, username, email, passwordHash);
    }
  } finally {
    db.close();
  }
}

main().then(() => {
  console.log('Administrador configurado localmente.');
}).catch((error) => {
  console.error(`Não foi possível configurar o administrador: ${error.message}`);
  process.exitCode = 1;
});
