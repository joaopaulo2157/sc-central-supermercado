// ==========================================================
// SC CENTRAL V4 - INTEGRAÇÃO DA LOJA COM API
// Mantém toda a interface evoluída da V3 e transfere o pedido
// para o servidor SQLite antes de abrir o WhatsApp.
// ==========================================================

(() => {
  const syncChip = document.querySelector('#v4SyncChip');
  const trackForm = document.querySelector('#orderTrackForm');
  const trackResult = document.querySelector('#orderTrackResult');
  const checkoutFormNode = document.querySelector('#checkoutForm');
  let serverVersion = Number(window.SC_V4_BOOTSTRAP?.version || 0);

  const STATUS_LABEL = {
    novo: 'Novo pedido',
    confirmado: 'Confirmado',
    separando: 'Em separação',
    pronto: 'Pronto para retirada/entrega',
    saiu_entrega: 'Saiu para entrega',
    concluido: 'Concluído',
    cancelado: 'Cancelado'
  };

  function setSyncStatus(mode, text) {
    if (!syncChip) return;
    syncChip.classList.remove('online','offline');
    if (mode) syncChip.classList.add(mode);
    const label = syncChip.querySelector('b');
    if (label) label.textContent = text;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok || body.ok === false) {
      const error = new Error(body.error || `Erro ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function moneyV4(value) {
    return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value || 0));
  }

  function serverUnavailableNotice() {
    if (document.querySelector('.v4-server-banner')) return;
    const box = document.createElement('div');
    box.className = 'v4-server-banner';
    box.innerHTML = `<span>⚠️ V5 em modo local. Para usar banco de dados, usuários e sincronização, abra o projeto com <b>npm start</b>.</span><button type="button">Fechar</button>`;
    box.querySelector('button').addEventListener('click', () => box.remove());
    document.body.appendChild(box);
  }

  async function healthCheck() {
    try {
      const data = await api('/api/health');
      window.SC_V4_ONLINE = true;
      setSyncStatus('online','Servidor sincronizado');
      return data;
    } catch {
      window.SC_V4_ONLINE = false;
      setSyncStatus('offline','Modo local');
      return null;
    }
  }

  function buildOrderPayload() {
    const formData = new FormData(checkoutFormNode);
    const items = typeof getCartEntries === 'function' ? getCartEntries() : [];
    const deliveryMethod = formData.get('deliveryMethod') || 'Entrega';
    const neighborhoodSelect = document.querySelector('#customerNeighborhood');
    const selected = neighborhoodSelect?.selectedOptions?.[0];

    return {
      customer: {
        name: String(formData.get('customerName') || '').trim(),
        phone: String(formData.get('customerPhone') || '').trim()
      },
      deliveryMethod,
      regionId: deliveryMethod === 'Entrega' ? Number(selected?.dataset?.id || selected?.valueId || 0) || undefined : undefined,
      regionName: deliveryMethod === 'Entrega' ? String(formData.get('customerNeighborhood') || '') : 'Retirada na loja',
      address: String(formData.get('customerAddress') || ''),
      reference: String(formData.get('customerReference') || ''),
      deliveryTime: String(formData.get('deliveryTime') || ''),
      paymentMethod: String(formData.get('paymentMethod') || 'A combinar'),
      changeFor: String(formData.get('changeFor') || ''),
      notes: String(formData.get('customerNotes') || ''),
      couponCode: state?.coupon?.code || '',
      items: items.map(item => ({ productId: item.id, quantity: item.qty }))
    };
  }

  async function refreshCatalogAfterOrder() {
    try {
      const data = await api('/api/bootstrap');
      serverVersion = Number(data.version || serverVersion);
      localStorage.setItem('scCentralV3Products', JSON.stringify(data.products));
      if (Array.isArray(window.products)) {
        window.products.splice(0, window.products.length, ...data.products);
      } else if (typeof products !== 'undefined' && Array.isArray(products)) {
        products.splice(0, products.length, ...data.products);
      }
      if (typeof renderProducts === 'function') renderProducts();
      if (typeof renderCart === 'function') renderCart();
    } catch {}
  }

  // Captura antes do listener V3 e substitui somente a gravação/finalização.
  checkoutFormNode?.addEventListener('submit', async event => {
    if (!window.SC_V4_ONLINE) return; // fallback V3 continua funcionando localmente.
    event.preventDefault();
    event.stopImmediatePropagation();

    const submit = checkoutFormNode.querySelector('[type="submit"]');
    const oldHTML = submit?.innerHTML;
    if (submit) { submit.disabled = true; submit.innerHTML = '<span>⏳</span><div><small>Salvando pedido</small><strong>Aguarde...</strong></div>'; }

    try {
      const payload = buildOrderPayload();
      if (!payload.customer.name) throw new Error('Informe o nome do cliente.');
      if (payload.customer.phone.replace(/\D/g,'').length < 10) throw new Error('Informe um telefone válido.');
      if (payload.deliveryMethod === 'Entrega' && !payload.regionName) throw new Error('Selecione a região para entrega.');
      if (payload.deliveryMethod === 'Entrega' && !payload.address.trim()) throw new Error('Informe o endereço para entrega.');

      const result = await api('/api/orders', { method:'POST', body:JSON.stringify(payload) });
      const phone = String(result.whatsapp || '').replace(/\D/g,'');
      if (!/^\d{12,13}$/.test(phone)) {
        throw new Error(`Pedido ${result.order.id} foi salvo, mas o WhatsApp da loja ainda não foi configurado no Painel V5.`);
      }

      const url = `https://wa.me/${phone}?text=${encodeURIComponent(result.whatsappMessage)}`;
      localStorage.setItem('scCentralV4LastOrder', JSON.stringify({ id:result.order.id, phone:payload.customer.phone, createdAt:new Date().toISOString() }));

      if (typeof showToast === 'function') showToast('✅', `Pedido ${result.order.id} salvo no servidor.`);
      window.open(url, '_blank', 'noopener');

      // O servidor já reservou o estoque; zera o carrinho local para evitar envio duplicado.
      if (typeof state !== 'undefined') {
        state.cart = {};
        state.coupon = null;
      }
      localStorage.setItem('scCentralCart','{}');
      localStorage.removeItem('scCentralCoupon');
      if (typeof renderCart === 'function') renderCart();
      if (typeof renderProducts === 'function') renderProducts();
      if (typeof closeCheckoutModal === 'function') closeCheckoutModal();
      await refreshCatalogAfterOrder();
    } catch (error) {
      if (typeof showToast === 'function') showToast('⚠️', error.message);
      else alert(error.message);
    } finally {
      if (submit) { submit.disabled = false; submit.innerHTML = oldHTML; }
    }
  }, true);

  function renderTracking(order) {
    const status = STATUS_LABEL[order.status] || order.status;
    const events = Array.isArray(order.events) ? [...order.events].reverse() : [];
    trackResult.hidden = false;
    trackResult.innerHTML = `
      <div class="v4-order-head">
        <div><small>Pedido</small><strong>${order.id}</strong><small>${new Date(order.createdAt).toLocaleString('pt-BR')} • ${moneyV4(order.total)}</small></div>
        <span class="v4-order-status ${order.status}">${status}</span>
      </div>
      <div class="v4-order-timeline">
        ${events.map(event => `
          <div class="v4-order-event">
            <strong>${STATUS_LABEL[event.status] || event.status}</strong>
            <small>${new Date(event.createdAt).toLocaleString('pt-BR')}${event.userName ? ` • ${event.userName}` : ''}</small>
            ${event.note ? `<p>${event.note}</p>` : ''}
          </div>`).join('')}
      </div>`;
  }

  trackForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const order = document.querySelector('#trackOrderId')?.value.trim().toUpperCase();
    const phone = document.querySelector('#trackPhone')?.value.replace(/\D/g,'');
    trackResult.hidden = false;
    trackResult.innerHTML = '<div class="v4-track-error" style="background:#eef4ff;color:#0758ff">Consultando pedido...</div>';
    try {
      const data = await api(`/api/orders/track?order=${encodeURIComponent(order)}&phone=${encodeURIComponent(phone)}`);
      renderTracking(data.order);
    } catch (error) {
      trackResult.innerHTML = `<div class="v4-track-error">${error.message}</div>`;
    }
  });

  // Preenche acompanhamento com o último pedido deste navegador.
  try {
    const last = JSON.parse(localStorage.getItem('scCentralV4LastOrder') || 'null');
    if (last?.id) {
      const idInput = document.querySelector('#trackOrderId');
      const phoneInput = document.querySelector('#trackPhone');
      if (idInput && !idInput.value) idInput.value = last.id;
      if (phoneInput && !phoneInput.value) phoneInput.value = last.phone || '';
    }
  } catch {}

  // Detecta mudanças feitas no painel e convida o cliente a atualizar o catálogo.
  setInterval(async () => {
    if (!window.SC_V4_ONLINE) return healthCheck();
    try {
      const data = await api('/api/version');
      if (Number(data.version) !== serverVersion) {
        serverVersion = Number(data.version);
        await refreshCatalogAfterOrder();
        if (typeof showToast === 'function') showToast('🔄','Catálogo sincronizado com o servidor.');
      }
    } catch {
      setSyncStatus('offline','Reconectando...');
    }
  }, 60000);

  healthCheck().then(result => {
    if (!result) serverUnavailableNotice();
  });
})();
