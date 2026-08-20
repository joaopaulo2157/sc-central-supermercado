// ==========================================================
// SC CENTRAL V4 - BOOTSTRAP DA LOJA
// Busca dados reais da API/SQLite antes de iniciar a interface V3.
// Em caso de indisponibilidade do servidor, preserva o fallback local.
// ==========================================================

(async () => {
  const KEYS = {
    products: 'scCentralV3Products',
    settings: 'scCentralV3Settings',
    banners: 'scCentralV3Banners',
    neighborhoods: 'scCentralV3Neighborhoods',
    coupons: 'scCentralV3Coupons'
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  async function bootstrapFromServer() {
    const response = await fetch('/api/bootstrap', { cache: 'no-store' });
    if (!response.ok) throw new Error('API indisponível');
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Falha ao carregar catálogo');

    window.SC_V4_BOOTSTRAP = data;
    localStorage.setItem(KEYS.products, JSON.stringify(data.products));
    localStorage.setItem(KEYS.settings, JSON.stringify(data.settings));
    localStorage.setItem(KEYS.banners, JSON.stringify(data.banners));
    localStorage.setItem(KEYS.neighborhoods, JSON.stringify(data.neighborhoods));
    localStorage.setItem(KEYS.coupons, JSON.stringify(data.coupons));
    return data;
  }

  let online = false;
  try {
    await bootstrapFromServer();
    online = true;
  } catch (error) {
    console.warn('[SC V5] Iniciando fallback local:', error.message);
  }

  window.SC_V4_ONLINE = online;

  try {
    await loadScript('v3-data.js');
    await loadScript('script.js');
    await loadScript('v3.js');
    await loadScript('v4-store.js');
  } catch (error) {
    console.error('[SC V5] Erro ao iniciar interface:', error);
    document.querySelector('#pageLoader')?.classList.add('hidden');
  }
})();
