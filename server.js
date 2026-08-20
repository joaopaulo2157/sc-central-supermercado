const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const {
  db, DB_PATH, now, getMeta, bumpVersion,
  getSettingsObject, setSettingsObject, audit
} = require('./src/db');
const {
  hashPassword, verifyPassword, randomToken, hashToken,
  parseCookies, sessionCookie, clearSessionCookie, safeText
} = require('./src/security');
const integrations = require('./src/integrations');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const IS_SECURE = process.env.SC_HTTPS === '1';
const SESSION_HOURS = Number(process.env.SC_SESSION_HOURS || 8);
const JSON_LIMIT = 3 * 1024 * 1024;
const UPLOAD_DIR = path.join(PUBLIC, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive:true });

const ROLE_LEVEL = { attendant: 1, manager: 2, admin: 3 };
const ORDER_STATUSES = ['novo','confirmado','separando','pronto','saiu_entrega','concluido','cancelado'];

const RATE_BUCKETS = new Map();
function rateLimit(req, key, limit, windowMs) {
  const ip = req.socket.remoteAddress || 'unknown';
  const bucketKey = `${key}:${ip}`;
  const current = Date.now();
  let bucket = RATE_BUCKETS.get(bucketKey);
  if (!bucket || current - bucket.startedAt > windowMs) bucket = { startedAt:current, count:0 };
  bucket.count += 1;
  RATE_BUCKETS.set(bucketKey, bucket);
  return bucket.count <= limit;
}

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store'
  });
  res.end(text);
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > JSON_LIMIT) {
        reject(Object.assign(new Error('Payload muito grande.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { reject(Object.assign(new Error('JSON inválido.'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

function publicProduct(row) {
  const promoStart = row.promo_start || '';
  const promoEnd = row.promo_end || '';
  const current = Date.now();
  const afterStart = !promoStart || new Date(promoStart).getTime() <= current;
  const beforeEnd = !promoEnd || new Date(promoEnd).getTime() >= current;
  return {
    id: Number(row.id),
    sku: row.sku || '',
    barcode: row.barcode || '',
    name: row.name,
    category: row.category,
    subcategory: row.subcategory || '',
    description: row.description || '',
    unit: row.unit,
    saleMode: row.sale_mode || 'unit',
    measureUnit: row.measure_unit || 'un',
    quantityStep: Number(row.quantity_step || 1),
    minQuantity: Number(row.min_quantity || 1),
    price: Number(row.price),
    oldPrice: row.old_price === null ? null : Number(row.old_price),
    promoStart,
    promoEnd,
    promotionActive: Boolean(row.old_price !== null && afterStart && beforeEnd),
    badge: row.badge,
    emoji: row.emoji,
    stock: Number(row.stock),
    featured: Boolean(row.featured),
    image: row.image,
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order || 0)
  };
}

function publicCategory(row) {
  return {
    id:Number(row.id), name:row.name, slug:row.slug, icon:row.icon,
    description:row.description, image:row.image, active:Boolean(row.active),
    sortOrder:Number(row.sort_order || 0)
  };
}

function publicBanner(row) {
  return {
    id: Number(row.id), eyebrow: row.eyebrow, title: row.title, text: row.text,
    button: row.button, target: row.target, icon: row.icon, image: row.image,
    theme: row.theme, active: Boolean(row.active), sortOrder: Number(row.sort_order)
  };
}

function publicCoupon(row) {
  return {
    type: row.type, value: Number(row.value), label: row.label,
    minimumOrder: Number(row.minimum_order), active: Boolean(row.active)
  };
}

function publicRegion(row) {
  return {
    id: Number(row.id), name: row.name, fee: Number(row.fee),
    minimum: Number(row.minimum), active: Boolean(row.active)
  };
}

function getBootstrap({ admin = false } = {}) {
  const settings = getSettingsObject();
  const productSql = admin ? 'SELECT * FROM products ORDER BY sort_order,id' : 'SELECT * FROM products WHERE active=1 ORDER BY featured DESC,sort_order,id';
  const bannerSql = admin ? 'SELECT * FROM banners ORDER BY sort_order,id' : 'SELECT * FROM banners WHERE active=1 ORDER BY sort_order,id';
  const couponSql = admin ? 'SELECT * FROM coupons ORDER BY code' : 'SELECT * FROM coupons WHERE active=1 ORDER BY code';
  const regionSql = admin ? 'SELECT * FROM delivery_regions ORDER BY name' : 'SELECT * FROM delivery_regions WHERE active=1 ORDER BY name';

  const coupons = {};
  for (const row of db.prepare(couponSql).all()) coupons[row.code] = publicCoupon(row);

  return {
    version: Number(getMeta('change_version', '1')),
    settings,
    products: db.prepare(productSql).all().map(publicProduct),
    banners: db.prepare(bannerSql).all().map(publicBanner),
    coupons,
    neighborhoods: db.prepare(regionSql).all().map(publicRegion),
    categories: db.prepare(admin ? 'SELECT * FROM categories ORDER BY sort_order,name' : 'SELECT * FROM categories WHERE active=1 ORDER BY sort_order,name').all().map(publicCategory)
  };
}

function cleanupSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
}

function currentUser(req) {
  cleanupSessions();
  const token = parseCookies(req).sc_session;
  if (!token) return null;
  const row = db.prepare(`SELECT u.id,u.name,u.username,u.role,u.active,s.expires_at
                          FROM sessions s JOIN users u ON u.id=s.user_id
                          WHERE s.token_hash=?`).get(hashToken(token));
  if (!row || !row.active || row.expires_at <= now()) return null;
  return { id:Number(row.id), name:row.name, username:row.username, role:row.role };
}

function requireAuth(req, res, minRole = 'attendant') {
  const user = currentUser(req);
  if (!user) {
    sendJson(res, 401, { ok:false, error:'Sessão inválida ou expirada.' });
    return null;
  }
  if ((ROLE_LEVEL[user.role] || 0) < (ROLE_LEVEL[minRole] || 1)) {
    sendJson(res, 403, { ok:false, error:'Você não possui permissão para esta ação.' });
    return null;
  }
  return user;
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 15);
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function orderId() {
  const d = new Date();
  const date = [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('');
  for (let i = 0; i < 10; i++) {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const id = `SC-${date}-${suffix}`;
    if (!db.prepare('SELECT 1 FROM orders WHERE id=?').get(id)) return id;
  }
  return `SC-${date}-${Date.now().toString().slice(-6)}`;
}

function normalizeQuantity(product, rawQty) {
  const saleMode = product.sale_mode || 'unit';
  const step = Math.max(0.001, Number(product.quantity_step || (saleMode === 'weight' ? 0.1 : 1)));
  const min = Math.max(step, Number(product.min_quantity || step));
  const max = saleMode === 'weight' ? 1000 : 999;
  let qty = Number(rawQty);
  if (!Number.isFinite(qty) || qty <= 0) qty = min;
  qty = Math.max(min, Math.min(max, qty));
  qty = Math.round(qty / step) * step;
  const decimals = step < 0.01 ? 3 : step < 1 ? 2 : 0;
  return Number(qty.toFixed(decimals));
}

function formatQty(qty, unit) {
  const value = Number(qty);
  const text = Number.isInteger(value) ? String(value) : value.toLocaleString('pt-BR',{maximumFractionDigits:3});
  return `${text}${unit && unit !== 'un' ? ` ${unit}` : ' un.'}`;
}

function calculateOrder(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw Object.assign(new Error('Carrinho vazio.'), { statusCode: 400 });
  if (items.length > 100) throw Object.assign(new Error('Quantidade de itens acima do limite.'), { statusCode: 400 });

  const canonicalItems = [];
  let subtotal = 0;
  let quantity = 0;

  for (const raw of items) {
    const id = Number(raw.productId ?? raw.id);
    const product = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(id);
    if (!product) throw Object.assign(new Error(`Produto ${id} não está disponível.`), { statusCode: 409 });
    const qty = normalizeQuantity(product, raw.quantity ?? raw.qty);
    if (Number(product.stock) + 1e-9 < qty) {
      throw Object.assign(new Error(`Estoque insuficiente para ${product.name}. Disponível: ${formatQty(product.stock, product.measure_unit)}.`), { statusCode: 409 });
    }
    const line = roundMoney(Number(product.price) * qty);
    subtotal = roundMoney(subtotal + line);
    quantity += 1; // quantidade de linhas/produtos diferentes; pesos não são somados a unidades.
    canonicalItems.push({
      productId: Number(product.id), name: product.name, unit: product.unit,
      saleMode: product.sale_mode || 'unit', measureUnit: product.measure_unit || 'un',
      price: Number(product.price), qty, lineTotal: line,
      substitution: safeText(raw.substitution || payload.substitutionPreference || 'contact', 40),
      itemNote: safeText(raw.note || '', 300)
    });
  }

  let discount = 0;
  let couponCode = safeText(payload.couponCode || '', 40).toUpperCase();
  if (couponCode) {
    const coupon = db.prepare('SELECT * FROM coupons WHERE code=? AND active=1').get(couponCode);
    if (!coupon) throw Object.assign(new Error('Cupom inválido ou inativo.'), { statusCode: 400 });
    if (subtotal < Number(coupon.minimum_order || 0)) {
      throw Object.assign(new Error(`Esse cupom exige pedido mínimo de R$ ${Number(coupon.minimum_order).toFixed(2)}.`), { statusCode: 400 });
    }
    discount = coupon.type === 'percent' ? subtotal * (Number(coupon.value) / 100) : Number(coupon.value);
    discount = roundMoney(Math.min(subtotal, Math.max(0, discount)));
  }

  const method = safeText(payload.deliveryMethod || payload.method || 'Entrega', 40);
  let region = null;
  let deliveryFee = 0;
  const settings = getSettingsObject();
  let minimum = Number(settings.minimumOrder || 0);

  if (method === 'Entrega') {
    const regionId = Number(payload.regionId || 0);
    const regionName = safeText(payload.regionName || payload.neighborhood || '', 120);
    region = regionId ? db.prepare('SELECT * FROM delivery_regions WHERE id=? AND active=1').get(regionId) : db.prepare('SELECT * FROM delivery_regions WHERE name=? AND active=1').get(regionName);
    if (!region) throw Object.assign(new Error('Selecione uma região de entrega válida.'), { statusCode: 400 });
    deliveryFee = roundMoney(region.fee || 0);
    const freeThreshold = Number(settings.freeDeliveryThreshold || 0);
    if (freeThreshold > 0 && (subtotal - discount) >= freeThreshold) deliveryFee = 0;
    minimum = Number(region.minimum || minimum);
    if ((subtotal - discount) < minimum) throw Object.assign(new Error(`Pedido mínimo para ${region.name}: R$ ${minimum.toFixed(2)}.`), { statusCode: 400 });
  }

  return { canonicalItems, quantity, subtotal, discount, deliveryFee, total:roundMoney(subtotal-discount+deliveryFee), couponCode, method, region, minimum };
}

function createOrder(payload) {
  const customerName = safeText(payload.customer?.name || payload.customerName || '', 120);
  const phone = normalizePhone(payload.customer?.phone || payload.phone || '');
  if (!customerName) throw Object.assign(new Error('Informe o nome do cliente.'), { statusCode: 400 });
  if (phone.length < 10) throw Object.assign(new Error('Informe um telefone válido.'), { statusCode: 400 });

  const calc = calculateOrder(payload);
  const id = orderId();
  const timestamp = now();
  const substitutionPreference = safeText(payload.substitutionPreference || 'contact', 40);
  const address = safeText(payload.address || '', 250);

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const item of calc.canonicalItems) {
      const row = db.prepare('SELECT stock FROM products WHERE id=?').get(item.productId);
      if (!row || Number(row.stock) + 1e-9 < item.qty) throw Object.assign(new Error(`Estoque alterado para ${item.name}. Atualize o carrinho.`), { statusCode: 409 });
    }

    db.prepare(`INSERT INTO orders(
      id,created_at,updated_at,customer_name,phone,method,region_id,region_name,address,reference,
      delivery_time,payment,change_for,notes,coupon_code,subtotal,discount,delivery_fee,total,status,substitution_preference
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id,timestamp,timestamp,customerName,phone,calc.method,
      calc.region ? Number(calc.region.id) : null,
      calc.region ? calc.region.name : 'Retirada na loja',
      address,safeText(payload.reference || '',180),safeText(payload.deliveryTime || '',80),
      safeText(payload.paymentMethod || payload.payment || 'A combinar',80),safeText(payload.changeFor || '',80),
      safeText(payload.notes || '',1000),calc.couponCode,calc.subtotal,calc.discount,calc.deliveryFee,calc.total,'novo',substitutionPreference
    );

    const itemStmt = db.prepare(`INSERT INTO order_items(order_id,product_id,name,unit,price,qty,substitution,item_note) VALUES(?,?,?,?,?,?,?,?)`);
    const stockStmt = db.prepare('UPDATE products SET stock=stock-?, updated_at=? WHERE id=?');
    for (const item of calc.canonicalItems) {
      itemStmt.run(id,item.productId,item.name,item.unit,item.price,item.qty,item.substitution,item.itemNote);
      stockStmt.run(item.qty,timestamp,item.productId);
    }

    db.prepare(`INSERT INTO order_events(order_id,status,note,user_id,created_at) VALUES(?,?,?,?,?)`).run(id,'novo','Pedido criado pelo site e preparado para envio ao WhatsApp.',null,timestamp);
    db.prepare(`INSERT INTO customers(phone,name,last_address,last_region,order_count,total_spent,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?)
                ON CONFLICT(phone) DO UPDATE SET name=excluded.name,last_address=excluded.last_address,last_region=excluded.last_region,
                order_count=customers.order_count+1,total_spent=customers.total_spent+excluded.total_spent,updated_at=excluded.updated_at`)
      .run(phone,customerName,address,calc.region ? calc.region.name : 'Retirada na loja',1,calc.total,timestamp,timestamp);
    bumpVersion();
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }

  const created=getOrder(id,{includePrivate:true});
  integrations.emitInBackground('order.created', created);
  return created;
}

function getOrder(id, { includePrivate = false } = {}) {
  const row = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!row) return null;
  const items = db.prepare('SELECT product_id,name,unit,price,qty,substitution,item_note FROM order_items WHERE order_id=? ORDER BY id').all(id).map(i => ({
    productId:Number(i.product_id), name:i.name, unit:i.unit, price:Number(i.price), qty:Number(i.qty), substitution:i.substitution || '', note:i.item_note || ''
  }));
  const events = db.prepare(`SELECT e.status,e.note,e.created_at,u.name AS user_name FROM order_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.order_id=? ORDER BY e.id`).all(id).map(e => ({status:e.status,note:e.note,createdAt:e.created_at,userName:e.user_name || ''}));
  const base = {
    id:row.id,createdAt:row.created_at,updatedAt:row.updated_at,customer:row.customer_name,method:row.method,regionName:row.region_name,
    payment:row.payment,couponCode:row.coupon_code,substitutionPreference:row.substitution_preference || 'contact',
    subtotal:Number(row.subtotal),discount:Number(row.discount),deliveryFee:Number(row.delivery_fee),total:Number(row.total),status:row.status,items,events
  };
  if (includePrivate) Object.assign(base,{phone:row.phone,address:row.address,reference:row.reference,deliveryTime:row.delivery_time,changeFor:row.change_for,notes:row.notes,regionId:row.region_id===null?null:Number(row.region_id)});
  return base;
}

function updateOrderStatus(orderIdValue, newStatus, note, user) {
  if (!ORDER_STATUSES.includes(newStatus)) throw Object.assign(new Error('Status inválido.'), { statusCode: 400 });
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(orderIdValue);
  if (!order) throw Object.assign(new Error('Pedido não encontrado.'), { statusCode: 404 });
  if (order.status === newStatus) return getOrder(orderIdValue, { includePrivate:true });

  const items = db.prepare('SELECT product_id,qty FROM order_items WHERE order_id=?').all(orderIdValue);
  const timestamp = now();

  db.exec('BEGIN IMMEDIATE');
  try {
    if (newStatus === 'cancelado' && order.status !== 'cancelado') {
      const restore = db.prepare('UPDATE products SET stock=stock+?, updated_at=? WHERE id=?');
      for (const item of items) if (item.product_id) restore.run(Number(item.qty), timestamp, Number(item.product_id));
    }

    if (order.status === 'cancelado' && newStatus !== 'cancelado') {
      for (const item of items) {
        if (!item.product_id) continue;
        const product = db.prepare('SELECT stock,name FROM products WHERE id=?').get(Number(item.product_id));
        if (!product || Number(product.stock) < Number(item.qty)) {
          throw Object.assign(new Error(`Não há estoque suficiente para reativar o pedido (${product?.name || item.product_id}).`), { statusCode:409 });
        }
      }
      const reserve = db.prepare('UPDATE products SET stock=stock-?, updated_at=? WHERE id=?');
      for (const item of items) if (item.product_id) reserve.run(Number(item.qty), timestamp, Number(item.product_id));
    }

    db.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run(newStatus, timestamp, orderIdValue);
    db.prepare(`INSERT INTO order_events(order_id,status,note,user_id,created_at) VALUES(?,?,?,?,?)`)
      .run(orderIdValue, newStatus, safeText(note || '', 500), user.id, timestamp);
    audit(user.id, 'status_update', 'order', orderIdValue, `${order.status} -> ${newStatus}`);
    bumpVersion();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const updated=getOrder(orderIdValue,{includePrivate:true});
  integrations.emitInBackground('order.status_changed', updated);
  return updated;
}

function statusLabel(status) {
  return ({
    novo:'Novo pedido', confirmado:'Confirmado', separando:'Em separação', pronto:'Pronto',
    saiu_entrega:'Saiu para entrega', concluido:'Concluído', cancelado:'Cancelado'
  })[status] || status;
}

function whatsappMessage(order, settings) {
  const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value||0));
  const qtyText=item=>{const q=Number(item.qty);const txt=Number.isInteger(q)?String(q):q.toLocaleString('pt-BR',{maximumFractionDigits:3});const unit=(item.unit||'').toLowerCase().includes('preço por kg')?'kg':'';return unit?`${txt} ${unit}`:`${txt}x`;};
  const substitutionLabel={none:'Não substituir',equivalent:'Pode substituir por equivalente',contact:'Entrar em contato antes de substituir'};
  const lines=order.items.map((item,index)=>`${index+1}. ${qtyText(item)} ${item.name} (${item.unit}) — ${money(item.price*item.qty)}`);
  return [
    `Olá! Gostaria de finalizar o pedido *${order.id}* no *${settings.storeName || 'Supermercado SC Central'}*.`,'',
    '━━━━━━━━━━━━━━━━━━━━','🛒 *PRODUTOS*','━━━━━━━━━━━━━━━━━━━━',...lines,'',
    `📋 *Produtos diferentes:* ${order.items.length}`,
    `💲 *Subtotal:* ${money(order.subtotal)}`,
    order.discount>0?`✅ *Desconto:* - ${money(order.discount)}`:'',
    order.couponCode?`🏷️ *Cupom:* ${order.couponCode}`:'🏷️ *Cupom:* nenhum',
    `🚚 *Taxa estimada:* ${money(order.deliveryFee)}`,
    `💰 *TOTAL ESTIMADO: ${money(order.total)}*`,'',
    `🔁 *Substituição:* ${substitutionLabel[order.substitutionPreference] || order.substitutionPreference || 'Entrar em contato'}`,'',
    '━━━━━━━━━━━━━━━━━━━━','📌 *DADOS DO CLIENTE*','━━━━━━━━━━━━━━━━━━━━',
    `👤 *Cliente:* ${order.customer}`,`📞 *Telefone:* ${order.phone}`,`📦 *Recebimento:* ${order.method}`,
    order.method==='Entrega'?`🏘️ *Região:* ${order.regionName}`:'',order.method==='Entrega'?`📍 *Endereço:* ${order.address || '-'}`:'',
    order.method==='Entrega'?`🧭 *Referência:* ${order.reference || '-'}`:'',order.method==='Entrega'?`🕐 *Horário:* ${order.deliveryTime || 'O quanto antes'}`:'',
    `💳 *Pagamento:* ${order.payment || 'A combinar'}`,order.payment==='Dinheiro'&&order.changeFor?`💵 *Troco para:* ${order.changeFor}`:'',
    order.notes?`📝 *Observações:* ${order.notes}`:'','',`📌 *Status inicial:* ${statusLabel(order.status)}`,
    'Por favor, confirme estoque, pesagem quando aplicável, valores e disponibilidade da entrega.'
  ].filter(Boolean).join('\n');
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8',
    '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
    '.svg':'image/svg+xml', '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8'
  })[ext] || 'application/octet-stream';
}

function serveStatic(req, res, pathname) {
  let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  try { relative = decodeURIComponent(relative); } catch { return sendText(res, 400, 'Caminho inválido.'); }
  const filePath = path.resolve(PUBLIC, relative);
  if (!filePath.startsWith(PUBLIC + path.sep) && filePath !== path.join(PUBLIC, 'index.html')) return sendText(res, 403, 'Acesso negado.');
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return sendText(res, 404, 'Arquivo não encontrado.');
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': mimeFor(filePath),
    'Content-Length': stat.size,
    'Cache-Control': path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600'
  });
  fs.createReadStream(filePath).pipe(res);
}

function boolInt(value) { return value ? 1 : 0; }

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const method = req.method || 'GET';

  if (method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { ok:true, version:'6.0.0', database:path.basename(DB_PATH), changeVersion:Number(getMeta('change_version','1')), integrationWebhook:integrations.enabled(), time:now() });
  }

  if (method === 'GET' && pathname === '/api/bootstrap') {
    return sendJson(res, 200, { ok:true, ...getBootstrap() });
  }

  if (method === 'GET' && pathname === '/api/version') {
    return sendJson(res, 200, { ok:true, version:Number(getMeta('change_version','1')) });
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    if (!rateLimit(req, 'login', 12, 10 * 60 * 1000)) return sendJson(res, 429, { ok:false, error:'Muitas tentativas de login. Aguarde alguns minutos.' });
    const body = await readJson(req);
    const username = safeText(body.username || '', 80);
    const password = String(body.password || '');
    const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
    if (!user || !user.active || !verifyPassword(password, user.password_salt, user.password_hash)) {
      return sendJson(res, 401, { ok:false, error:'Usuário ou senha inválidos.' });
    }
    const token = randomToken();
    const createdAt = now();
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
      .run(hashToken(token), user.id, expiresAt, createdAt);
    audit(user.id, 'login', 'session', '', req.socket.remoteAddress || '');
    return sendJson(res, 200, { ok:true, user:{ id:user.id,name:user.name,username:user.username,role:user.role } }, {
      'Set-Cookie': sessionCookie(token, { secure:IS_SECURE, maxAge:SESSION_HOURS*3600 })
    });
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    const token = parseCookies(req).sc_session;
    const user = currentUser(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
    if (user) audit(user.id, 'logout', 'session');
    return sendJson(res, 200, { ok:true }, { 'Set-Cookie': clearSessionCookie({ secure:IS_SECURE }) });
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    const user = currentUser(req);
    if (!user) return sendJson(res, 401, { ok:false, error:'Não autenticado.' });
    return sendJson(res, 200, { ok:true, user });
  }

  if (method === 'POST' && pathname === '/api/auth/change-password') {
    const user = requireAuth(req,res,'attendant'); if (!user) return;
    const body = await readJson(req);
    const row = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
    if (!verifyPassword(String(body.currentPassword || ''), row.password_salt, row.password_hash)) {
      return sendJson(res, 400, { ok:false, error:'Senha atual incorreta.' });
    }
    const next = String(body.newPassword || '');
    if (next.length < 8) return sendJson(res, 400, { ok:false, error:'A nova senha deve ter pelo menos 8 caracteres.' });
    const { salt, hash } = hashPassword(next);
    db.prepare('UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=?').run(hash,salt,now(),user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    audit(user.id,'change_password','user',user.id);
    return sendJson(res, 200, { ok:true }, { 'Set-Cookie': clearSessionCookie({ secure:IS_SECURE }) });
  }

  if (method === 'POST' && pathname === '/api/orders') {
    if (!rateLimit(req, 'order', 30, 10 * 60 * 1000)) return sendJson(res, 429, { ok:false, error:'Muitos pedidos em pouco tempo. Aguarde alguns minutos.' });
    const settings = getSettingsObject();
    const storeWhatsapp = safeText(settings.whatsapp || '', 30).replace(/\D/g,'');
    if (!/^\d{12,13}$/.test(storeWhatsapp)) {
      return sendJson(res, 409, { ok:false, error:'O WhatsApp da loja ainda não foi configurado no Painel V6.' });
    }
    const body = await readJson(req);
    const created = createOrder(body);
    return sendJson(res, 201, {
      ok:true,
      order: created,
      whatsapp: storeWhatsapp,
      whatsappMessage: whatsappMessage(created, settings)
    });
  }

  if (method === 'GET' && pathname === '/api/orders/track') {
    const id = safeText(url.searchParams.get('order') || '', 40).toUpperCase();
    const phone = normalizePhone(url.searchParams.get('phone') || '');
    if (!id || phone.length < 4) return sendJson(res, 400, { ok:false, error:'Informe o pedido e o telefone.' });
    const row = db.prepare('SELECT id,phone FROM orders WHERE id=?').get(id);
    if (!row || !String(row.phone).endsWith(phone.slice(-4))) return sendJson(res, 404, { ok:false, error:'Pedido não encontrado para os dados informados.' });
    return sendJson(res, 200, { ok:true, order:getOrder(id,{includePrivate:false}) });
  }

  // ----------------- API ADMIN -----------------
  if (pathname.startsWith('/api/admin/')) {
    const minRole = pathname.startsWith('/api/admin/users') || pathname === '/api/admin/settings' ? 'admin' : 'attendant';
    const user = requireAuth(req,res,minRole); if (!user) return;

    if (method === 'GET' && pathname === '/api/admin/bootstrap') {
      return sendJson(res, 200, { ok:true, ...getBootstrap({admin:true}), user });
    }

    if (method === 'GET' && pathname === '/api/admin/dashboard') {
      const products = db.prepare('SELECT COUNT(*) c, SUM(CASE WHEN active=1 AND stock>0 THEN 1 ELSE 0 END) in_stock, SUM(CASE WHEN active=1 AND stock BETWEEN 1 AND 8 THEN 1 ELSE 0 END) low_stock FROM products').get();
      const orders = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) total, SUM(CASE WHEN status NOT IN ('concluido','cancelado') THEN 1 ELSE 0 END) open FROM orders`).get();
      const byStatus = db.prepare('SELECT status,COUNT(*) count FROM orders GROUP BY status ORDER BY count DESC').all();
      const categories = db.prepare('SELECT category,COUNT(*) count FROM products WHERE active=1 GROUP BY category ORDER BY count DESC').all();
      const recentOrders = db.prepare('SELECT id,customer_name,total,status,created_at,method FROM orders ORDER BY created_at DESC LIMIT 8').all();
      return sendJson(res,200,{ok:true,stats:{products:Number(products.c),inStock:Number(products.in_stock||0),lowStock:Number(products.low_stock||0),orders:Number(orders.c),openOrders:Number(orders.open||0),sales:Number(orders.total||0)},byStatus,categories,recentOrders});
    }

    if (method === 'GET' && pathname === '/api/admin/products') {
      return sendJson(res,200,{ok:true,products:db.prepare('SELECT * FROM products ORDER BY id DESC').all().map(publicProduct)});
    }

    if (method === 'POST' && pathname === '/api/admin/products') {
      if ((ROLE_LEVEL[user.role]||0) < ROLE_LEVEL.manager) return sendJson(res,403,{ok:false,error:'Apenas gerente ou administrador pode cadastrar produtos.'});
      const b=await readJson(req); const t=now();
      const result=db.prepare(`INSERT INTO products(name,category,unit,price,old_price,badge,emoji,stock,featured,image,active,created_at,updated_at,sku,barcode,subcategory,description,sale_mode,measure_unit,quantity_step,min_quantity,promo_start,promo_end,sort_order)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        safeText(b.name,160),safeText(b.category,80),safeText(b.unit,80),Number(b.price||0),b.oldPrice===null||b.oldPrice===''?null:Number(b.oldPrice),safeText(b.badge,60),safeText(b.emoji||'🛒',16),Math.max(0,Number(b.stock||0)),boolInt(b.featured),safeText(b.image,1000000),b.active===false?0:1,t,t,
        safeText(b.sku,80),safeText(b.barcode,80),safeText(b.subcategory,100),safeText(b.description,2000),b.saleMode==='weight'?'weight':'unit',safeText(b.measureUnit||(b.saleMode==='weight'?'kg':'un'),20),Math.max(.001,Number(b.quantityStep||1)),Math.max(.001,Number(b.minQuantity||b.quantityStep||1)),safeText(b.promoStart,40),safeText(b.promoEnd,40),Number(b.sortOrder||0)
      );
      bumpVersion(); audit(user.id,'create','product',result.lastInsertRowid,safeText(b.name,160));
      return sendJson(res,201,{ok:true,product:publicProduct(db.prepare('SELECT * FROM products WHERE id=?').get(Number(result.lastInsertRowid)))});
    }

    const productMatch = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
    if (productMatch && method === 'PUT') {
      if ((ROLE_LEVEL[user.role]||0) < ROLE_LEVEL.manager) return sendJson(res,403,{ok:false,error:'Apenas gerente ou administrador pode editar produtos.'});
      const id=Number(productMatch[1]),b=await readJson(req);const current=db.prepare('SELECT * FROM products WHERE id=?').get(id);
      if(!current)return sendJson(res,404,{ok:false,error:'Produto não encontrado.'});
      db.prepare(`UPDATE products SET name=?,category=?,unit=?,price=?,old_price=?,badge=?,emoji=?,stock=?,featured=?,image=?,active=?,updated_at=?,sku=?,barcode=?,subcategory=?,description=?,sale_mode=?,measure_unit=?,quantity_step=?,min_quantity=?,promo_start=?,promo_end=?,sort_order=? WHERE id=?`).run(
        safeText(b.name??current.name,160),safeText(b.category??current.category,80),safeText(b.unit??current.unit,80),Number(b.price??current.price),b.oldPrice===null||b.oldPrice===''?null:Number(b.oldPrice??current.old_price),safeText(b.badge??current.badge,60),safeText(b.emoji??current.emoji,16),Math.max(0,Number(b.stock??current.stock)),boolInt(b.featured??Boolean(current.featured)),safeText(b.image??current.image,1000000),b.active===undefined?current.active:boolInt(b.active),now(),
        safeText(b.sku??current.sku,80),safeText(b.barcode??current.barcode,80),safeText(b.subcategory??current.subcategory,100),safeText(b.description??current.description,2000),b.saleMode?(b.saleMode==='weight'?'weight':'unit'):current.sale_mode,safeText(b.measureUnit??current.measure_unit,20),Math.max(.001,Number(b.quantityStep??current.quantity_step??1)),Math.max(.001,Number(b.minQuantity??current.min_quantity??1)),safeText(b.promoStart??current.promo_start,40),safeText(b.promoEnd??current.promo_end,40),Number(b.sortOrder??current.sort_order??0),id
      );
      bumpVersion();audit(user.id,'update','product',id,current.name);return sendJson(res,200,{ok:true,product:publicProduct(db.prepare('SELECT * FROM products WHERE id=?').get(id))});
    }
    if (productMatch && method === 'DELETE') {
      if ((ROLE_LEVEL[user.role]||0) < ROLE_LEVEL.manager) return sendJson(res,403,{ok:false,error:'Apenas gerente ou administrador pode excluir produtos.'});
      const id=Number(productMatch[1]);
      const current=db.prepare('SELECT name FROM products WHERE id=?').get(id); if(!current) return sendJson(res,404,{ok:false,error:'Produto não encontrado.'});
      db.prepare('UPDATE products SET active=0,updated_at=? WHERE id=?').run(now(),id); bumpVersion(); audit(user.id,'deactivate','product',id,current.name);
      return sendJson(res,200,{ok:true});
    }

    // ----------------- V6 FINAL: CATEGORIAS, IMPORTAÇÃO, UPLOAD E RELATÓRIOS -----------------
    if (method === 'GET' && pathname === '/api/admin/categories') {
      if ((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager) return sendJson(res,403,{ok:false,error:'Sem permissão.'});
      return sendJson(res,200,{ok:true,categories:db.prepare('SELECT * FROM categories ORDER BY sort_order,name').all().map(publicCategory)});
    }
    if (method === 'POST' && pathname === '/api/admin/categories') {
      if ((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager) return sendJson(res,403,{ok:false,error:'Sem permissão.'});
      const b=await readJson(req),t=now();const name=safeText(b.name,100);let slug=safeText(b.slug,80).toLowerCase().replace(/[^a-z0-9-]/g,'');if(!slug)slug=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
      try { const r=db.prepare('INSERT INTO categories(name,slug,icon,description,image,active,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(name,slug,safeText(b.icon||'🛒',16),safeText(b.description,500),safeText(b.image,1000000),b.active===false?0:1,Number(b.sortOrder||0),t,t);bumpVersion();audit(user.id,'create','category',r.lastInsertRowid,name);return sendJson(res,201,{ok:true,category:publicCategory(db.prepare('SELECT * FROM categories WHERE id=?').get(Number(r.lastInsertRowid)))}); } catch(e){ return sendJson(res,409,{ok:false,error:'Já existe uma categoria com esse identificador.'}); }
    }
    const categoryMatch=pathname.match(/^\/api\/admin\/categories\/(\d+)$/);
    if(categoryMatch&&method==='PUT'){
      if((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager)return sendJson(res,403,{ok:false,error:'Sem permissão.'});const id=Number(categoryMatch[1]),b=await readJson(req),c=db.prepare('SELECT * FROM categories WHERE id=?').get(id);if(!c)return sendJson(res,404,{ok:false,error:'Categoria não encontrada.'});db.prepare('UPDATE categories SET name=?,slug=?,icon=?,description=?,image=?,active=?,sort_order=?,updated_at=? WHERE id=?').run(safeText(b.name??c.name,100),safeText(b.slug??c.slug,80).toLowerCase().replace(/[^a-z0-9-]/g,''),safeText(b.icon??c.icon,16),safeText(b.description??c.description,500),safeText(b.image??c.image,1000000),b.active===undefined?c.active:boolInt(b.active),Number(b.sortOrder??c.sort_order),now(),id);bumpVersion();audit(user.id,'update','category',id,c.name);return sendJson(res,200,{ok:true});
    }
    if(categoryMatch&&method==='DELETE'){
      if((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager)return sendJson(res,403,{ok:false,error:'Sem permissão.'});const id=Number(categoryMatch[1]);db.prepare('UPDATE categories SET active=0,updated_at=? WHERE id=?').run(now(),id);bumpVersion();audit(user.id,'deactivate','category',id);return sendJson(res,200,{ok:true});
    }

    if (method === 'POST' && pathname === '/api/admin/uploads/image') {
      if ((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager) return sendJson(res,403,{ok:false,error:'Sem permissão.'});
      const b=await readJson(req);const data=String(b.dataUrl||'');const m=data.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);if(!m)return sendJson(res,400,{ok:false,error:'Imagem inválida. Use PNG, JPG ou WEBP.'});const buffer=Buffer.from(m[2],'base64');if(buffer.length>2*1024*1024)return sendJson(res,413,{ok:false,error:'Imagem muito grande. Limite: 2 MB.'});const ext=m[1].toLowerCase()==='jpeg'?'jpg':m[1].toLowerCase();const filename=`produto-${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;fs.writeFileSync(path.join(UPLOAD_DIR,filename),buffer);audit(user.id,'create','upload',filename);return sendJson(res,201,{ok:true,url:`/uploads/${filename}`});
    }

    if (method === 'POST' && pathname === '/api/admin/products/import') {
      if ((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager) return sendJson(res,403,{ok:false,error:'Sem permissão.'});
      const b=await readJson(req);const rows=Array.isArray(b.rows)?b.rows:[];if(!rows.length)return sendJson(res,400,{ok:false,error:'Nenhum produto para importar.'});if(rows.length>1000)return sendJson(res,400,{ok:false,error:'Importe no máximo 1000 produtos por vez.'});const t=now();let created=0,updated=0;db.exec('BEGIN');try{for(const row of rows){const name=safeText(row.name||row.nome,160);if(!name)continue;const sku=safeText(row.sku,80);const existing=sku?db.prepare('SELECT * FROM products WHERE sku=? LIMIT 1').get(sku):null;const vals={category:safeText(row.category||row.categoria||'mercearia',80),subcategory:safeText(row.subcategory||row.subcategoria,100),unit:safeText(row.unit||row.unidade||'Unidade',80),price:Number(row.price??row.preco??0),stock:Math.max(0,Number(row.stock??row.estoque??0)),saleMode:String(row.saleMode||row.modo||'unit')==='weight'?'weight':'unit',measureUnit:safeText(row.measureUnit||row.medida||'un',20),step:Math.max(.001,Number(row.quantityStep||row.passo||1)),min:Math.max(.001,Number(row.minQuantity||row.minimo||row.quantityStep||1)),barcode:safeText(row.barcode||row.codigoBarras,80),image:safeText(row.image||row.imagem,1000000)};if(existing){db.prepare('UPDATE products SET name=?,category=?,subcategory=?,unit=?,price=?,stock=?,sale_mode=?,measure_unit=?,quantity_step=?,min_quantity=?,barcode=?,image=CASE WHEN ?<>\'\' THEN ? ELSE image END,active=1,updated_at=? WHERE id=?').run(name,vals.category,vals.subcategory,vals.unit,vals.price,vals.stock,vals.saleMode,vals.measureUnit,vals.step,vals.min,vals.barcode,vals.image,vals.image,t,existing.id);updated++;}else{db.prepare(`INSERT INTO products(name,category,unit,price,old_price,badge,emoji,stock,featured,image,active,created_at,updated_at,sku,barcode,subcategory,description,sale_mode,measure_unit,quantity_step,min_quantity,promo_start,promo_end,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(name,vals.category,vals.unit,vals.price,null,'','🛒',vals.stock,0,vals.image,1,t,t,sku,vals.barcode,vals.subcategory,'',vals.saleMode,vals.measureUnit,vals.step,vals.min,'','',0);created++;}}bumpVersion();db.exec('COMMIT');audit(user.id,'import','product','bulk',`${created} criados, ${updated} atualizados`);return sendJson(res,200,{ok:true,created,updated});}catch(error){db.exec('ROLLBACK');throw error;}
    }

    if (method === 'GET' && pathname === '/api/admin/customers') {
      const q=safeText(url.searchParams.get('q')||'',120);let sql='SELECT id,phone,name,last_address,last_region,order_count,total_spent,created_at,updated_at FROM customers';const params=[];if(q){sql+=' WHERE name LIKE ? OR phone LIKE ?';params.push(`%${q}%`,`%${q}%`);}sql+=' ORDER BY total_spent DESC,updated_at DESC LIMIT 500';const customers=db.prepare(sql).all(...params).map(c=>({id:Number(c.id),phone:c.phone,name:c.name,lastAddress:c.last_address,lastRegion:c.last_region,orderCount:Number(c.order_count||0),totalSpent:Number(c.total_spent||0),createdAt:c.created_at,updatedAt:c.updated_at}));return sendJson(res,200,{ok:true,customers});
    }

    if (method === 'GET' && pathname === '/api/admin/reports') {
      if ((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager) return sendJson(res,403,{ok:false,error:'Sem permissão.'});
      const days=Math.max(1,Math.min(365,Number(url.searchParams.get('days')||30)));const since=new Date(Date.now()-days*86400000).toISOString();
      const summary=db.prepare(`SELECT COUNT(*) orders,COALESCE(SUM(total),0) revenue,COALESCE(AVG(total),0) ticket,COUNT(DISTINCT phone) customers FROM orders WHERE created_at>=? AND status<>'cancelado'`).get(since);
      const topProducts=db.prepare(`SELECT oi.product_id,oi.name,SUM(oi.qty) qty,SUM(oi.qty*oi.price) revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.created_at>=? AND o.status<>'cancelado' GROUP BY oi.product_id,oi.name ORDER BY revenue DESC LIMIT 12`).all(since);
      const daily=db.prepare(`SELECT substr(created_at,1,10) day,COUNT(*) orders,SUM(total) revenue FROM orders WHERE created_at>=? AND status<>'cancelado' GROUP BY substr(created_at,1,10) ORDER BY day`).all(since);
      const regions=db.prepare(`SELECT region_name region,COUNT(*) orders,SUM(total) revenue FROM orders WHERE created_at>=? AND status<>'cancelado' GROUP BY region_name ORDER BY orders DESC LIMIT 10`).all(since);
      const categories=db.prepare(`SELECT p.category,SUM(oi.qty*oi.price) revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN products p ON p.id=oi.product_id WHERE o.created_at>=? AND o.status<>'cancelado' GROUP BY p.category ORDER BY revenue DESC`).all(since);
      return sendJson(res,200,{ok:true,days,summary:{orders:Number(summary.orders||0),revenue:Number(summary.revenue||0),ticket:Number(summary.ticket||0),customers:Number(summary.customers||0)},topProducts:topProducts.map(r=>({...r,qty:Number(r.qty),revenue:Number(r.revenue)})),daily:daily.map(r=>({...r,orders:Number(r.orders),revenue:Number(r.revenue)})),regions:regions.map(r=>({...r,orders:Number(r.orders),revenue:Number(r.revenue)})),categories:categories.map(r=>({...r,revenue:Number(r.revenue||0)}))});
    }

    if (method === 'GET' && pathname === '/api/admin/banners') return sendJson(res,200,{ok:true,banners:db.prepare('SELECT * FROM banners ORDER BY sort_order,id').all().map(publicBanner)});
    if (method === 'POST' && pathname === '/api/admin/banners') {
      if ((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager) return sendJson(res,403,{ok:false,error:'Sem permissão.'});
      const b=await readJson(req),t=now(); const max=db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 n FROM banners').get().n;
      const r=db.prepare(`INSERT INTO banners(eyebrow,title,text,button,target,icon,image,theme,active,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(safeText(b.eyebrow,100),safeText(b.title,220),safeText(b.text,500),safeText(b.button||'Ver produtos',80),safeText(b.target||'#produtos',200),safeText(b.icon||'🛒',16),safeText(b.image,1000000),safeText(b.theme||'blue',30),b.active===false?0:1,Number(b.sortOrder??max),t,t);
      bumpVersion(); audit(user.id,'create','banner',r.lastInsertRowid,b.title);
      return sendJson(res,201,{ok:true,banner:publicBanner(db.prepare('SELECT * FROM banners WHERE id=?').get(Number(r.lastInsertRowid)))});
    }
    const bannerMatch=pathname.match(/^\/api\/admin\/banners\/(\d+)$/);
    if(bannerMatch && method==='PUT'){
      if((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager)return sendJson(res,403,{ok:false,error:'Sem permissão.'});
      const id=Number(bannerMatch[1]),b=await readJson(req),c=db.prepare('SELECT * FROM banners WHERE id=?').get(id); if(!c)return sendJson(res,404,{ok:false,error:'Banner não encontrado.'});
      db.prepare(`UPDATE banners SET eyebrow=?,title=?,text=?,button=?,target=?,icon=?,image=?,theme=?,active=?,sort_order=?,updated_at=? WHERE id=?`).run(safeText(b.eyebrow??c.eyebrow,100),safeText(b.title??c.title,220),safeText(b.text??c.text,500),safeText(b.button??c.button,80),safeText(b.target??c.target,200),safeText(b.icon??c.icon,16),safeText(b.image??c.image,1000000),safeText(b.theme??c.theme,30),b.active===undefined?c.active:boolInt(b.active),Number(b.sortOrder??c.sort_order),now(),id); bumpVersion();audit(user.id,'update','banner',id,c.title);return sendJson(res,200,{ok:true,banner:publicBanner(db.prepare('SELECT * FROM banners WHERE id=?').get(id))});
    }
    if(bannerMatch&&method==='DELETE'){if((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager)return sendJson(res,403,{ok:false,error:'Sem permissão.'});const id=Number(bannerMatch[1]);db.prepare('DELETE FROM banners WHERE id=?').run(id);bumpVersion();audit(user.id,'delete','banner',id);return sendJson(res,200,{ok:true});}

    if(method==='GET'&&pathname==='/api/admin/coupons'){
      const coupons={}; for(const row of db.prepare('SELECT * FROM coupons ORDER BY code').all()) coupons[row.code]=publicCoupon(row); return sendJson(res,200,{ok:true,coupons});
    }
    if(method==='POST'&&pathname==='/api/admin/coupons'){
      if((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager)return sendJson(res,403,{ok:false,error:'Sem permissão.'});
      const b=await readJson(req),code=safeText(b.code,40).toUpperCase().replace(/[^A-Z0-9_-]/g,''); if(!code)return sendJson(res,400,{ok:false,error:'Código inválido.'});const t=now();
      try{db.prepare('INSERT INTO coupons(code,type,value,label,minimum_order,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(code,b.type==='fixed'?'fixed':'percent',Number(b.value||0),safeText(b.label||code,120),Number(b.minimumOrder||0),b.active===false?0:1,t,t);}catch(e){return sendJson(res,409,{ok:false,error:'Já existe um cupom com esse código.'});}
      bumpVersion();audit(user.id,'create','coupon',code);return sendJson(res,201,{ok:true,coupon:{code,...publicCoupon(db.prepare('SELECT * FROM coupons WHERE code=?').get(code))}});
    }
    const couponMatch=pathname.match(/^\/api\/admin\/coupons\/([^/]+)$/);
    if(couponMatch&&method==='PUT'){
      if((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager)return sendJson(res,403,{ok:false,error:'Sem permissão.'}); const code=decodeURIComponent(couponMatch[1]).toUpperCase(),b=await readJson(req),c=db.prepare('SELECT * FROM coupons WHERE code=?').get(code);if(!c)return sendJson(res,404,{ok:false,error:'Cupom não encontrado.'});db.prepare('UPDATE coupons SET type=?,value=?,label=?,minimum_order=?,active=?,updated_at=? WHERE code=?').run(b.type==='fixed'?'fixed':'percent',Number(b.value??c.value),safeText(b.label??c.label,120),Number(b.minimumOrder??c.minimum_order),b.active===undefined?c.active:boolInt(b.active),now(),code);bumpVersion();audit(user.id,'update','coupon',code);return sendJson(res,200,{ok:true});
    }
    if(couponMatch&&method==='DELETE'){if((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager)return sendJson(res,403,{ok:false,error:'Sem permissão.'});const code=decodeURIComponent(couponMatch[1]).toUpperCase();db.prepare('DELETE FROM coupons WHERE code=?').run(code);bumpVersion();audit(user.id,'delete','coupon',code);return sendJson(res,200,{ok:true});}

    if(method==='GET'&&pathname==='/api/admin/regions')return sendJson(res,200,{ok:true,regions:db.prepare('SELECT * FROM delivery_regions ORDER BY name').all().map(publicRegion)});
    if(method==='POST'&&pathname==='/api/admin/regions'){
      if((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager)return sendJson(res,403,{ok:false,error:'Sem permissão.'});const b=await readJson(req),t=now();try{const r=db.prepare('INSERT INTO delivery_regions(name,fee,minimum,active,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(safeText(b.name,120),Number(b.fee||0),Number(b.minimum||0),b.active===false?0:1,t,t);bumpVersion();audit(user.id,'create','region',r.lastInsertRowid,b.name);return sendJson(res,201,{ok:true,region:publicRegion(db.prepare('SELECT * FROM delivery_regions WHERE id=?').get(Number(r.lastInsertRowid)))});}catch(e){return sendJson(res,409,{ok:false,error:'Já existe uma região com esse nome.'});}
    }
    const regionMatch=pathname.match(/^\/api\/admin\/regions\/(\d+)$/);
    if(regionMatch&&method==='PUT'){
      if((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager)return sendJson(res,403,{ok:false,error:'Sem permissão.'});const id=Number(regionMatch[1]),b=await readJson(req),c=db.prepare('SELECT * FROM delivery_regions WHERE id=?').get(id);if(!c)return sendJson(res,404,{ok:false,error:'Região não encontrada.'});db.prepare('UPDATE delivery_regions SET name=?,fee=?,minimum=?,active=?,updated_at=? WHERE id=?').run(safeText(b.name??c.name,120),Number(b.fee??c.fee),Number(b.minimum??c.minimum),b.active===undefined?c.active:boolInt(b.active),now(),id);bumpVersion();audit(user.id,'update','region',id,c.name);return sendJson(res,200,{ok:true});
    }
    if(regionMatch&&method==='DELETE'){if((ROLE_LEVEL[user.role]||0)<ROLE_LEVEL.manager)return sendJson(res,403,{ok:false,error:'Sem permissão.'});const id=Number(regionMatch[1]);db.prepare('UPDATE delivery_regions SET active=0,updated_at=? WHERE id=?').run(now(),id);bumpVersion();audit(user.id,'deactivate','region',id);return sendJson(res,200,{ok:true});}

    if(method==='GET'&&pathname==='/api/admin/orders'){
      const status=safeText(url.searchParams.get('status')||'',40);const q=safeText(url.searchParams.get('q')||'',120);let sql='SELECT id,customer_name,phone,total,status,created_at,updated_at,method,region_name FROM orders WHERE 1=1';const params=[];if(status&&status!=='todos'){sql+=' AND status=?';params.push(status);}if(q){sql+=' AND (id LIKE ? OR customer_name LIKE ? OR phone LIKE ?)';params.push(`%${q}%`,`%${q}%`,`%${q}%`);}sql+=' ORDER BY created_at DESC LIMIT 500';const list=db.prepare(sql).all(...params).map(r=>({id:r.id,customer:r.customer_name,phone:r.phone,total:Number(r.total),status:r.status,createdAt:r.created_at,updatedAt:r.updated_at,method:r.method,regionName:r.region_name}));return sendJson(res,200,{ok:true,orders:list});
    }
    const orderMatch=pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
    if(orderMatch&&method==='GET'){const o=getOrder(decodeURIComponent(orderMatch[1]),{includePrivate:true});if(!o)return sendJson(res,404,{ok:false,error:'Pedido não encontrado.'});return sendJson(res,200,{ok:true,order:o});}
    const orderStatusMatch=pathname.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
    if(orderStatusMatch&&method==='PUT'){const b=await readJson(req);const o=updateOrderStatus(decodeURIComponent(orderStatusMatch[1]),safeText(b.status,40),safeText(b.note,500),user);return sendJson(res,200,{ok:true,order:o});}

    if(method==='GET'&&pathname==='/api/admin/settings')return sendJson(res,200,{ok:true,settings:getSettingsObject()});
    if(method==='PUT'&&pathname==='/api/admin/settings'){
      if(user.role!=='admin')return sendJson(res,403,{ok:false,error:'Apenas administrador pode alterar configurações gerais.'});const b=await readJson(req);const allowed=['storeName','whatsapp','cartGoal','minimumOrder','primaryMessage','openingHours','address','allowDelivery','allowPickup','storeEmail','freeDeliveryThreshold','defaultSubstitution','pwaName'];const current=getSettingsObject();for(const key of allowed)if(Object.prototype.hasOwnProperty.call(b,key))current[key]=b[key];setSettingsObject(current);audit(user.id,'update','settings','store');return sendJson(res,200,{ok:true,settings:current});
    }

    if(method==='GET'&&pathname==='/api/admin/users'){
      if(user.role!=='admin')return sendJson(res,403,{ok:false,error:'Apenas administrador.'});const users=db.prepare('SELECT id,name,username,role,active,created_at,updated_at FROM users ORDER BY name').all().map(u=>({id:Number(u.id),name:u.name,username:u.username,role:u.role,active:Boolean(u.active),createdAt:u.created_at,updatedAt:u.updated_at}));return sendJson(res,200,{ok:true,users});
    }
    if(method==='POST'&&pathname==='/api/admin/users'){
      if(user.role!=='admin')return sendJson(res,403,{ok:false,error:'Apenas administrador.'});const b=await readJson(req),password=String(b.password||'');if(password.length<8)return sendJson(res,400,{ok:false,error:'Senha deve ter pelo menos 8 caracteres.'});const role=['admin','manager','attendant'].includes(b.role)?b.role:'attendant';const {salt,hash}=hashPassword(password);const t=now();try{const r=db.prepare('INSERT INTO users(name,username,password_hash,password_salt,role,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(safeText(b.name,120),safeText(b.username,80),hash,salt,role,b.active===false?0:1,t,t);audit(user.id,'create','user',r.lastInsertRowid,b.username);return sendJson(res,201,{ok:true,id:Number(r.lastInsertRowid)});}catch(e){return sendJson(res,409,{ok:false,error:'Esse nome de usuário já existe.'});}
    }
    const userMatch=pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if(userMatch&&method==='PUT'){
      if(user.role!=='admin')return sendJson(res,403,{ok:false,error:'Apenas administrador.'});const id=Number(userMatch[1]),b=await readJson(req),c=db.prepare('SELECT * FROM users WHERE id=?').get(id);if(!c)return sendJson(res,404,{ok:false,error:'Usuário não encontrado.'});const role=['admin','manager','attendant'].includes(b.role)?b.role:c.role;db.prepare('UPDATE users SET name=?,username=?,role=?,active=?,updated_at=? WHERE id=?').run(safeText(b.name??c.name,120),safeText(b.username??c.username,80),role,b.active===undefined?c.active:boolInt(b.active),now(),id);if(b.password){const p=String(b.password);if(p.length<8)return sendJson(res,400,{ok:false,error:'Senha deve ter pelo menos 8 caracteres.'});const {salt,hash}=hashPassword(p);db.prepare('UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=?').run(hash,salt,now(),id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);}audit(user.id,'update','user',id,c.username);return sendJson(res,200,{ok:true});
    }
    if(userMatch&&method==='DELETE'){
      if(user.role!=='admin')return sendJson(res,403,{ok:false,error:'Apenas administrador.'});const id=Number(userMatch[1]);if(id===user.id)return sendJson(res,400,{ok:false,error:'Você não pode desativar seu próprio usuário.'});db.prepare('UPDATE users SET active=0,updated_at=? WHERE id=?').run(now(),id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);audit(user.id,'deactivate','user',id);return sendJson(res,200,{ok:true});
    }

    if(method==='GET'&&pathname==='/api/admin/audit'){
      const rows=db.prepare(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.details,a.created_at,u.name user_name,u.username
                             FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 300`).all().map(r=>({id:Number(r.id),action:r.action,entityType:r.entity_type,entityId:r.entity_id,details:r.details,createdAt:r.created_at,userName:r.user_name||'Sistema',username:r.username||''}));return sendJson(res,200,{ok:true,logs:rows});
    }

    if(method==='GET'&&pathname==='/api/admin/export'){
      if(user.role!=='admin')return sendJson(res,403,{ok:false,error:'Apenas administrador.'});const data={exportedAt:now(),bootstrap:getBootstrap({admin:true}),users:db.prepare('SELECT id,name,username,role,active,created_at,updated_at FROM users').all(),orders:db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all(),orderItems:db.prepare('SELECT * FROM order_items').all(),orderEvents:db.prepare('SELECT * FROM order_events').all(),customers:db.prepare('SELECT * FROM customers ORDER BY updated_at DESC').all(),audit:db.prepare('SELECT * FROM audit_log ORDER BY id DESC').all()};audit(user.id,'export','database','full');return sendJson(res,200,{ok:true,data});
    }
  }

  return sendJson(res, 404, { ok:false, error:'Endpoint não encontrado.' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Cabeçalhos básicos de segurança para a demonstração.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');

  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error('[SC CENTRAL V6]', error);
    if (!res.headersSent) sendJson(res, error.statusCode || 500, { ok:false, error:error.message || 'Erro interno do servidor.' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║        SUPERMERCADO SC CENTRAL • V6 FINAL          ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`Loja:   http://localhost:${PORT}/`);
  console.log(`Painel: http://localhost:${PORT}/login.html`);
  console.log(`Banco:  ${DB_PATH}`);
  console.log('');
  console.log('Primeiro acesso padrão: admin / TroqueAgora@123');
  console.log('Altere a senha imediatamente no painel antes de publicar.');
  console.log('');
});
