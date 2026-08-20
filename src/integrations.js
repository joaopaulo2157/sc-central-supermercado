// ==========================================================
// SC CENTRAL V6 FINAL - CAMADA DE INTEGRAÇÕES
// Webhooks opcionais para ERP/PDV/CRM/automação sem acoplar
// o núcleo da loja a um fornecedor específico.
// ==========================================================

const WEBHOOK_URL = String(process.env.SC_WEBHOOK_URL || '').trim();
const WEBHOOK_TOKEN = String(process.env.SC_WEBHOOK_TOKEN || '').trim();

function enabled() {
  return /^https?:\/\//i.test(WEBHOOK_URL);
}

async function emit(event, payload) {
  if (!enabled()) return { skipped:true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(WEBHOOK_URL, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        ...(WEBHOOK_TOKEN ? { Authorization:`Bearer ${WEBHOOK_TOKEN}` } : {})
      },
      body:JSON.stringify({ event, sentAt:new Date().toISOString(), payload }),
      signal:controller.signal
    });
    if (!response.ok) throw new Error(`Webhook respondeu ${response.status}`);
    return { ok:true, status:response.status };
  } finally {
    clearTimeout(timer);
  }
}

function emitInBackground(event, payload) {
  emit(event,payload).catch(error => console.warn(`[Integração] ${event}: ${error.message}`));
}

module.exports = { enabled, emit, emitInBackground };
