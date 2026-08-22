const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const {
  hashPassword, verifyPassword, randomToken, hashToken,
  parseCookies, sessionCookie, clearSessionCookie, safeText
} = require('./src/security');

const integrations = require('./src/integrations');
const supabase = require('./src/supabase');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const IS_SECURE = process.env.SC_HTTPS === '1' || Boolean(process.env.RAILWAY_ENVIRONMENT);
const SESSION_HOURS = Number(process.env.SC_SESSION_HOURS || 8);
const JSON_LIMIT = 3 * 1024 * 1024;

const ROLE_LEVEL = { attendant: 1, manager: 2, admin: 3 };
const ORDER_STATUSES = [
  'novo','confirmado','separando','pronto',
  'saiu_entrega','concluido','cancelado'
];

const RATE_BUCKETS = new Map();

function now() {
  return new Date().toISOString();
}

function rateLimit(req, key, limit, windowMs) {
  const ip = req.socket.remoteAddress || 'unknown';
  const bucketKey = `${key}:${ip}`;
  const current = Date.now();
  let bucket = RATE_BUCKETS.get(bucketKey);

  if (!bucket || current - bucket.startedAt > windowMs) {
    bucket = { startedAt: current, count: 0 };
  }

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
        reject(Object.assign(
          new Error('Payload muito grande.'),
          { statusCode: 413 }
        ));
        req.destroy();
        return;
      }

      data += chunk;
    });

    req.on('end', () => {
      if (!data) return resolve({});

      try { resolve(JSON.parse(data)); }
      catch {
        reject(Object.assign(
          new Error('JSON inválido.'),
          { statusCode: 400 }
        ));
      }
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
    unit: row.unit || '',
    saleMode: row.sale_mode || 'unit',
    measureUnit: row.measure_unit || 'un',
    quantityStep: Number(row.quantity_step || 1),
    minQuantity: Number(row.min_quantity || 1),
    price: Number(row.price || 0),
    oldPrice: row.old_price === null || row.old_price === undefined
      ? null
      : Number(row.old_price),
    promoStart,
    promoEnd,
    promotionActive: Boolean(
      row.old_price !== null &&
      row.old_price !== undefined &&
      afterStart &&
      beforeEnd
    ),
    badge: row.badge || '',
    emoji: row.emoji || '🛒',
    stock: Number(row.stock || 0),
    featured: Boolean(row.featured),
    image: row.image || '',
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order || 0)
  };
}

function publicCategory(row) {
  return {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    description: row.description,
    image: row.image,
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order || 0)
  };
}

function publicBanner(row) {
  return {
    id: Number(row.id),
    eyebrow: row.eyebrow,
    title: row.title,
    text: row.text,
    button: row.button,
    target: row.target,
    icon: row.icon,
    image: row.image,
    theme: row.theme,
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order || 0)
  };
}

function publicCoupon(row) {
  return {
    type: row.type,
    value: Number(row.value || 0),
    label: row.label,
    minimumOrder: Number(row.minimum_order || 0),
    active: Boolean(row.active)
  };
}

function publicRegion(row) {
  return {
    id: Number(row.id),
    name: row.name,
    fee: Number(row.fee || 0),
    minimum: Number(row.minimum || 0),
    active: Boolean(row.active)
  };
}

async function getChangeVersion() {
  const row = await supabase.one('app_meta', {
    select: 'value',
    key: 'eq.change_version'
  });

  return Number(row?.value || 1);
}

async function getSettingsObject() {
  const rows = await supabase.select('settings', {
    select: 'key,value',
    order: 'key.asc'
  });

  const out = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

async function setSettingsObject(values) {
  const rows = Object.entries(values).map(([key, value]) => ({ key, value }));
  if (!rows.length) return;

  await supabase.insert('settings', rows, {
    onConflict: 'key',
    upsert: true
  });
}

async function getBootstrap({ admin = false } = {}) {
  const [
    settings,
    products,
    banners,
    couponRows,
    regionRows,
    categories,
    version
  ] = await Promise.all([
    getSettingsObject(),
    supabase.select('products', {
      select: '*',
      ...(admin ? {} : { active: 'eq.true' }),
      order: admin
        ? 'sort_order.asc,id.asc'
        : 'featured.desc,sort_order.asc,id.asc'
    }),
    supabase.select('banners', {
      select: '*',
      ...(admin ? {} : { active: 'eq.true' }),
      order: 'sort_order.asc,id.asc'
    }),
    supabase.select('coupons', {
      select: '*',
      ...(admin ? {} : { active: 'eq.true' }),
      order: 'code.asc'
    }),
    supabase.select('delivery_regions', {
      select: '*',
      ...(admin ? {} : { active: 'eq.true' }),
      order: 'name.asc'
    }),
    supabase.select('categories', {
      select: '*',
      ...(admin ? {} : { active: 'eq.true' }),
      order: 'sort_order.asc,name.asc'
    }),
    getChangeVersion()
  ]);

  const coupons = {};
  for (const row of couponRows) coupons[row.code] = publicCoupon(row);

  return {
    version,
    settings,
    products: products.map(publicProduct),
    banners: banners.map(publicBanner),
    coupons,
    neighborhoods: regionRows.map(publicRegion),
    categories: categories.map(publicCategory)
  };
}

async function cleanupSessions() {
  await supabase.remove('sessions', {
    expires_at: `lte.${now()}`
  });
}

async function currentUser(req) {
  await cleanupSessions();

  const token = parseCookies(req).sc_session;
  if (!token) return null;

  const session = await supabase.one('sessions', {
    select: 'user_id,expires_at',
    token_hash: `eq.${hashToken(token)}`
  });

  if (!session || session.expires_at <= now()) return null;

  const user = await supabase.one('users', {
    select: 'id,name,username,role,active',
    id: `eq.${session.user_id}`
  });

  if (!user || !user.active) return null;

  return {
    id: Number(user.id),
    name: user.name,
    username: user.username,
    role: user.role
  };
}

async function requireAuth(req, res, minRole = 'attendant') {
  const user = await currentUser(req);

  if (!user) {
    sendJson(res, 401, {
      ok: false,
      error: 'Sessão inválida ou expirada.'
    });
    return null;
  }

  if ((ROLE_LEVEL[user.role] || 0) < (ROLE_LEVEL[minRole] || 1)) {
    sendJson(res, 403, {
      ok: false,
      error: 'Você não possui permissão para esta ação.'
    });
    return null;
  }

  return user;
}

async function audit(userId, action, entityType, entityId = '', details = '') {
  await supabase.insert('audit_log', {
    user_id: userId || null,
    action: safeText(action, 80),
    entity_type: safeText(entityType, 80),
    entity_id: safeText(entityId, 120),
    details: safeText(details, 2000)
  });
}

async function ensureFirstAdmin() {
  if (!supabase.configured()) return;

  const existing = await supabase.one('users', {
    select: 'id',
    limit: 1
  });

  if (existing) return;

  const username = safeText(process.env.SC_ADMIN_USER || 'admin', 80);
  const password = String(process.env.SC_ADMIN_PASSWORD || '');

  if (password.length < 8) {
    console.warn(
      '[SC Central] Nenhum usuário administrativo existe no Supabase. ' +
      'Defina SC_ADMIN_PASSWORD com pelo menos 8 caracteres no Railway.'
    );
    return;
  }

  const { salt, hash } = hashPassword(password);

  await supabase.insert('users', {
    name: 'Administrador',
    username,
    password_hash: hash,
    password_salt: salt,
    role: 'admin',
    active: true
  });

  console.log('[SC Central] Primeiro administrador criado no Supabase.');
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 15);
}

function roundMoney(value) {
  return Math.round(
    (Number(value || 0) + Number.EPSILON) * 100
  ) / 100;
}

function normalizeQuantity(product, rawQty) {
  const saleMode = product.sale_mode || 'unit';
  const step = Math.max(
    0.001,
    Number(product.quantity_step || (saleMode === 'weight' ? 0.1 : 1))
  );
  const min = Math.max(
    step,
    Number(product.min_quantity || step)
  );
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
  const text = Number.isInteger(value)
    ? String(value)
    : value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

  return `${text}${unit && unit !== 'un' ? ` ${unit}` : ' un.'}`;
}

async function orderId() {
  const d = new Date();
  const date = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('');

  for (let i = 0; i < 10; i++) {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const id = `SC-${date}-${suffix}`;

    const existing = await supabase.one('orders', {
      select: 'id',
      id: `eq.${id}`
    });

    if (!existing) return id;
  }

  return `SC-${date}-${Date.now().toString().slice(-6)}`;
}

