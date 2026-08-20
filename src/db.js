const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./security');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = process.env.SC_DB_PATH || path.join(ROOT, 'data', 'sc-central.sqlite');
const SEED_PATH = path.join(__dirname, 'seed-data.json');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  old_price REAL,
  badge TEXT NOT NULL DEFAULT '',
  emoji TEXT NOT NULL DEFAULT '🛒',
  stock INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  image TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eyebrow TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  button TEXT NOT NULL DEFAULT 'Ver produtos',
  target TEXT NOT NULL DEFAULT '#produtos',
  icon TEXT NOT NULL DEFAULT '🛒',
  image TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT 'blue',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('percent','fixed')),
  value REAL NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  minimum_order REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  fee REAL NOT NULL DEFAULT 0,
  minimum REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','manager','attendant')) DEFAULT 'attendant',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  method TEXT NOT NULL,
  region_id INTEGER,
  region_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  delivery_time TEXT NOT NULL DEFAULT '',
  payment TEXT NOT NULL DEFAULT '',
  change_for TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  coupon_code TEXT NOT NULL DEFAULT '',
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  delivery_fee REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'novo'
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
`);

// V6 FINAL: estruturas adicionais preservando compatibilidade com bancos anteriores.
db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL DEFAULT '🛒',
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  last_address TEXT NOT NULL DEFAULT '',
  last_region TEXT NOT NULL DEFAULT '',
  order_count INTEGER NOT NULL DEFAULT 0,
  total_spent REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(active,sort_order,name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
`);

function now() {
  return new Date().toISOString();
}

