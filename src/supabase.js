const SUPABASE_URL = String(
  process.env.SUPABASE_URL || 'https://khxpudotthujmpmjbcci.supabase.co'
).replace(/\/+$/, '');

const SERVICE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  ''
).trim();

const PROJECT_REF = (() => {
  try { return new URL(SUPABASE_URL).hostname.split('.')[0] || ''; }
  catch { return ''; }
})();

function configured() {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) && Boolean(SERVICE_KEY);
}

function headers(extra = {}) {
  if (!SERVICE_KEY) {
    const error = new Error(
      'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.'
    );
    error.statusCode = 503;
    error.code = 'SUPABASE_SERVER_KEY_MISSING';
    throw error;
  }

  const base = {
    apikey: SERVICE_KEY,
    Accept: 'application/json'
  };

  // Chaves novas sb_secret_* devem ser enviadas no cabeçalho apikey.
  // A chave service_role legada é um JWT e também pode ser usada como Bearer.
  if (!SERVICE_KEY.startsWith('sb_secret_')) {
    base.Authorization = `Bearer ${SERVICE_KEY}`;
  }

  return {
    ...base,
    ...extra
  };
}

function makeUrl(pathname, query = {}) {
  const url = new URL(pathname, SUPABASE_URL);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function request(pathname, {
  method = 'GET',
  query = {},
  body,
  prefer,
  extraHeaders = {},
  raw = false
} = {}) {
  const url = makeUrl(pathname, query);
  const h = headers(extraHeaders);

  if (prefer) h.Prefer = prefer;

  let payload = body;
  if (body !== undefined && body !== null && !raw) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: h,
      body: ['GET','HEAD'].includes(method) ? undefined : payload,
      cache: 'no-store'
    });
  } catch (cause) {
    const error = new Error(`Não foi possível conectar ao Supabase: ${cause.message}`);
    error.statusCode = 503;
    error.code = 'SUPABASE_CONNECTION_FAILED';
    throw error;
  }

  let data = null;
  const contentType = response.headers.get('content-type') || '';

  if (response.status !== 204) {
    if (contentType.includes('application/json')) {
      try { data = await response.json(); } catch { data = null; }
    } else {
      data = await response.text();
    }
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error_description ||
      data?.error ||
      (typeof data === 'string' && data) ||
      `Supabase respondeu HTTP ${response.status}.`;

    const error = new Error(message);
    error.statusCode = response.status >= 500 ? 503 : response.status;
    error.supabaseStatus = response.status;
    error.code = data?.code || 'SUPABASE_REQUEST_FAILED';
    error.details = data?.details || '';
    error.hint = data?.hint || '';
    throw error;
  }

  return { data, response };
}

async function select(table, query = {}) {
  const { data } = await request(`/rest/v1/${table}`, { query });
  return Array.isArray(data) ? data : [];
}

async function one(table, query = {}) {
  const rows = await select(table, { ...query, limit: query.limit || 1 });
  return rows[0] || null;
}

async function insert(table, value, { onConflict = '', upsert = false } = {}) {
  const query = {};
  if (onConflict) query.on_conflict = onConflict;

  const prefer = upsert
    ? 'return=representation,resolution=merge-duplicates'
    : 'return=representation';

  const { data } = await request(`/rest/v1/${table}`, {
    method: 'POST',
    query,
    body: value,
    prefer
  });

  return Array.isArray(data) ? data : [];
}

async function update(table, value, query = {}) {
  const { data } = await request(`/rest/v1/${table}`, {
    method: 'PATCH',
    query,
    body: value,
    prefer: 'return=representation'
  });
  return Array.isArray(data) ? data : [];
}

async function remove(table, query = {}) {
  const { data } = await request(`/rest/v1/${table}`, {
    method: 'DELETE',
    query,
    prefer: 'return=representation'
  });
  return Array.isArray(data) ? data : [];
}

async function rpc(name, args = {}) {
  const { data } = await request(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    body: args,
    prefer: 'return=representation'
  });
  return data;
}

async function uploadProductImage(filename, buffer, contentType) {
  const safeName = String(filename || '').replace(/[^a-zA-Z0-9._-]/g, '-');
  const { response } = await request(
    `/storage/v1/object/product-images/${encodeURIComponent(safeName)}`,
    {
      method: 'POST',
      body: buffer,
      raw: true,
      extraHeaders: {
        'Content-Type': contentType,
        'x-upsert': 'false'
      }
    }
  );

  return {
    path: safeName,
    url: `${SUPABASE_URL}/storage/v1/object/public/product-images/${encodeURIComponent(safeName)}`,
    status: response.status
  };
}

async function testConnection() {
  if (!configured()) {
    return {
      ok: false,
      projectRef: PROJECT_REF,
      error: 'SUPABASE_SERVICE_ROLE_KEY ausente.'
    };
  }

  try {
    const meta = await one('app_meta', {
      select: 'key,value',
      key: 'eq.schema_version'
    });

    return {
      ok: true,
      projectRef: PROJECT_REF,
      schemaVersion: meta?.value || null
    };
  } catch (error) {
    return {
      ok: false,
      projectRef: PROJECT_REF,
      error: error.message,
      code: error.code || ''
    };
  }
}

module.exports = {
  SUPABASE_URL,
  PROJECT_REF,
  configured,
  request,
  select,
  one,
  insert,
  update,
  remove,
  rpc,
  uploadProductImage,
  testConnection
};