async function calculateOrder(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!items.length) {
    throw Object.assign(new Error('Carrinho vazio.'), { statusCode: 400 });
  }

  if (items.length > 100) {
    throw Object.assign(
      new Error('Quantidade de itens acima do limite.'),
      { statusCode: 400 }
    );
  }

  const ids = [...new Set(
    items
      .map(raw => Number(raw.productId ?? raw.id))
      .filter(Number.isFinite)
  )];

  const productRows = ids.length
    ? await supabase.select('products', {
        select: '*',
        id: `in.(${ids.join(',')})`,
        active: 'eq.true'
      })
    : [];

  const productMap = new Map(
    productRows.map(product => [Number(product.id), product])
  );

  const canonicalItems = [];
  let subtotal = 0;

  for (const raw of items) {
    const id = Number(raw.productId ?? raw.id);
    const product = productMap.get(id);

    if (!product) {
      throw Object.assign(
        new Error(`Produto ${id} não está disponível.`),
        { statusCode: 409 }
      );
    }

    const qty = normalizeQuantity(product, raw.quantity ?? raw.qty);

    if (Number(product.stock) + 1e-9 < qty) {
      throw Object.assign(
        new Error(
          `Estoque insuficiente para ${product.name}. ` +
          `Disponível: ${formatQty(product.stock, product.measure_unit)}.`
        ),
        { statusCode: 409 }
      );
    }

    const line = roundMoney(Number(product.price) * qty);
    subtotal = roundMoney(subtotal + line);

    canonicalItems.push({
      productId: Number(product.id),
      name: product.name,
      unit: product.unit,
      saleMode: product.sale_mode || 'unit',
      measureUnit: product.measure_unit || 'un',
      price: Number(product.price),
      qty,
      lineTotal: line,
      substitution: safeText(
        raw.substitution ||
        payload.substitutionPreference ||
        'contact',
        40
      ),
      itemNote: safeText(raw.note || '', 300)
    });
  }

  let discount = 0;
  const couponCode = safeText(
    payload.couponCode || '',
    40
  ).toUpperCase();

  if (couponCode) {
    const coupon = await supabase.one('coupons', {
      select: '*',
      code: `eq.${couponCode}`,
      active: 'eq.true'
    });

    if (!coupon) {
      throw Object.assign(
        new Error('Cupom inválido ou inativo.'),
        { statusCode: 400 }
      );
    }

    if (subtotal < Number(coupon.minimum_order || 0)) {
      throw Object.assign(
        new Error(
          `Esse cupom exige pedido mínimo de R$ ` +
          `${Number(coupon.minimum_order).toFixed(2)}.`
        ),
        { statusCode: 400 }
      );
    }

    discount = coupon.type === 'percent'
      ? subtotal * (Number(coupon.value) / 100)
      : Number(coupon.value);

    discount = roundMoney(
      Math.min(subtotal, Math.max(0, discount))
    );
  }

  const method = safeText(
    payload.deliveryMethod || payload.method || 'Entrega',
    40
  );

  let region = null;
  let deliveryFee = 0;
  const settings = await getSettingsObject();
  let minimum = Number(settings.minimumOrder || 0);

  if (method === 'Entrega') {
    const regionId = Number(payload.regionId || 0);
    const regionName = safeText(
      payload.regionName || payload.neighborhood || '',
      120
    );

    region = regionId
      ? await supabase.one('delivery_regions', {
          select: '*',
          id: `eq.${regionId}`,
          active: 'eq.true'
        })
      : await supabase.one('delivery_regions', {
          select: '*',
          name: `eq.${regionName}`,
          active: 'eq.true'
        });

    if (!region) {
      throw Object.assign(
        new Error('Selecione uma região de entrega válida.'),
        { statusCode: 400 }
      );
    }

    deliveryFee = roundMoney(region.fee || 0);

    const freeThreshold = Number(
      settings.freeDeliveryThreshold || 0
    );

    if (
      freeThreshold > 0 &&
      (subtotal - discount) >= freeThreshold
    ) {
      deliveryFee = 0;
    }

    minimum = Number(region.minimum || minimum);

    if ((subtotal - discount) < minimum) {
      throw Object.assign(
        new Error(
          `Pedido mínimo para ${region.name}: ` +
          `R$ ${minimum.toFixed(2)}.`
        ),
        { statusCode: 400 }
      );
    }
  }

  return {
    canonicalItems,
    subtotal,
    discount,
    deliveryFee,
    total: roundMoney(subtotal - discount + deliveryFee),
    couponCode,
    method,
    region,
    minimum
  };
}

async function createOrder(payload) {
  const customerName = safeText(
    payload.customer?.name || payload.customerName || '',
    120
  );

  const phone = normalizePhone(
    payload.customer?.phone || payload.phone || ''
  );

  if (!customerName) {
    throw Object.assign(
      new Error('Informe o nome do cliente.'),
      { statusCode: 400 }
    );
  }

  if (phone.length < 10) {
    throw Object.assign(
      new Error('Informe um telefone válido.'),
      { statusCode: 400 }
    );
  }

  const calc = await calculateOrder(payload);
  const id = await orderId();

  const rpcPayload = {
    id,
    customerName,
    phone,
    method: calc.method,
    regionId: calc.region ? Number(calc.region.id) : null,
    regionName: calc.region
      ? calc.region.name
      : 'Retirada na loja',
    address: safeText(payload.address || '', 250),
    reference: safeText(payload.reference || '', 180),
    deliveryTime: safeText(payload.deliveryTime || '', 80),
    payment: safeText(
      payload.paymentMethod || payload.payment || 'A combinar',
      80
    ),
    changeFor: safeText(payload.changeFor || '', 80),
    notes: safeText(payload.notes || '', 1000),
    couponCode: calc.couponCode,
    subtotal: calc.subtotal,
    discount: calc.discount,
    deliveryFee: calc.deliveryFee,
    total: calc.total,
    substitutionPreference: safeText(
      payload.substitutionPreference || 'contact',
      40
    ),
    items: calc.canonicalItems
  };

  try {
    await supabase.rpc('sc_commit_order', {
      p_order: rpcPayload
    });
  } catch (error) {
    if (
      /function .*sc_commit_order.*does not exist/i.test(error.message) ||
      /Could not find the function/i.test(error.message)
    ) {
      error.message =
        'A função transacional sc_commit_order ainda não foi instalada no Supabase. ' +
        'Execute SUPABASE_RPC_PEDIDOS.sql no SQL Editor.';
      error.statusCode = 503;
    }
    throw error;
  }

  const created = await getOrder(id, { includePrivate: true });
  integrations.emitInBackground('order.created', created);
  return created;
}

async function getOrder(id, { includePrivate = false } = {}) {
  const row = await supabase.one('orders', {
    select: '*',
    id: `eq.${id}`
  });

  if (!row) return null;

  const [itemRows, eventRows, userRows] = await Promise.all([
    supabase.select('order_items', {
      select: '*',
      order_id: `eq.${id}`,
      order: 'id.asc'
    }),
    supabase.select('order_events', {
      select: '*',
      order_id: `eq.${id}`,
      order: 'id.asc'
    }),
    supabase.select('users', {
      select: 'id,name'
    })
  ]);

  const userMap = new Map(
    userRows.map(user => [Number(user.id), user.name])
  );

  const items = itemRows.map(item => ({
    productId: item.product_id === null
      ? null
      : Number(item.product_id),
    name: item.name,
    unit: item.unit,
    price: Number(item.price),
    qty: Number(item.qty),
    substitution: item.substitution || '',
    note: item.item_note || ''
  }));

  const events = eventRows.map(event => ({
    status: event.status,
    note: event.note,
    createdAt: event.created_at,
    userName: event.user_id
      ? userMap.get(Number(event.user_id)) || ''
      : ''
  }));

  const base = {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    customer: row.customer_name,
    method: row.method,
    regionName: row.region_name,
    payment: row.payment,
    couponCode: row.coupon_code,
    substitutionPreference:
      row.substitution_preference || 'contact',
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
    status: row.status,
    items,
    events
  };

  if (includePrivate) {
    Object.assign(base, {
      phone: row.phone,
      address: row.address,
      reference: row.reference,
      deliveryTime: row.delivery_time,
      changeFor: row.change_for,
      notes: row.notes,
      regionId: row.region_id === null
        ? null
        : Number(row.region_id)
    });
  }

  return base;
}

async function updateOrderStatus(orderIdValue, newStatus, note, user) {
  if (!ORDER_STATUSES.includes(newStatus)) {
    throw Object.assign(
      new Error('Status inválido.'),
      { statusCode: 400 }
    );
  }

  try {
    await supabase.rpc('sc_update_order_status', {
      p_order_id: orderIdValue,
      p_status: newStatus,
      p_note: safeText(note || '', 500),
      p_user_id: user.id
    });
  } catch (error) {
    if (
      /function .*sc_update_order_status.*does not exist/i.test(error.message) ||
      /Could not find the function/i.test(error.message)
    ) {
      error.message =
        'A função transacional sc_update_order_status ainda não foi instalada no Supabase. ' +
        'Execute SUPABASE_RPC_PEDIDOS.sql no SQL Editor.';
      error.statusCode = 503;
    }
    throw error;
  }

  const updated = await getOrder(
    orderIdValue,
    { includePrivate: true }
  );

  integrations.emitInBackground(
    'order.status_changed',
    updated
  );

  return updated;
}