function getMeta(key, fallback = null) {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setMeta(key, value) {
  db.prepare(`INSERT INTO app_meta(key,value) VALUES(?,?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, String(value));
}

function bumpVersion() {
  const current = Number(getMeta('change_version', '0')) || 0;
  const next = current + 1;
  setMeta('change_version', String(next));
  return next;
}

function getSettingsObject() {
  const rows = db.prepare('SELECT key,value FROM settings').all();
  const out = {};
  for (const row of rows) {
    try { out[row.key] = JSON.parse(row.value); }
    catch { out[row.key] = row.value; }
  }
  return out;
}

function setSettingsObject(values) {
  const stmt = db.prepare(`INSERT INTO settings(key,value) VALUES(?,?)
                           ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
  db.exec('BEGIN');
  try {
    for (const [key, value] of Object.entries(values)) stmt.run(key, JSON.stringify(value));
    bumpVersion();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function audit(userId, action, entityType, entityId = '', details = '') {
  db.prepare(`INSERT INTO audit_log(user_id,action,entity_type,entity_id,details,created_at)
              VALUES(?,?,?,?,?,?)`).run(userId || null, action, entityType, String(entityId || ''), String(details || ''), now());
}

function seedIfNeeded() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const timestamp = now();

  if (!count) {
    db.exec('BEGIN');
    try {
      const productStmt = db.prepare(`INSERT INTO products(id,name,category,unit,price,old_price,badge,emoji,stock,featured,image,active,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const p of seed.products) {
        productStmt.run(
          Number(p.id), p.name, p.category, p.unit || '', Number(p.price || 0),
          p.oldPrice === null || p.oldPrice === '' ? null : Number(p.oldPrice),
          p.badge || '', p.emoji || '🛒', Number(p.stock || 0), p.featured ? 1 : 0,
          p.image || '', 1, timestamp, timestamp
        );
      }

      const bannerStmt = db.prepare(`INSERT INTO banners(id,eyebrow,title,text,button,target,icon,image,theme,active,sort_order,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      seed.banners.forEach((b, i) => bannerStmt.run(
        Number(b.id), b.eyebrow || '', b.title, b.text || '', b.button || 'Ver produtos',
        b.target || '#produtos', b.icon || '🛒', b.image || '', b.theme || 'blue',
        b.active === false ? 0 : 1, i, timestamp, timestamp
      ));

      const couponStmt = db.prepare(`INSERT INTO coupons(code,type,value,label,minimum_order,active,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?)`);
      for (const [code, c] of Object.entries(seed.coupons)) {
        couponStmt.run(code, c.type, Number(c.value || 0), c.label || code, 0, c.active === false ? 0 : 1, timestamp, timestamp);
      }

      const regionStmt = db.prepare(`INSERT INTO delivery_regions(id,name,fee,minimum,active,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?)`);
      seed.neighborhoods.forEach(r => regionStmt.run(Number(r.id), r.name, Number(r.fee || 0), Number(r.minimum || 0), r.active === false ? 0 : 1, timestamp, timestamp));

      for (const [key, value] of Object.entries(seed.settings)) {
        db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(key, JSON.stringify(value));
      }
      db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run('versionLabel', JSON.stringify('V6 FINAL'));
      setMeta('change_version', '1');
      setMeta('schema_version', '5');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  if (!userCount) {
    const username = process.env.SC_ADMIN_USER || 'admin';
    const password = process.env.SC_ADMIN_PASSWORD || 'TroqueAgora@123';
    const { salt, hash } = hashPassword(password);
    db.prepare(`INSERT INTO users(name,username,password_hash,password_salt,role,active,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?)`)
      .run('Administrador', username, hash, salt, 'admin', 1, timestamp, timestamp);
  }
}


function upgradeToV5IfNeeded() {
  const schemaVersion = Number(getMeta('schema_version', '4')) || 4;
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const timestamp = now();
  let changed = false;

  db.exec('BEGIN');
  try {
    // V5: preenche apenas imagens vazias. Imagens personalizadas do usuário são preservadas.
    const getProduct = db.prepare('SELECT id,image FROM products WHERE id=?');
    const setImage = db.prepare('UPDATE products SET image=?,updated_at=? WHERE id=?');

    for (const p of seed.products || []) {
      const row = getProduct.get(Number(p.id));
      if (row && !String(row.image || '').trim() && String(p.image || '').trim()) {
        setImage.run(String(p.image), timestamp, Number(p.id));
        changed = true;
      }
    }

    db.prepare(`INSERT INTO settings(key,value) VALUES(?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .run('versionLabel', JSON.stringify('V6 FINAL'));

    if (schemaVersion < 5) {
      setMeta('schema_version', '5');
      changed = true;
    }

    if (changed) bumpVersion();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column);
}

function ensureColumn(table, column, definition) {
  if (!hasColumn(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function slugify(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80) || 'categoria';
}

function upgradeToV6IfNeeded() {
  const schemaVersion = Number(getMeta('schema_version', '5')) || 5;
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const timestamp = now();

  // SQLite mantém compatibilidade com a tabela antiga e recebe as novas colunas sem apagar dados.
  ensureColumn('products','sku',"TEXT NOT NULL DEFAULT ''");
  ensureColumn('products','barcode',"TEXT NOT NULL DEFAULT ''");
  ensureColumn('products','subcategory',"TEXT NOT NULL DEFAULT ''");
  ensureColumn('products','description',"TEXT NOT NULL DEFAULT ''");
  ensureColumn('products','sale_mode',"TEXT NOT NULL DEFAULT 'unit'");
  ensureColumn('products','measure_unit',"TEXT NOT NULL DEFAULT 'un'");
  ensureColumn('products','quantity_step',"REAL NOT NULL DEFAULT 1");
  ensureColumn('products','min_quantity',"REAL NOT NULL DEFAULT 1");
  ensureColumn('products','promo_start',"TEXT NOT NULL DEFAULT ''");
  ensureColumn('products','promo_end',"TEXT NOT NULL DEFAULT ''");
  ensureColumn('products','sort_order',"INTEGER NOT NULL DEFAULT 0");
  ensureColumn('orders','substitution_preference',"TEXT NOT NULL DEFAULT 'contact'");
  ensureColumn('order_items','substitution',"TEXT NOT NULL DEFAULT ''");
  ensureColumn('order_items','item_note',"TEXT NOT NULL DEFAULT ''");

  db.exec('BEGIN');
  try {
    // Categorias oficiais da V6.
    const categoryCount = db.prepare('SELECT COUNT(*) c FROM categories').get().c;
    if (!categoryCount) {
      const st = db.prepare(`INSERT INTO categories(id,name,slug,icon,description,image,active,sort_order,created_at,updated_at)
                             VALUES(?,?,?,?,?,?,?,?,?,?)`);
      for (const c of seed.categories || []) st.run(Number(c.id), c.name, c.slug || slugify(c.name), c.icon || '🛒', c.description || '', c.image || '', c.active === false ? 0 : 1, Number(c.sortOrder || 0), timestamp, timestamp);
    }

    // Completa metadados V6 somente quando o campo ainda está vazio/default.
    const getProduct = db.prepare('SELECT * FROM products WHERE id=?');
    const updateProduct = db.prepare(`UPDATE products SET
      sku=?,barcode=?,subcategory=?,description=?,sale_mode=?,measure_unit=?,quantity_step=?,min_quantity=?,promo_start=?,promo_end=?,sort_order=?,updated_at=?
      WHERE id=?`);
    for (const p of seed.products || []) {
      const row = getProduct.get(Number(p.id));
      if (!row) continue;
      updateProduct.run(
        row.sku || p.sku || '', row.barcode || p.barcode || '', row.subcategory || p.subcategory || '',
        row.description || p.description || '',
        row.sale_mode && row.sale_mode !== 'unit' ? row.sale_mode : (p.saleMode || row.sale_mode || 'unit'),
        row.measure_unit && row.measure_unit !== 'un' ? row.measure_unit : (p.measureUnit || row.measure_unit || 'un'),
        Number(row.quantity_step) !== 1 ? Number(row.quantity_step) : Number(p.quantityStep || row.quantity_step || 1),
        Number(row.min_quantity) !== 1 ? Number(row.min_quantity) : Number(p.minQuantity || row.min_quantity || 1),
        row.promo_start || p.promoStart || '', row.promo_end || p.promoEnd || '',
        Number(row.sort_order || p.sortOrder || p.id || 0), timestamp, Number(p.id)
      );
    }

    // Converte pedidos históricos da V4/V5 em base consolidada de clientes.
    if (db.prepare('SELECT COUNT(*) c FROM customers').get().c === 0) {
      const customerStmt = db.prepare(`INSERT INTO customers(phone,name,last_address,last_region,order_count,total_spent,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name,last_address=excluded.last_address,last_region=excluded.last_region,
        order_count=customers.order_count+1,total_spent=customers.total_spent+excluded.total_spent,updated_at=excluded.updated_at`);
      for (const order of db.prepare(`SELECT phone,customer_name,address,region_name,total,created_at FROM orders WHERE phone<>'' ORDER BY created_at`).all()) {
        customerStmt.run(order.phone,order.customer_name,order.address||'',order.region_name||'',1,Number(order.total||0),order.created_at,order.created_at);
      }
    }

    const settingsStmt = db.prepare(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
    settingsStmt.run('versionLabel', JSON.stringify('V6 FINAL'));
    for (const key of ['storeEmail','freeDeliveryThreshold','defaultSubstitution','pwaName']) {
      const exists = db.prepare('SELECT 1 FROM settings WHERE key=?').get(key);
      if (!exists && Object.prototype.hasOwnProperty.call(seed.settings || {}, key)) settingsStmt.run(key, JSON.stringify(seed.settings[key]));
    }

    if (schemaVersion < 6) setMeta('schema_version','6');
    bumpVersion();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

seedIfNeeded();
upgradeToV5IfNeeded();
upgradeToV6IfNeeded();

module.exports = {
  db,
  DB_PATH,
  now,
  getMeta,
  setMeta,
  bumpVersion,
  getSettingsObject,
  setSettingsObject,
  audit
};