function statusLabel(status) {
  return ({
    novo: 'Novo pedido',
    confirmado: 'Confirmado',
    separando: 'Em separação',
    pronto: 'Pronto',
    saiu_entrega: 'Saiu para entrega',
    concluido: 'Concluído',
    cancelado: 'Cancelado'
  })[status] || status;
}

function whatsappMessage(order, settings) {
  const money = value => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));

  const qtyText = item => {
    const q = Number(item.qty);
    const txt = Number.isInteger(q)
      ? String(q)
      : q.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

    const unit = (item.unit || '')
      .toLowerCase()
      .includes('preço por kg')
      ? 'kg'
      : '';

    return unit ? `${txt} ${unit}` : `${txt}x`;
  };

  const substitutionLabel = {
    none: 'Não substituir',
    equivalent: 'Pode substituir por equivalente',
    contact: 'Entrar em contato antes de substituir'
  };

  const lines = order.items.map(
    (item, index) =>
      `${index + 1}. ${qtyText(item)} ${item.name} ` +
      `(${item.unit}) — ${money(item.price * item.qty)}`
  );

  return [
    `Olá! Gostaria de finalizar o pedido *${order.id}* no ` +
      `*${settings.storeName || 'Supermercado SC Central'}*.`,
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '🛒 *PRODUTOS*',
    '━━━━━━━━━━━━━━━━━━━━',
    ...lines,
    '',
    `📋 *Produtos diferentes:* ${order.items.length}`,
    `💲 *Subtotal:* ${money(order.subtotal)}`,
    order.discount > 0
      ? `✅ *Desconto:* - ${money(order.discount)}`
      : '',
    order.couponCode
      ? `🏷️ *Cupom:* ${order.couponCode}`
      : '🏷️ *Cupom:* nenhum',
    `🚚 *Taxa estimada:* ${money(order.deliveryFee)}`,
    `💰 *TOTAL ESTIMADO: ${money(order.total)}*`,
    '',
    `🔁 *Substituição:* ${
      substitutionLabel[order.substitutionPreference] ||
      order.substitutionPreference ||
      'Entrar em contato'
    }`,
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '📌 *DADOS DO CLIENTE*',
    '━━━━━━━━━━━━━━━━━━━━',
    `👤 *Cliente:* ${order.customer}`,
    `📞 *Telefone:* ${order.phone}`,
    `📦 *Recebimento:* ${order.method}`,
    order.method === 'Entrega'
      ? `🏘️ *Região:* ${order.regionName}`
      : '',
    order.method === 'Entrega'
      ? `📍 *Endereço:* ${order.address || '-'}`
      : '',
    order.method === 'Entrega'
      ? `🧭 *Referência:* ${order.reference || '-'}`
      : '',
    order.method === 'Entrega'
      ? `🕐 *Horário:* ${order.deliveryTime || 'O quanto antes'}`
      : '',
    `💳 *Pagamento:* ${order.payment || 'A combinar'}`,
    order.payment === 'Dinheiro' && order.changeFor
      ? `💵 *Troco para:* ${order.changeFor}`
      : '',
    order.notes
      ? `📝 *Observações:* ${order.notes}`
      : '',
    '',
    `📌 *Status inicial:* ${statusLabel(order.status)}`,
    'Por favor, confirme estoque, pesagem quando aplicável, ' +
      'valores e disponibilidade da entrega.'
  ].filter(Boolean).join('\n');
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
  })[ext] || 'application/octet-stream';
}

function serveStatic(req, res, pathname) {
  let relative = pathname === '/'
    ? 'index.html'
    : pathname.replace(/^\/+/, '');

  try {
    relative = decodeURIComponent(relative);
  } catch {
    return sendText(res, 400, 'Caminho inválido.');
  }

  const filePath = path.resolve(PUBLIC, relative);
  const baseResolved = path.resolve(PUBLIC);

  if (
    !filePath.startsWith(baseResolved + path.sep) &&
    filePath !== baseResolved
  ) {
    return sendText(res, 403, 'Acesso negado.');
  }

  if (
    !fs.existsSync(filePath) ||
    !fs.statSync(filePath).isFile()
  ) {
    return sendText(res, 404, 'Arquivo não encontrado.');
  }

  const stat = fs.statSync(filePath);

  res.writeHead(200, {
    'Content-Type': mimeFor(filePath),
    'Content-Length': stat.size,
    'Cache-Control':
      path.extname(filePath) === '.html'
        ? 'no-cache'
        : 'public, max-age=3600'
  });

  fs.createReadStream(filePath).pipe(res);
}

function supabaseStorageStatus(connection) {
  return {
    platform: 'supabase',
    provider: 'PostgreSQL',
    projectRef: supabase.PROJECT_REF,
    mode: 'remote-postgresql',
    persistent: true,
    writable: Boolean(connection?.ok),
    volumeMounted: false
  };
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const method = req.method || 'GET';

  if (method === 'GET' && pathname === '/api/health') {
    const connection = await supabase.testConnection();

    return sendJson(res, connection.ok ? 200 : 503, {
      ok: connection.ok,
      database: 'PostgreSQL (Supabase)',
      databaseProvider: 'Supabase',
      projectRef: connection.projectRef,
      changeVersion: connection.ok
        ? await getChangeVersion()
        : 0,
      integrationWebhook: integrations.enabled(),
      storage: supabaseStorageStatus(connection),
      error: connection.ok ? undefined : connection.error,
      time: now()
    });
  }

  if (!supabase.configured()) {
    return sendJson(res, 503, {
      ok: false,
      code: 'SUPABASE_SERVER_KEY_MISSING',
      error:
        'O backend ainda não possui a credencial privada do Supabase. ' +
        'Configure SUPABASE_SECRET_KEY nas Variables do Railway (ou SUPABASE_SERVICE_ROLE_KEY se usar a chave legada).'
    });
  }

  if (method === 'GET' && pathname === '/api/bootstrap') {
    return sendJson(res, 200, {
      ok: true,
      ...await getBootstrap()
    });
  }

  if (method === 'GET' && pathname === '/api/version') {
    return sendJson(res, 200, {
      ok: true,
      version: await getChangeVersion()
    });
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    if (!rateLimit(req, 'login', 12, 10 * 60 * 1000)) {
      return sendJson(res, 429, {
        ok: false,
        error:
          'Muitas tentativas de login. Aguarde alguns minutos.'
      });
    }

    const body = await readJson(req);
    const username = safeText(body.username || '', 80);
    const password = String(body.password || '');

    const user = await supabase.one('users', {
      select: '*',
      username: `eq.${username}`
    });

    if (
      !user ||
      !user.active ||
      !verifyPassword(
        password,
        user.password_salt,
        user.password_hash
      )
    ) {
      return sendJson(res, 401, {
        ok: false,
        error: 'Usuário ou senha inválidos.'
      });
    }

    const token = randomToken();
    const expiresAt = new Date(
      Date.now() + SESSION_HOURS * 3600 * 1000
    ).toISOString();

    await supabase.insert('sessions', {
      token_hash: hashToken(token),
      user_id: user.id,
      expires_at: expiresAt
    });

    await audit(
      user.id,
      'login',
      'session',
      '',
      req.socket.remoteAddress || ''
    );

    return sendJson(
      res,
      200,
      {
        ok: true,
        user: {
          id: Number(user.id),
          name: user.name,
          username: user.username,
          role: user.role
        }
      },
      {
        'Set-Cookie': sessionCookie(token, {
          secure: IS_SECURE,
          maxAge: SESSION_HOURS * 3600
        })
      }
    );
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    const token = parseCookies(req).sc_session;
    const user = await currentUser(req);

    if (token) {
      await supabase.remove('sessions', {
        token_hash: `eq.${hashToken(token)}`
      });
    }

    if (user) {
      await audit(user.id, 'logout', 'session');
    }

    return sendJson(
      res,
      200,
      { ok: true },
      {
        'Set-Cookie': clearSessionCookie({
          secure: IS_SECURE
        })
      }
    );
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    const user = await currentUser(req);

    if (!user) {
      return sendJson(res, 401, {
        ok: false,
        error: 'Não autenticado.'
      });
    }

    return sendJson(res, 200, { ok: true, user });
  }

  if (
    method === 'POST' &&
    pathname === '/api/auth/change-password'
  ) {
    const user = await requireAuth(
      req,
      res,
      'attendant'
    );
    if (!user) return;

    const body = await readJson(req);
    const row = await supabase.one('users', {
      select: '*',
      id: `eq.${user.id}`
    });

    if (
      !verifyPassword(
        String(body.currentPassword || ''),
        row.password_salt,
        row.password_hash
      )
    ) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Senha atual incorreta.'
      });
    }

    const next = String(body.newPassword || '');

    if (next.length < 8) {
      return sendJson(res, 400, {
        ok: false,
        error:
          'A nova senha deve ter pelo menos 8 caracteres.'
      });
    }

    const { salt, hash } = hashPassword(next);

    await supabase.update(
      'users',
      {
        password_hash: hash,
        password_salt: salt
      },
      { id: `eq.${user.id}` }
    );

    await supabase.remove('sessions', {
      user_id: `eq.${user.id}`
    });

    await audit(
      user.id,
      'change_password',
      'user',
      user.id
    );

    return sendJson(
      res,
      200,
      { ok: true },
      {
        'Set-Cookie': clearSessionCookie({
          secure: IS_SECURE
        })
      }
    );
  }

  if (method === 'POST' && pathname === '/api/orders') {
    if (!rateLimit(req, 'order', 30, 10 * 60 * 1000)) {
      return sendJson(res, 429, {
        ok: false,
        error:
          'Muitos pedidos em pouco tempo. Aguarde alguns minutos.'
      });
    }

    const settings = await getSettingsObject();
    const storeWhatsapp = safeText(
      settings.whatsapp || '',
      30
    ).replace(/\D/g, '');

    if (!/^\d{12,13}$/.test(storeWhatsapp)) {
      return sendJson(res, 409, {
        ok: false,
        error:
          'O WhatsApp da loja ainda não foi configurado no painel.'
      });
    }

    const body = await readJson(req);
    const created = await createOrder(body);

    return sendJson(res, 201, {
      ok: true,
      order: created,
      whatsapp: storeWhatsapp,
      whatsappMessage: whatsappMessage(created, settings)
    });
  }

  if (
    method === 'GET' &&
    pathname === '/api/orders/track'
  ) {
    const id = safeText(
      url.searchParams.get('order') || '',
      40
    ).toUpperCase();

    const phone = normalizePhone(
      url.searchParams.get('phone') || ''
    );

    if (!id || phone.length < 4) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Informe o pedido e o telefone.'
      });
    }

    const row = await supabase.one('orders', {
      select: 'id,phone',
      id: `eq.${id}`
    });

    if (
      !row ||
      !String(row.phone).endsWith(phone.slice(-4))
    ) {
      return sendJson(res, 404, {
        ok: false,
        error:
          'Pedido não encontrado para os dados informados.'
      });
    }

    return sendJson(res, 200, {
      ok: true,
      order: await getOrder(
        id,
        { includePrivate: false }
      )
    });
  }

  if (pathname.startsWith('/api/admin/')) {
    const minRole =
      pathname.startsWith('/api/admin/users') ||
      pathname === '/api/admin/settings'
        ? 'admin'
        : 'attendant';

    const user = await requireAuth(
      req,
      res,
      minRole
    );

    if (!user) return;

    if (
      method === 'GET' &&
      pathname === '/api/admin/bootstrap'
    ) {
      const connection = await supabase.testConnection();

      return sendJson(res, 200, {
        ok: true,
        ...await getBootstrap({ admin: true }),
        user,
        storage: supabaseStorageStatus(connection)
      });
    }

    if (
      method === 'GET' &&
      pathname === '/api/admin/storage'
    ) {
      if (user.role !== 'admin') {
        return sendJson(res, 403, {
          ok: false,
          error:
            'Apenas administrador pode consultar o armazenamento.'
        });
      }

      const connection = await supabase.testConnection();

      return sendJson(res, 200, {
        ok: true,
        storage: {
          ...supabaseStorageStatus(connection),
          database: 'PostgreSQL',
          projectUrl: supabase.SUPABASE_URL
        }
      });
    }

    if (
      method === 'POST' &&
      pathname === '/api/admin/storage/checkpoint'
    ) {
      if (user.role !== 'admin') {
        return sendJson(res, 403, {
          ok: false,
          error: 'Apenas administrador.'
        });
      }

      return sendJson(res, 200, {
        ok: true,
        checkpoint: null,
        message:
          'Checkpoint manual não é necessário no PostgreSQL gerenciado pelo Supabase.',
        storage: supabaseStorageStatus(
          await supabase.testConnection()
        )
      });
    }

    if (
      method === 'GET' &&
      pathname === '/api/admin/dashboard'
    ) {
      const [products, orders] = await Promise.all([
        supabase.select('products', {
          select: 'id,category,stock,active'
        }),
        supabase.select('orders', {
          select:
            'id,customer_name,total,status,created_at,method',
          order: 'created_at.desc'
        })
      ]);

      const activeProducts = products.filter(
        product => product.active
      );

      const inStock = activeProducts.filter(
        product => Number(product.stock) > 0
      ).length;

      const lowStock = activeProducts.filter(
        product =>
          Number(product.stock) > 0 &&
          Number(product.stock) <= 8
      ).length;

      const openOrders = orders.filter(
        order =>
          !['concluido','cancelado'].includes(order.status)
      ).length;

      const sales = orders.reduce(
        (sum, order) => sum + Number(order.total || 0),
        0
      );

      const statusMap = new Map();
      for (const order of orders) {
        statusMap.set(
          order.status,
          (statusMap.get(order.status) || 0) + 1
        );
      }

      const categoryMap = new Map();
      for (const product of activeProducts) {
        categoryMap.set(
          product.category,
          (categoryMap.get(product.category) || 0) + 1
        );
      }

      const byStatus = [...statusMap.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);

      const categories = [...categoryMap.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      const recentOrders = orders
        .slice(0, 8)
        .map(order => ({
          id: order.id,
          customer_name: order.customer_name,
          total: Number(order.total),
          status: order.status,
          created_at: order.created_at,
          method: order.method
        }));

      return sendJson(res, 200, {
        ok: true,
        stats: {
          products: products.length,
          inStock,
          lowStock,
          orders: orders.length,
          openOrders,
          sales
        },
        byStatus,
        categories,
        recentOrders
      });
    }

    if (
      method === 'GET' &&
      pathname === '/api/admin/products'
    ) {
      const rows = await supabase.select('products', {
        select: '*',
        order: 'id.desc'
      });

      return sendJson(res, 200, {
        ok: true,
        products: rows.map(publicProduct)
      });
    }

    if (
      method === 'POST' &&
      pathname === '/api/admin/products'
    ) {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error:
            'Apenas gerente ou administrador pode cadastrar produtos.'
        });
      }

      const b = await readJson(req);

      const rows = await supabase.insert('products', {
        name: safeText(b.name, 160),
        category: safeText(b.category, 80),
        unit: safeText(b.unit, 80),
        price: Number(b.price || 0),
        old_price:
          b.oldPrice === null || b.oldPrice === ''
            ? null
            : Number(b.oldPrice),
        badge: safeText(b.badge, 60),
        emoji: safeText(b.emoji || '🛒', 16),
        stock: Math.max(0, Number(b.stock || 0)),
        featured: Boolean(b.featured),
        image: safeText(b.image, 1000000),
        active: b.active !== false,
        sku: safeText(b.sku, 80),
        barcode: safeText(b.barcode, 80),
        subcategory: safeText(b.subcategory, 100),
        description: safeText(b.description, 2000),
        sale_mode:
          b.saleMode === 'weight'
            ? 'weight'
            : 'unit',
        measure_unit: safeText(
          b.measureUnit ||
          (b.saleMode === 'weight' ? 'kg' : 'un'),
          20
        ),
        quantity_step: Math.max(
          0.001,
          Number(b.quantityStep || 1)
        ),
        min_quantity: Math.max(
          0.001,
          Number(
            b.minQuantity ||
            b.quantityStep ||
            1
          )
        ),
        promo_start: b.promoStart || null,
        promo_end: b.promoEnd || null,
        sort_order: Number(b.sortOrder || 0)
      });

      const product = rows[0];
      await audit(
        user.id,
        'create',
        'product',
        product.id,
        product.name
      );

      return sendJson(res, 201, {
        ok: true,
        product: publicProduct(product)
      });
    }

    const productMatch = pathname.match(
      /^\/api\/admin\/products\/(\d+)$/
    );

    if (productMatch && method === 'PUT') {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error:
            'Apenas gerente ou administrador pode editar produtos.'
        });
      }

      const id = Number(productMatch[1]);
      const b = await readJson(req);

      const current = await supabase.one('products', {
        select: '*',
        id: `eq.${id}`
      });

      if (!current) {
        return sendJson(res, 404, {
          ok: false,
          error: 'Produto não encontrado.'
        });
      }

      const rows = await supabase.update(
        'products',
        {
          name: safeText(b.name ?? current.name, 160),
          category: safeText(
            b.category ?? current.category,
            80
          ),
          unit: safeText(b.unit ?? current.unit, 80),
          price: Number(b.price ?? current.price),
          old_price:
            b.oldPrice === null || b.oldPrice === ''
              ? null
              : Number(
                  b.oldPrice ?? current.old_price
                ),
          badge: safeText(
            b.badge ?? current.badge,
            60
          ),
          emoji: safeText(
            b.emoji ?? current.emoji,
            16
          ),
          stock: Math.max(
            0,
            Number(b.stock ?? current.stock)
          ),
          featured:
            b.featured === undefined
              ? Boolean(current.featured)
              : Boolean(b.featured),
          image: safeText(
            b.image ?? current.image,
            1000000
          ),
          active:
            b.active === undefined
              ? Boolean(current.active)
              : Boolean(b.active),
          sku: safeText(
            b.sku ?? current.sku,
            80
          ),
          barcode: safeText(
            b.barcode ?? current.barcode,
            80
          ),
          subcategory: safeText(
            b.subcategory ?? current.subcategory,
            100
          ),
          description: safeText(
            b.description ?? current.description,
            2000
          ),
          sale_mode: b.saleMode
            ? (
                b.saleMode === 'weight'
                  ? 'weight'
                  : 'unit'
              )
            : current.sale_mode,
          measure_unit: safeText(
            b.measureUnit ?? current.measure_unit,
            20
          ),
          quantity_step: Math.max(
            0.001,
            Number(
              b.quantityStep ??
              current.quantity_step ??
              1
            )
          ),
          min_quantity: Math.max(
            0.001,
            Number(
              b.minQuantity ??
              current.min_quantity ??
              1
            )
          ),
          promo_start:
            b.promoStart === undefined
              ? current.promo_start
              : (b.promoStart || null),
          promo_end:
            b.promoEnd === undefined
              ? current.promo_end
              : (b.promoEnd || null),
          sort_order: Number(
            b.sortOrder ??
            current.sort_order ??
            0
          )
        },
        { id: `eq.${id}` }
      );

      await audit(
        user.id,
        'update',
        'product',
        id,
        current.name
      );

      return sendJson(res, 200, {
        ok: true,
        product: publicProduct(rows[0])
      });
    }

    if (productMatch && method === 'DELETE') {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error:
            'Apenas gerente ou administrador pode excluir produtos.'
        });
      }

      const id = Number(productMatch[1]);

      const current = await supabase.one('products', {
        select: 'id,name',
        id: `eq.${id}`
      });

      if (!current) {
        return sendJson(res, 404, {
          ok: false,
          error: 'Produto não encontrado.'
        });
      }

      await supabase.update(
        'products',
        { active: false },
        { id: `eq.${id}` }
      );

      await audit(
        user.id,
        'deactivate',
        'product',
        id,
        current.name
      );

      return sendJson(res, 200, { ok: true });
    }

    if (
      method === 'GET' &&
      pathname === '/api/admin/categories'
    ) {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const rows = await supabase.select('categories', {
        select: '*',
        order: 'sort_order.asc,name.asc'
      });

      return sendJson(res, 200, {
        ok: true,
        categories: rows.map(publicCategory)
      });
    }

    if (
      method === 'POST' &&
      pathname === '/api/admin/categories'
    ) {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const b = await readJson(req);
      const name = safeText(b.name, 100);

      let slug = safeText(b.slug, 80)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');

      if (!slug) {
        slug = name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }

      try {
        const rows = await supabase.insert(
          'categories',
          {
            name,
            slug,
            icon: safeText(b.icon || '🛒', 16),
            description: safeText(
              b.description,
              500
            ),
            image: safeText(
              b.image,
              1000000
            ),
            active: b.active !== false,
            sort_order: Number(b.sortOrder || 0)
          }
        );

        await audit(
          user.id,
          'create',
          'category',
          rows[0].id,
          name
        );

        return sendJson(res, 201, {
          ok: true,
          category: publicCategory(rows[0])
        });
      } catch (error) {
        if (error.supabaseStatus === 409) {
          return sendJson(res, 409, {
            ok: false,
            error:
              'Já existe uma categoria com esse identificador.'
          });
        }
        throw error;
      }
    }

    const categoryMatch = pathname.match(
      /^\/api\/admin\/categories\/(\d+)$/
    );

    if (categoryMatch && method === 'PUT') {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const id = Number(categoryMatch[1]);
      const b = await readJson(req);

      const current = await supabase.one(
        'categories',
        {
          select: '*',
          id: `eq.${id}`
        }
      );

      if (!current) {
        return sendJson(res, 404, {
          ok: false,
          error: 'Categoria não encontrada.'
        });
      }

      await supabase.update(
        'categories',
        {
          name: safeText(
            b.name ?? current.name,
            100
          ),
          slug: safeText(
            b.slug ?? current.slug,
            80
          )
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, ''),
          icon: safeText(
            b.icon ?? current.icon,
            16
          ),
          description: safeText(
            b.description ?? current.description,
            500
          ),
          image: safeText(
            b.image ?? current.image,
            1000000
          ),
          active:
            b.active === undefined
              ? Boolean(current.active)
              : Boolean(b.active),
          sort_order: Number(
            b.sortOrder ?? current.sort_order
          )
        },
        { id: `eq.${id}` }
      );

      await audit(
        user.id,
        'update',
        'category',
        id,
        current.name
      );

      return sendJson(res, 200, { ok: true });
    }

    if (categoryMatch && method === 'DELETE') {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const id = Number(categoryMatch[1]);

      await supabase.update(
        'categories',
        { active: false },
        { id: `eq.${id}` }
      );

      await audit(
        user.id,
        'deactivate',
        'category',
        id
      );

      return sendJson(res, 200, { ok: true });
    }

    if (
      method === 'POST' &&
      pathname === '/api/admin/uploads/image'
    ) {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const b = await readJson(req);
      const data = String(b.dataUrl || '');

      const match = data.match(
        /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i
      );

      if (!match) {
        return sendJson(res, 400, {
          ok: false,
          error:
            'Imagem inválida. Use PNG, JPG ou WEBP.'
        });
      }

      const buffer = Buffer.from(match[2], 'base64');

      if (buffer.length > 5 * 1024 * 1024) {
        return sendJson(res, 413, {
          ok: false,
          error:
            'Imagem muito grande. Limite: 5 MB.'
        });
      }

      const ext =
        match[1].toLowerCase() === 'jpeg'
          ? 'jpg'
          : match[1].toLowerCase();

      const filename =
        `produto-${Date.now()}-` +
        `${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const upload = await supabase.uploadProductImage(
        filename,
        buffer,
        ext === 'jpg'
          ? 'image/jpeg'
          : `image/${ext}`
      );

      await audit(
        user.id,
        'create',
        'upload',
        filename
      );

      return sendJson(res, 201, {
        ok: true,
        url: upload.url
      });
    }

    if (
      method === 'POST' &&
      pathname === '/api/admin/products/import'
    ) {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const body = await readJson(req);
      const rows = Array.isArray(body.rows)
        ? body.rows
        : [];

      if (!rows.length) {
        return sendJson(res, 400, {
          ok: false,
          error:
            'Nenhum produto para importar.'
        });
      }

      if (rows.length > 1000) {
        return sendJson(res, 400, {
          ok: false,
          error:
            'Importe no máximo 1000 produtos por vez.'
        });
      }

      let created = 0;
      let updated = 0;

      for (const row of rows) {
        const name = safeText(
          row.name || row.nome,
          160
        );

        if (!name) continue;

        const sku = safeText(row.sku, 80);

        const existing = sku
          ? await supabase.one('products', {
              select: '*',
              sku: `eq.${sku}`
            })
          : null;

        const vals = {
          name,
          category: safeText(
            row.category ||
            row.categoria ||
            'mercearia',
            80
          ),
          subcategory: safeText(
            row.subcategory ||
            row.subcategoria,
            100
          ),
          unit: safeText(
            row.unit ||
            row.unidade ||
            'Unidade',
            80
          ),
          price: Number(
            row.price ??
            row.preco ??
            0
          ),
          stock: Math.max(
            0,
            Number(
              row.stock ??
              row.estoque ??
              0
            )
          ),
          sale_mode:
            String(
              row.saleMode ||
              row.modo ||
              'unit'
            ) === 'weight'
              ? 'weight'
              : 'unit',
          measure_unit: safeText(
            row.measureUnit ||
            row.medida ||
            'un',
            20
          ),
          quantity_step: Math.max(
            0.001,
            Number(
              row.quantityStep ||
              row.passo ||
              1
            )
          ),
          min_quantity: Math.max(
            0.001,
            Number(
              row.minQuantity ||
              row.minimo ||
              row.quantityStep ||
              1
            )
          ),
          barcode: safeText(
            row.barcode ||
            row.codigoBarras,
            80
          ),
          active: true
        };

        const image = safeText(
          row.image || row.imagem,
          1000000
        );

        if (existing) {
          if (image) vals.image = image;

          await supabase.update(
            'products',
            vals,
            { id: `eq.${existing.id}` }
          );

          updated += 1;
        } else {
          await supabase.insert('products', {
            ...vals,
            sku,
            old_price: null,
            badge: '',
            emoji: '🛒',
            featured: false,
            image,
            description: '',
            promo_start: null,
            promo_end: null,
            sort_order: 0
          });

          created += 1;
        }
      }

      await audit(
        user.id,
        'import',
        'product',
        'bulk',
        `${created} criados, ${updated} atualizados`
      );

      return sendJson(res, 200, {
        ok: true,
        created,
        updated
      });
    }

    if (
      method === 'GET' &&
      pathname === '/api/admin/customers'
    ) {
      const q = safeText(
        url.searchParams.get('q') || '',
        120
      );

      const query = {
        select:
          'id,phone,name,last_address,last_region,' +
          'order_count,total_spent,created_at,updated_at',
        order: 'total_spent.desc,updated_at.desc',
        limit: 500
      };

      if (q) {
        query.or =
          `(name.ilike.*${q}*,phone.ilike.*${q}*)`;
      }

      const rows = await supabase.select(
        'customers',
        query
      );

      const customers = rows.map(customer => ({
        id: Number(customer.id),
        phone: customer.phone,
        name: customer.name,
        lastAddress: customer.last_address,
        lastRegion: customer.last_region,
        orderCount: Number(
          customer.order_count || 0
        ),
        totalSpent: Number(
          customer.total_spent || 0
        ),
        createdAt: customer.created_at,
        updatedAt: customer.updated_at
      }));

      return sendJson(res, 200, {
        ok: true,
        customers
      });
    }

    if (
      method === 'GET' &&
      pathname === '/api/admin/reports'
    ) {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const days = Math.max(
        1,
        Math.min(
          365,
          Number(
            url.searchParams.get('days') || 30
          )
        )
      );

      const since = new Date(
        Date.now() - days * 86400000
      ).toISOString();

      const orders = await supabase.select(
        'orders',
        {
          select:
            'id,phone,total,status,created_at,region_name',
          created_at: `gte.${since}`,
          status: 'neq.cancelado',
          order: 'created_at.asc'
        }
      );

      const orderIds = orders.map(order => order.id);

      const items = orderIds.length
        ? await supabase.select('order_items', {
            select:
              'order_id,product_id,name,qty,price',
            order_id:
              `in.(${orderIds.map(
                id => `"${id}"`
              ).join(',')})`
          })
        : [];

      const productIds = [...new Set(
        items
          .map(item => Number(item.product_id))
          .filter(Number.isFinite)
      )];

      const productRows = productIds.length
        ? await supabase.select('products', {
            select: 'id,category',
            id: `in.(${productIds.join(',')})`
          })
        : [];

      const productMap = new Map(
        productRows.map(
          product => [
            Number(product.id),
            product.category
          ]
        )
      );

      const revenue = orders.reduce(
        (sum, order) =>
          sum + Number(order.total || 0),
        0
      );

      const customers = new Set(
        orders.map(order => order.phone)
      ).size;

      const summary = {
        orders: orders.length,
        revenue,
        ticket:
          orders.length
            ? revenue / orders.length
            : 0,
        customers
      };

      const topMap = new Map();
      const categoryRevenue = new Map();

      for (const item of items) {
        const key =
          `${item.product_id || ''}|${item.name}`;

        const existing = topMap.get(key) || {
          product_id: item.product_id,
          name: item.name,
          qty: 0,
          revenue: 0
        };

        existing.qty += Number(item.qty);
        existing.revenue +=
          Number(item.qty) *
          Number(item.price);

        topMap.set(key, existing);

        const category =
          productMap.get(
            Number(item.product_id)
          ) || 'Sem categoria';

        categoryRevenue.set(
          category,
          (
            categoryRevenue.get(category) ||
            0
          ) +
          Number(item.qty) *
          Number(item.price)
        );
      }

      const dailyMap = new Map();
      const regionMap = new Map();

      for (const order of orders) {
        const day =
          String(order.created_at).slice(0, 10);

        const daily = dailyMap.get(day) || {
          day,
          orders: 0,
          revenue: 0
        };

        daily.orders += 1;
        daily.revenue += Number(
          order.total || 0
        );
        dailyMap.set(day, daily);

        const region =
          order.region_name ||
          'Sem região';

        const regionRow =
          regionMap.get(region) || {
            region,
            orders: 0,
            revenue: 0
          };

        regionRow.orders += 1;
        regionRow.revenue += Number(
          order.total || 0
        );

        regionMap.set(
          region,
          regionRow
        );
      }

      return sendJson(res, 200, {
        ok: true,
        days,
        summary,
        topProducts:
          [...topMap.values()]
            .sort(
              (a, b) =>
                b.revenue - a.revenue
            )
            .slice(0, 12),
        daily:
          [...dailyMap.values()]
            .sort(
              (a, b) =>
                a.day.localeCompare(b.day)
            ),
        regions:
          [...regionMap.values()]
            .sort(
              (a, b) =>
                b.orders - a.orders
            )
            .slice(0, 10),
        categories:
          [...categoryRevenue.entries()]
            .map(
              ([category, value]) => ({
                category,
                revenue: value
              })
            )
            .sort(
              (a, b) =>
                b.revenue - a.revenue
            )
      });
    }

    if (
      method === 'GET' &&
      pathname === '/api/admin/banners'
    ) {
      const rows = await supabase.select(
        'banners',
        {
          select: '*',
          order: 'sort_order.asc,id.asc'
        }
      );

      return sendJson(res, 200, {
        ok: true,
        banners: rows.map(publicBanner)
      });
    }

    if (
      method === 'POST' &&
      pathname === '/api/admin/banners'
    ) {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const b = await readJson(req);

      const maxRow = await supabase.one(
        'banners',
        {
          select: 'sort_order',
          order: 'sort_order.desc',
          limit: 1
        }
      );

      const nextSort =
        Number(maxRow?.sort_order ?? -1) + 1;

      const rows = await supabase.insert(
        'banners',
        {
          eyebrow: safeText(
            b.eyebrow,
            100
          ),
          title: safeText(
            b.title,
            220
          ),
          text: safeText(
            b.text,
            500
          ),
          button: safeText(
            b.button || 'Ver produtos',
            80
          ),
          target: safeText(
            b.target || '#produtos',
            200
          ),
          icon: safeText(
            b.icon || '🛒',
            16
          ),
          image: safeText(
            b.image,
            1000000
          ),
          theme: safeText(
            b.theme || 'blue',
            30
          ),
          active: b.active !== false,
          sort_order: Number(
            b.sortOrder ?? nextSort
          )
        }
      );

      await audit(
        user.id,
        'create',
        'banner',
        rows[0].id,
        b.title
      );

      return sendJson(res, 201, {
        ok: true,
        banner: publicBanner(rows[0])
      });
    }

    const bannerMatch = pathname.match(
      /^\/api\/admin\/banners\/(\d+)$/
    );

    if (bannerMatch && method === 'PUT') {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const id = Number(bannerMatch[1]);
      const b = await readJson(req);

      const current = await supabase.one(
        'banners',
        {
          select: '*',
          id: `eq.${id}`
        }
      );

      if (!current) {
        return sendJson(res, 404, {
          ok: false,
          error: 'Banner não encontrado.'
        });
      }

      const rows = await supabase.update(
        'banners',
        {
          eyebrow: safeText(
            b.eyebrow ?? current.eyebrow,
            100
          ),
          title: safeText(
            b.title ?? current.title,
            220
          ),
          text: safeText(
            b.text ?? current.text,
            500
          ),
          button: safeText(
            b.button ?? current.button,
            80
          ),
          target: safeText(
            b.target ?? current.target,
            200
          ),
          icon: safeText(
            b.icon ?? current.icon,
            16
          ),
          image: safeText(
            b.image ?? current.image,
            1000000
          ),
          theme: safeText(
            b.theme ?? current.theme,
            30
          ),
          active:
            b.active === undefined
              ? Boolean(current.active)
              : Boolean(b.active),
          sort_order: Number(
            b.sortOrder ??
            current.sort_order
          )
        },
        { id: `eq.${id}` }
      );

      await audit(
        user.id,
        'update',
        'banner',
        id,
        current.title
      );

      return sendJson(res, 200, {
        ok: true,
        banner: publicBanner(rows[0])
      });
    }

    if (
      bannerMatch &&
      method === 'DELETE'
    ) {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const id = Number(bannerMatch[1]);

      await supabase.remove('banners', {
        id: `eq.${id}`
      });

      await audit(
        user.id,
        'delete',
        'banner',
        id
      );

      return sendJson(res, 200, { ok: true });
    }

    if (
      method === 'GET' &&
      pathname === '/api/admin/coupons'
    ) {
      const rows = await supabase.select(
        'coupons',
        {
          select: '*',
          order: 'code.asc'
        }
      );

      const coupons = {};
      for (const row of rows) {
        coupons[row.code] = publicCoupon(row);
      }

      return sendJson(res, 200, {
        ok: true,
        coupons
      });
    }

    if (
      method === 'POST' &&
      pathname === '/api/admin/coupons'
    ) {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const b = await readJson(req);

      const code = safeText(
        b.code,
        40
      )
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '');

      if (!code) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Código inválido.'
        });
      }

      try {
        const rows = await supabase.insert(
          'coupons',
          {
            code,
            type:
              b.type === 'fixed'
                ? 'fixed'
                : 'percent',
            value: Number(b.value || 0),
            label: safeText(
              b.label || code,
              120
            ),
            minimum_order: Number(
              b.minimumOrder || 0
            ),
            active: b.active !== false
          }
        );

        await audit(
          user.id,
          'create',
          'coupon',
          code
        );

        return sendJson(res, 201, {
          ok: true,
          coupon: {
            code,
            ...publicCoupon(rows[0])
          }
        });
      } catch (error) {
        if (error.supabaseStatus === 409) {
          return sendJson(res, 409, {
            ok: false,
            error:
              'Já existe um cupom com esse código.'
          });
        }
        throw error;
      }
    }

    const couponMatch = pathname.match(
      /^\/api\/admin\/coupons\/([^/]+)$/
    );

    if (couponMatch && method === 'PUT') {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const code = decodeURIComponent(
        couponMatch[1]
      ).toUpperCase();

      const b = await readJson(req);

      const current = await supabase.one(
        'coupons',
        {
          select: '*',
          code: `eq.${code}`
        }
      );

      if (!current) {
        return sendJson(res, 404, {
          ok: false,
          error: 'Cupom não encontrado.'
        });
      }

      await supabase.update(
        'coupons',
        {
          type:
            b.type === 'fixed'
              ? 'fixed'
              : 'percent',
          value: Number(
            b.value ?? current.value
          ),
          label: safeText(
            b.label ?? current.label,
            120
          ),
          minimum_order: Number(
            b.minimumOrder ??
            current.minimum_order
          ),
          active:
            b.active === undefined
              ? Boolean(current.active)
              : Boolean(b.active)
        },
        { code: `eq.${code}` }
      );

      await audit(
        user.id,
        'update',
        'coupon',
        code
      );

      return sendJson(res, 200, { ok: true });
    }

    if (
      couponMatch &&
      method === 'DELETE'
    ) {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const code = decodeURIComponent(
        couponMatch[1]
      ).toUpperCase();

      await supabase.remove(
        'coupons',
        { code: `eq.${code}` }
      );

      await audit(
        user.id,
        'delete',
        'coupon',
        code
      );

      return sendJson(res, 200, { ok: true });
    }

    if (
      method === 'GET' &&
      pathname === '/api/admin/regions'
    ) {
      const rows = await supabase.select(
        'delivery_regions',
        {
          select: '*',
          order: 'name.asc'
        }
      );

      return sendJson(res, 200, {
        ok: true,
        regions: rows.map(publicRegion)
      });
    }

    if (
      method === 'POST' &&
      pathname === '/api/admin/regions'
    ) {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const b = await readJson(req);

      try {
        const rows = await supabase.insert(
          'delivery_regions',
          {
            name: safeText(b.name, 120),
            fee: Number(b.fee || 0),
            minimum: Number(
              b.minimum || 0
            ),
            active: b.active !== false
          }
        );

        await audit(
          user.id,
          'create',
          'region',
          rows[0].id,
          b.name
        );

        return sendJson(res, 201, {
          ok: true,
          region: publicRegion(rows[0])
        });
      } catch (error) {
        if (error.supabaseStatus === 409) {
          return sendJson(res, 409, {
            ok: false,
            error:
              'Já existe uma região com esse nome.'
          });
        }
        throw error;
      }
    }

    const regionMatch = pathname.match(
      /^\/api\/admin\/regions\/(\d+)$/
    );

    if (regionMatch && method === 'PUT') {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const id = Number(regionMatch[1]);
      const b = await readJson(req);

      const current = await supabase.one(
        'delivery_regions',
        {
          select: '*',
          id: `eq.${id}`
        }
      );

      if (!current) {
        return sendJson(res, 404, {
          ok: false,
          error: 'Região não encontrada.'
        });
      }

      await supabase.update(
        'delivery_regions',
        {
          name: safeText(
            b.name ?? current.name,
            120
          ),
          fee: Number(
            b.fee ?? current.fee
          ),
          minimum: Number(
            b.minimum ?? current.minimum
          ),
          active:
            b.active === undefined
              ? Boolean(current.active)
              : Boolean(b.active)
        },
        { id: `eq.${id}` }
      );

      await audit(
        user.id,
        'update',
        'region',
        id,
        current.name
      );

      return sendJson(res, 200, { ok: true });
    }

    if (
      regionMatch &&
      method === 'DELETE'
    ) {
      if (
        (ROLE_LEVEL[user.role] || 0) <
        ROLE_LEVEL.manager
      ) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sem permissão.'
        });
      }

      const id = Number(regionMatch[1]);

      await supabase.update(
        'delivery_regions',
        { active: false },
        { id: `eq.${id}` }
      );

      await audit(
        user.id,
        'deactivate',
        'region',
        id
      );

      return sendJson(res, 200, { ok: true });
    }

    if (
      method === 'GET' &&
      pathname === '/api/admin/orders'
    ) {
      const status = safeText(
        url.searchParams.get('status') || '',
        40
      );

      const q = safeText(
        url.searchParams.get('q') || '',
        120
      );

      const query = {
        select:
          'id,customer_name,phone,total,status,' +
          'created_at,updated_at,method,region_name',
        order: 'created_at.desc',
        limit: 500
      };

      if (status && status !== 'todos') {
        query.status = `eq.${status}`;
      }

      if (q) {
        query.or =
          `(id.ilike.*${q}*,customer_name.ilike.*${q}*,phone.ilike.*${q}*)`;
      }

      const rows = await supabase.select(
        'orders',
        query
      );

      return sendJson(res, 200, {
        ok: true,
        orders: rows.map(order => ({
          id: order.id,
          customer: order.customer_name,
          phone: order.phone,
          total: Number(order.total),
          status: order.status,
          createdAt: order.created_at,
          updatedAt: order.updated_at,
          method: order.method,
          regionName: order.region_name
        }))
      });
    }

    const orderMatch = pathname.match(
      /^\/api\/admin\/orders\/([^/]+)$/
    );

    if (
      orderMatch &&
      method === 'GET'
    ) {
      const order = await getOrder(
        decodeURIComponent(orderMatch[1]),
        { includePrivate: true }
      );

      if (!order) {
        return sendJson(res, 404, {
          ok: false,
          error: 'Pedido não encontrado.'
        });
      }

      return sendJson(res, 200, {
        ok: true,
        order
      });
    }

    const orderStatusMatch = pathname.match(
      /^\/api\/admin\/orders\/([^/]+)\/status$/
    );

    if (
      orderStatusMatch &&
      method === 'PUT'
    ) {
      const b = await readJson(req);

      const order = await updateOrderStatus(
        decodeURIComponent(
          orderStatusMatch[1]
        ),
        safeText(b.status, 40),
        safeText(b.note, 500),
        user
      );

      return sendJson(res, 200, {
        ok: true,
        order
      });
    }

    if (
      method === 'GET' &&
      pathname === '/api/admin/settings'
    ) {
      return sendJson(res, 200, {
        ok: true,
        settings: await getSettingsObject()
      });
    }

    if (
      method === 'PUT' &&
      pathname === '/api/admin/settings'
    ) {
      if (user.role !== 'admin') {
        return sendJson(res, 403, {
          ok: false,
          error:
            'Apenas administrador pode alterar configurações gerais.'
        });
      }

      const b = await readJson(req);

      const allowed = [
        'storeName',
        'whatsapp',
        'cartGoal',
        'minimumOrder',
        'primaryMessage',
        'openingHours',
        'address',
        'allowDelivery',
        'allowPickup',
        'storeEmail',
        'freeDeliveryThreshold',
        'defaultSubstitution',
        'pwaName'
      ];

      const current =
        await getSettingsObject();

      for (const key of allowed) {
        if (
          Object.prototype.hasOwnProperty.call(
            b,
            key
          )
        ) {
          current[key] = b[key];
        }
      }

      await setSettingsObject(current);

      await audit(
        user.id,
        'update',
        'settings',
        'store'
      );

      return sendJson(res, 200, {
        ok: true,
        settings: current
      });
    }

    if (
      method === 'GET' &&
      pathname === '/api/admin/users'
    ) {
      if (user.role !== 'admin') {
        return sendJson(res, 403, {
          ok: false,
          error: 'Apenas administrador.'
        });
      }

      const rows = await supabase.select(
        'users',
        {
          select:
            'id,name,username,role,active,created_at,updated_at',
          order: 'name.asc'
        }
      );

      return sendJson(res, 200, {
        ok: true,
        users: rows.map(row => ({
          id: Number(row.id),
          name: row.name,
          username: row.username,
          role: row.role,
          active: Boolean(row.active),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      });
    }

    if (
      method === 'POST' &&
      pathname === '/api/admin/users'
    ) {
      if (user.role !== 'admin') {
        return sendJson(res, 403, {
          ok: false,
          error: 'Apenas administrador.'
        });
      }

      const b = await readJson(req);
      const password = String(b.password || '');

      if (password.length < 8) {
        return sendJson(res, 400, {
          ok: false,
          error:
            'Senha deve ter pelo menos 8 caracteres.'
        });
      }

      const role = [
        'admin',
        'manager',
        'attendant'
      ].includes(b.role)
        ? b.role
        : 'attendant';

      const { salt, hash } =
        hashPassword(password);

      try {
        const rows = await supabase.insert(
          'users',
          {
            name: safeText(b.name, 120),
            username: safeText(
              b.username,
              80
            ),
            password_hash: hash,
            password_salt: salt,
            role,
            active: b.active !== false
          }
        );

        await audit(
          user.id,
          'create',
          'user',
          rows[0].id,
          b.username
        );

        return sendJson(res, 201, {
          ok: true,
          id: Number(rows[0].id)
        });
      } catch (error) {
        if (error.supabaseStatus === 409) {
          return sendJson(res, 409, {
            ok: false,
            error:
              'Esse nome de usuário já existe.'
          });
        }
        throw error;
      }
    }

    const userMatch = pathname.match(
      /^\/api\/admin\/users\/(\d+)$/
    );

    if (
      userMatch &&
      method === 'PUT'
    ) {
      if (user.role !== 'admin') {
        return sendJson(res, 403, {
          ok: false,
          error: 'Apenas administrador.'
        });
      }

      const id = Number(userMatch[1]);
      const b = await readJson(req);

      const current = await supabase.one(
        'users',
        {
          select: '*',
          id: `eq.${id}`
        }
      );

      if (!current) {
        return sendJson(res, 404, {
          ok: false,
          error: 'Usuário não encontrado.'
        });
      }

      const role = [
        'admin',
        'manager',
        'attendant'
      ].includes(b.role)
        ? b.role
        : current.role;

      const changes = {
        name: safeText(
          b.name ?? current.name,
          120
        ),
        username: safeText(
          b.username ?? current.username,
          80
        ),
        role,
        active:
          b.active === undefined
            ? Boolean(current.active)
            : Boolean(b.active)
      };

      if (b.password) {
        const password =
          String(b.password);

        if (password.length < 8) {
          return sendJson(res, 400, {
            ok: false,
            error:
              'Senha deve ter pelo menos 8 caracteres.'
          });
        }

        const { salt, hash } =
          hashPassword(password);

        changes.password_hash = hash;
        changes.password_salt = salt;
      }

      await supabase.update(
        'users',
        changes,
        { id: `eq.${id}` }
      );

      if (b.password) {
        await supabase.remove(
          'sessions',
          { user_id: `eq.${id}` }
        );
      }

      await audit(
        user.id,
        'update',
        'user',
        id,
        current.username
      );

      return sendJson(res, 200, {
        ok: true
      });
    }

    if (
      userMatch &&
      method === 'DELETE'
    ) {
      if (user.role !== 'admin') {
        return sendJson(res, 403, {
          ok: false,
          error: 'Apenas administrador.'
        });
      }

      const id = Number(userMatch[1]);

      if (id === user.id) {
        return sendJson(res, 400, {
          ok: false,
          error:
            'Você não pode desativar seu próprio usuário.'
        });
      }

      await supabase.update(
        'users',
        { active: false },
        { id: `eq.${id}` }
      );

      await supabase.remove(
        'sessions',
        { user_id: `eq.${id}` }
      );

      await audit(
        user.id,
        'deactivate',
        'user',
        id
      );

      return sendJson(res, 200, {
        ok: true
      });
    }

    if (
      method === 'GET' &&
      pathname === '/api/admin/audit'
    ) {
      const [rows, users] = await Promise.all([
        supabase.select('audit_log', {
          select: '*',
          order: 'id.desc',
          limit: 300
        }),
        supabase.select('users', {
          select: 'id,name,username'
        })
      ]);

      const userMap = new Map(
        users.map(row => [
          Number(row.id),
          row
        ])
      );

      const logs = rows.map(row => {
        const actor = row.user_id
          ? userMap.get(Number(row.user_id))
          : null;

        return {
          id: Number(row.id),
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          details: row.details,
          createdAt: row.created_at,
          userName:
            actor?.name || 'Sistema',
          username:
            actor?.username || ''
        };
      });

      return sendJson(res, 200, {
        ok: true,
        logs
      });
    }

    if (
      method === 'GET' &&
      pathname === '/api/admin/export'
    ) {
      if (user.role !== 'admin') {
        return sendJson(res, 403, {
          ok: false,
          error: 'Apenas administrador.'
        });
      }

      const [
        bootstrap,
        users,
        orders,
        orderItems,
        orderEvents,
        customers,
        auditRows
      ] = await Promise.all([
        getBootstrap({ admin: true }),
        supabase.select('users', {
          select:
            'id,name,username,role,active,created_at,updated_at'
        }),
        supabase.select('orders', {
          select: '*',
          order: 'created_at.desc'
        }),
        supabase.select('order_items', {
          select: '*'
        }),
        supabase.select('order_events', {
          select: '*'
        }),
        supabase.select('customers', {
          select: '*',
          order: 'updated_at.desc'
        }),
        supabase.select('audit_log', {
          select: '*',
          order: 'id.desc'
        })
      ]);

      await audit(
        user.id,
        'export',
        'database',
        'full'
      );

      return sendJson(res, 200, {
        ok: true,
        data: {
          exportedAt: now(),
          bootstrap,
          users,
          orders,
          orderItems,
          orderEvents,
          customers,
          audit: auditRows
        }
      });
    }
  }

  return sendJson(res, 404, {
    ok: false,
    error: 'Endpoint não encontrado.'
  });
}

const server = http.createServer(
  async (req, res) => {
    const url = new URL(
      req.url,
      `http://${req.headers.host || 'localhost'}`
    );

    res.setHeader(
      'X-Content-Type-Options',
      'nosniff'
    );
    res.setHeader(
      'X-Frame-Options',
      'SAMEORIGIN'
    );
    res.setHeader(
      'Referrer-Policy',
      'strict-origin-when-cross-origin'
    );
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), camera=(), microphone=()'
    );

    try {
      if (url.pathname.startsWith('/api/')) {
        return await handleApi(
          req,
          res,
          url
        );
      }

      return serveStatic(
        req,
        res,
        url.pathname
      );
    } catch (error) {
      console.error('[SC CENTRAL]', {
        message: error.message,
        code: error.code || '',
        details: error.details || '',
        hint: error.hint || ''
      });

      if (!res.headersSent) {
        sendJson(
          res,
          error.statusCode || 500,
          {
            ok: false,
            error:
              error.message ||
              'Erro interno do servidor.',
            code:
              error.code ||
              undefined
          }
        );
      } else {
        res.end();
      }
    }
  }
);

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('Supermercado SC Central');
  console.log(`Loja:   http://localhost:${PORT}/`);
  console.log(`Painel: http://localhost:${PORT}/login.html`);
  console.log(
    `Banco:  Supabase PostgreSQL (${supabase.PROJECT_REF || 'não configurado'})`
  );

  if (!supabase.configured()) {
    console.log(
      'ATENÇÃO: configure SUPABASE_SECRET_KEY no servidor.'
    );
  }

  console.log('');

  ensureFirstAdmin().catch(error => {
    console.error(
      '[SC Central] Falha ao verificar primeiro administrador:',
      error.message
    );
  });
});
