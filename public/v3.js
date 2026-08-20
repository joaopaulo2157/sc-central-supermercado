// ==========================================================
// SUPERMERCADO SC CENTRAL - V3
// Camada adicional sobre a V2. A V2 permanece intacta.
// ==========================================================

(() => {
  const DEFAULTS = window.SC_V3_DEFAULTS;
  if (!DEFAULTS) return;

  const KEYS = {
    products: "scCentralV3Products",
    settings: "scCentralV3Settings",
    banners: "scCentralV3Banners",
    neighborhoods: "scCentralV3Neighborhoods",
    coupons: "scCentralV3Coupons",
    orders: "scCentralV3Orders",
    recent: "scCentralV3Recent"
  };

  const clone = value => JSON.parse(JSON.stringify(value));
  const load = (key, fallback) => {
    try {
      const stored = JSON.parse(localStorage.getItem(key));
      return stored ?? clone(fallback);
    } catch {
      return clone(fallback);
    }
  };

  const v3 = {
    settings: load(KEYS.settings, DEFAULTS.settings),
    catalog: load(KEYS.products, DEFAULTS.products),
    banners: load(KEYS.banners, DEFAULTS.banners),
    neighborhoods: load(KEYS.neighborhoods, DEFAULTS.neighborhoods),
    coupons: load(KEYS.coupons, DEFAULTS.coupons),
    recent: load(KEYS.recent, []),
    bannerIndex: 0,
    bannerTimer: null,
    featuredOnly: false,
    stockOnly: true,
    selectedDeliveryFee: 0
  };

  // Garante dados iniciais do V3 no navegador, permitindo que o admin os edite.
  if (!localStorage.getItem(KEYS.products)) localStorage.setItem(KEYS.products, JSON.stringify(v3.catalog));
  if (!localStorage.getItem(KEYS.settings)) localStorage.setItem(KEYS.settings, JSON.stringify(v3.settings));
  if (!localStorage.getItem(KEYS.banners)) localStorage.setItem(KEYS.banners, JSON.stringify(v3.banners));
  if (!localStorage.getItem(KEYS.neighborhoods)) localStorage.setItem(KEYS.neighborhoods, JSON.stringify(v3.neighborhoods));
  if (!localStorage.getItem(KEYS.coupons)) localStorage.setItem(KEYS.coupons, JSON.stringify(v3.coupons));

  // ---------- Integra V3 aos objetos da V2 ----------
  STORE.name = v3.settings.storeName || STORE.name;
  STORE.whatsapp = v3.settings.whatsapp || STORE.whatsapp;
  STORE.cartGoal = Number(v3.settings.cartGoal || STORE.cartGoal);
  STORE.coupons = Object.fromEntries(
    Object.entries(v3.coupons)
      .filter(([, coupon]) => coupon.active !== false)
      .map(([code, coupon]) => [code, { type: coupon.type, value: Number(coupon.value), label: coupon.label || code }])
  );

  products.splice(0, products.length, ...v3.catalog.map(item => ({ ...item, id: Number(item.id), price: Number(item.price), oldPrice: item.oldPrice === null || item.oldPrice === "" ? null : Number(item.oldPrice), stock: Number(item.stock ?? 0) })));

  state.featuredOnly = false;
  state.stockOnly = true;

  // Limpa IDs de carrinho que não existam mais no catálogo.
  Object.keys(state.cart).forEach(id => {
    if (!products.some(product => product.id === Number(id))) delete state.cart[id];
  });
  saveCart();

  const v3el = {
    bannerTrack: document.querySelector("#v3BannerTrack"),
    bannerDots: document.querySelector("#v3BannerDots"),
    bannerPrev: document.querySelector("#v3BannerPrev"),
    bannerNext: document.querySelector("#v3BannerNext"),
    featuredOnly: document.querySelector("#featuredOnly"),
    stockOnly: document.querySelector("#stockOnly"),
    recentSection: document.querySelector("#recentes"),
    recentTrack: document.querySelector("#recentTrack"),
    clearRecentBtn: document.querySelector("#clearRecentBtn"),
    favoritesDrawer: document.querySelector("#favoritesDrawer"),
    favoritesList: document.querySelector("#favoritesList"),
    closeFavoritesBtn: document.querySelector("#closeFavoritesBtn"),
    customerNeighborhood: document.querySelector("#customerNeighborhood"),
    checkoutProductsTotal: document.querySelector("#checkoutProductsTotal"),
    checkoutDeliveryFee: document.querySelector("#checkoutDeliveryFee"),
    deliveryAlert: document.querySelector("#deliveryAlert")
  };

  function productImageMarkup(product, className = "") {
    if (product.image) {
      return `<span class="v5-photo-fallback" aria-hidden="true">${product.emoji || "🛒"}</span><img class="${className}" src="${product.image}" alt="${product.name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;
    }
    return `<span class="v5-photo-fallback" aria-hidden="true">${product.emoji || "🛒"}</span>`;
  }

  function stockInfo(product) {
    const stock = Number(product.stock ?? 0);
    if (stock <= 0) return { label: "Sem estoque", cls: "out" };
    if (stock <= 8) return { label: `Últimas ${stock} un.`, cls: "low" };
    return { label: "Em estoque", cls: "" };
  }

  // ---------- Sobrescreve apenas a renderização, preservando toda a lógica V2 ----------
  renderProducts = function renderProductsV3() {
    let visible = products.filter(product => {
      const matchesCategory =
        state.activeCategory === "todos" ||
        (state.activeCategory === "ofertas" && product.oldPrice) ||
        product.category === state.activeCategory;

      const matchesSearch =
        !state.search ||
        normalizeText(product.name).includes(normalizeText(state.search)) ||
        normalizeText(product.category).includes(normalizeText(state.search));

      const matchesFeatured = !state.featuredOnly || product.featured === true;
      const matchesStock = !state.stockOnly || Number(product.stock ?? 0) > 0;
      return matchesCategory && matchesSearch && matchesFeatured && matchesStock;
    });

    if (state.sort === "menor-preco") visible.sort((a,b) => a.price - b.price);
    if (state.sort === "maior-preco") visible.sort((a,b) => b.price - a.price);
    if (state.sort === "nome") visible.sort((a,b) => a.name.localeCompare(b.name,"pt-BR"));
    if (state.sort === "relevancia") visible.sort((a,b) => Number(b.featured) - Number(a.featured));

    el.productCountLabel.textContent = `${visible.length} ${visible.length === 1 ? "produto" : "produtos"}`;

    el.productsGrid.innerHTML = visible.map(product => {
      const favorite = state.favorites.includes(product.id);
      const stock = stockInfo(product);
      const hasPhoto = Boolean(product.image);

      return `
        <article class="product-card reveal in-view ${stock.cls === "out" ? "is-out" : ""}" data-id="${product.id}">
          <div class="product-image ${hasPhoto ? "has-photo" : ""}">
            ${product.badge ? `<span class="product-badge">${product.badge}</span>` : ""}
            ${product.featured ? `<span class="product-featured">DESTAQUE</span>` : ""}
            <button class="favorite-btn ${favorite ? "active" : ""}" data-favorite="${product.id}" aria-label="Favoritar ${product.name}">${favorite ? "♥" : "♡"}</button>
            <button class="product-card__quick" data-quick="${product.id}" type="button">VISUALIZAÇÃO RÁPIDA</button>
            ${hasPhoto ? productImageMarkup(product, "product-photo") : `<span class="product-emoji" aria-hidden="true">${product.emoji || "🛒"}</span>`}
          </div>
          <div class="product-info">
            <span class="product-category">${product.category}</span>
            <h3 class="product-name">${product.name}</h3>
            <span class="product-unit">${product.unit}</span>
            <span class="product-stock ${stock.cls}">● ${stock.label}</span>
            <div class="product-price-row">
              <div class="price-wrap">
                <span class="old-price">${product.oldPrice ? money(product.oldPrice) : ""}</span>
                <strong class="price">${money(product.price)}</strong>
              </div>
              ${state.cart[product.id]
                ? `<div class="product-cart-qty">${state.cart[product.id]} no carrinho</div>`
                : `<button class="add-cart" data-add="${product.id}" aria-label="Adicionar ${product.name}" ${stock.cls === "out" ? "disabled" : ""}>＋</button>`}
            </div>
          </div>
        </article>`;
    }).join("");

    el.emptyState.hidden = visible.length !== 0;
    el.productsGrid.style.display = visible.length ? "" : "none";
  };

  // Limita quantidade no carrinho ao estoque configurado.
  const v2AddToCart = addToCart;
  addToCart = function addToCartV3(id) {
    const product = products.find(item => item.id === Number(id));
    if (!product) return;
    const stock = Number(product.stock ?? 0);
    const current = Number(state.cart[id] || 0);
    if (stock <= 0) return showToast("⚠️", "Produto indisponível no momento.");
    if (current >= stock) return showToast("📦", "Você atingiu o estoque disponível desse item.");
    v2AddToCart(id);
  };

  const v2ChangeQty = changeQty;
  changeQty = function changeQtyV3(id, delta) {
    const product = products.find(item => item.id === Number(id));
    if (!product) return;
    const current = Number(state.cart[id] || 0);
    if (delta > 0 && current >= Number(product.stock ?? 0)) {
      showToast("📦", "Quantidade máxima disponível atingida.");
      return;
    }
    v2ChangeQty(id, delta);
  };

  // ---------- Banner dinâmico ----------
  function activeBanners() { return v3.banners.filter(item => item.active !== false); }

  function renderBanners() {
    const banners = activeBanners();
    if (!v3el.bannerTrack || !banners.length) return;

    v3.bannerIndex = Math.min(v3.bannerIndex, banners.length - 1);
    v3el.bannerTrack.innerHTML = banners.map((banner, index) => `
      <article class="v3-banner-slide ${index === v3.bannerIndex ? "is-active" : ""}" data-theme="${banner.theme || "blue"}">
        ${banner.image ? `<img class="v3-banner-slide__image" src="${banner.image}" alt="" loading="lazy" onerror="this.remove()">` : ""}
        <div class="v3-banner-slide__copy">
          <span class="eyebrow">${banner.eyebrow || "SC CENTRAL"}</span>
          <h2>${banner.title}</h2>
          <p>${banner.text || ""}</p>
          <a class="btn" href="${banner.target || "#produtos"}">${banner.button || "Ver produtos"}</a>
        </div>
        <div class="v3-banner-slide__art" aria-hidden="true">${banner.icon || "🛒"}</div>
      </article>`).join("");

    v3el.bannerDots.innerHTML = banners.map((_, index) => `<button class="v3-banner-dot ${index === v3.bannerIndex ? "active" : ""}" data-banner-dot="${index}" aria-label="Ir ao banner ${index + 1}"></button>`).join("");
    updateBannerPosition(false);
  }

  function updateBannerPosition(animate = true) {
    const banners = activeBanners();
    if (!banners.length || !v3el.bannerTrack) return;
    if (!animate) v3el.bannerTrack.style.transition = "none";
    v3el.bannerTrack.style.transform = `translateX(-${v3.bannerIndex * 100}%)`;
    requestAnimationFrame(() => { v3el.bannerTrack.style.transition = ""; });
    v3el.bannerTrack.querySelectorAll(".v3-banner-slide").forEach((slide, index) => slide.classList.toggle("is-active", index === v3.bannerIndex));
    v3el.bannerDots?.querySelectorAll(".v3-banner-dot").forEach((dot,index) => dot.classList.toggle("active", index === v3.bannerIndex));
  }

  function goBanner(direction) {
    const banners = activeBanners();
    if (!banners.length) return;
    v3.bannerIndex = (v3.bannerIndex + direction + banners.length) % banners.length;
    updateBannerPosition();
    restartBannerTimer();
  }

  function restartBannerTimer() {
    clearInterval(v3.bannerTimer);
    if (activeBanners().length > 1) v3.bannerTimer = setInterval(() => goBanner(1), 6500);
  }

  // ---------- Recentes ----------
  function rememberRecent(id) {
    const numericId = Number(id);
    v3.recent = [numericId, ...v3.recent.filter(item => Number(item) !== numericId)].slice(0, 10);
    localStorage.setItem(KEYS.recent, JSON.stringify(v3.recent));
    renderRecent();
  }

  function renderRecent() {
    if (!v3el.recentSection || !v3el.recentTrack) return;
    const recentProducts = v3.recent.map(id => products.find(product => product.id === Number(id))).filter(Boolean);
    v3el.recentSection.hidden = recentProducts.length === 0;
    v3el.recentTrack.innerHTML = recentProducts.map(product => `
      <article class="recent-card" data-recent-quick="${product.id}">
        <div class="recent-card__image">${product.image ? productImageMarkup(product, "") : product.emoji}</div>
        <strong>${product.name}</strong><small>${product.unit}</small><b>${money(product.price)}</b>
      </article>`).join("");
  }

  const v2OpenQuickView = openQuickView;
  openQuickView = function openQuickViewV3(id) {
    rememberRecent(id);
    const product = products.find(item => item.id === Number(id));
    if (!product) return;
    const stock = stockInfo(product);

    el.quickModalContent.innerHTML = `
      <div class="quick-modal__grid">
        <div class="quick-modal__visual ${product.image ? "has-photo" : ""}">
          ${product.image ? productImageMarkup(product, "product-photo") : `<span class="quick-modal__emoji">${product.emoji}</span>`}
        </div>
        <div class="quick-modal__info">
          <span class="eyebrow eyebrow--blue">${product.badge || "SC CENTRAL"}</span>
          <h3>${product.name}</h3>
          <p>${product.unit}. ${stock.label}. O estoque, pesagem e valor final serão confirmados pelo atendimento quando necessário.</p>
          <span class="product-stock ${stock.cls}">● ${stock.label}</span>
          <div class="quick-modal__price"><strong>${money(product.price)}</strong>${product.oldPrice ? `<s>${money(product.oldPrice)}</s>` : ""}</div>
          <div class="quick-modal__actions">
            <button class="btn btn--secondary" type="button" data-quick-close>Continuar vendo</button>
            <button class="btn btn--primary" type="button" data-quick-add="${product.id}" ${Number(product.stock ?? 0) <= 0 ? "disabled" : ""}>${Number(product.stock ?? 0) <= 0 ? "Sem estoque" : "Adicionar ao carrinho"}</button>
          </div>
        </div>
      </div>`;

    el.modalBackdrop.classList.add("active");
    el.quickModal.classList.add("active");
    el.quickModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
  };

  // ---------- Favoritos ----------
  function renderFavorites() {
    if (!v3el.favoritesList) return;
    const favorites = state.favorites.map(id => products.find(product => product.id === Number(id))).filter(Boolean);
    if (!favorites.length) {
      v3el.favoritesList.innerHTML = `<div class="favorite-empty"><span>♡</span><h3>Nenhum favorito ainda</h3><p>Toque no coração dos produtos para guardar aqui.</p></div>`;
      return;
    }
    v3el.favoritesList.innerHTML = favorites.map(product => `
      <div class="favorite-row">
        <div class="favorite-row__image">${product.image ? productImageMarkup(product, "") : product.emoji}</div>
        <div><strong>${product.name}</strong><small>${money(product.price)}</small></div>
        <button data-favorite-add="${product.id}" aria-label="Adicionar ao carrinho">＋</button>
      </div>`).join("");
  }

  function openFavorites() {
    renderFavorites();
    v3el.favoritesDrawer?.classList.add("active");
    v3el.favoritesDrawer?.setAttribute("aria-hidden","false");
    el.cartOverlay.classList.add("active");
    document.body.classList.add("no-scroll");
  }

  function closeFavorites() {
    v3el.favoritesDrawer?.classList.remove("active");
    v3el.favoritesDrawer?.setAttribute("aria-hidden","true");
    if (!el.cartDrawer.classList.contains("active")) {
      el.cartOverlay.classList.remove("active");
      document.body.classList.remove("no-scroll");
    }
  }

  // ---------- Bairros, taxa e pedido mínimo ----------
  function activeNeighborhoods() { return v3.neighborhoods.filter(item => item.active !== false && item.name !== "Retirada na loja"); }

  function populateNeighborhoods() {
    if (!v3el.customerNeighborhood) return;
    v3el.customerNeighborhood.innerHTML = `<option value="">Selecione</option>` + activeNeighborhoods().map(item => `<option value="${item.name}" data-fee="${item.fee}" data-minimum="${item.minimum}">${item.name} • taxa ${money(Number(item.fee))}</option>`).join("");
  }

  function selectedNeighborhoodData() {
    const selectedName = v3el.customerNeighborhood?.value;
    return activeNeighborhoods().find(item => item.name === selectedName) || null;
  }

  function deliveryContext() {
    const method = document.querySelector('input[name="deliveryMethod"]:checked')?.value || "Entrega";
    const neighborhood = selectedNeighborhoodData();
    const fee = method === "Entrega" && neighborhood ? Number(neighborhood.fee || 0) : 0;
    const minimum = method === "Entrega" && neighborhood ? Number(neighborhood.minimum || v3.settings.minimumOrder || 0) : 0;
    return { method, neighborhood, fee, minimum };
  }

  function updateCheckoutReviewV3() {
    const totals = cartTotals();
    const ctx = deliveryContext();
    const freeThreshold = Number(v3.settings.freeDeliveryThreshold || 0);
    const effectiveFee = ctx.method === "Entrega" && freeThreshold > 0 && totals.total >= freeThreshold ? 0 : ctx.fee;
    const final = totals.total + effectiveFee;
    if (el.checkoutItemsCount) el.checkoutItemsCount.textContent = totals.quantity;
    if (v3el.checkoutProductsTotal) v3el.checkoutProductsTotal.textContent = money(totals.total);
    if (v3el.checkoutDeliveryFee) v3el.checkoutDeliveryFee.textContent = ctx.method === "Retirada na loja" ? "Grátis" : (ctx.neighborhood ? (effectiveFee === 0 ? "Grátis" : money(effectiveFee)) : "A calcular");
    if (el.checkoutTotal) el.checkoutTotal.textContent = money(final);

    if (v3el.deliveryAlert) {
      if (ctx.method === "Entrega" && ctx.neighborhood && totals.total < ctx.minimum) {
        v3el.deliveryAlert.className = "delivery-alert active";
        v3el.deliveryAlert.textContent = `Pedido mínimo para ${ctx.neighborhood.name}: ${money(ctx.minimum)}. Faltam ${money(ctx.minimum - totals.total)}.`;
      } else {
        v3el.deliveryAlert.className = "delivery-alert";
        v3el.deliveryAlert.textContent = "";
      }
    }
  }

  // O V2 chama updateCheckoutReview ao abrir checkout; redirecionamos para a V3.
  updateCheckoutReview = updateCheckoutReviewV3;

  const originalToggleAddressFields = toggleAddressFields;
  toggleAddressFields = function toggleAddressFieldsV3() {
    originalToggleAddressFields();
    updateCheckoutReviewV3();
  };

  // Remove listener V2 e registra finalização V3 com taxa, pedido mínimo e histórico.
  el.checkoutForm?.removeEventListener("submit", submitCheckout);
  const submitCheckoutV3 = event => {
    event.preventDefault();
    const items = getCartEntries();
    if (!items.length) return showToast("🛒", "Seu carrinho está vazio.");
    if (!whatsappIsConfigured()) return showToast("⚠️", "Configure o WhatsApp no Painel V6.");

    const formData = new FormData(el.checkoutForm);
    const ctx = deliveryContext();
    const totals = cartTotals();

    if (ctx.method === "Entrega") {
      if (!ctx.neighborhood) {
        showToast("📍", "Selecione o bairro/região para entrega.");
        v3el.customerNeighborhood?.focus();
        return;
      }
      if (!String(formData.get("customerAddress") || "").trim()) {
        showToast("📍", "Informe o endereço para entrega.");
        document.querySelector("#customerAddress")?.focus();
        return;
      }
      if (totals.total < ctx.minimum) {
        showToast("🛒", `Pedido mínimo para essa região: ${money(ctx.minimum)}.`);
        return;
      }
    }

    const freeThreshold = Number(v3.settings.freeDeliveryThreshold || 0);
    const effectiveFee = ctx.method === "Entrega" && freeThreshold > 0 && totals.total >= freeThreshold ? 0 : ctx.fee;
    const finalTotal = totals.total + effectiveFee;
    const orderId = `SC${Date.now().toString().slice(-8)}`;
    const lines = items.map((item,index) => `${index+1}. ${item.qty}x ${item.name} (${item.unit}) — ${money(item.price * item.qty)}`);
    const payment = formData.get("paymentMethod") || "A combinar";
    const substitution = formData.get("substitutionPreference") || "contact";
    const substitutionLabel = { contact:"Entrar em contato antes de substituir", equivalent:"Pode substituir por equivalente", none:"Não substituir" }[substitution] || substitution;
    const notes = String(formData.get("customerNotes") || "").trim();

    const message = [
      `Olá! Gostaria de finalizar o pedido *${orderId}* no *${STORE.name}*.`, "",
      "━━━━━━━━━━━━━━━━━━━━", "🛒 *PRODUTOS*", "━━━━━━━━━━━━━━━━━━━━", ...lines, "",
      `📋 *Itens:* ${totals.quantity}`,
      `💲 *Subtotal:* ${money(totals.subtotal)}`,
      totals.discount > 0 ? `✅ *Desconto:* - ${money(totals.discount)}` : "",
      state.coupon ? `🏷️ *Cupom:* ${state.coupon.code}` : "🏷️ *Cupom:* nenhum",
      `🚚 *Taxa estimada:* ${money(effectiveFee)}`,
      `💰 *TOTAL ESTIMADO: ${money(finalTotal)}*`, "",
      `🔁 *Substituição:* ${substitutionLabel}`, "",
      "━━━━━━━━━━━━━━━━━━━━", "📌 *DADOS DO CLIENTE*", "━━━━━━━━━━━━━━━━━━━━",
      `👤 *Cliente:* ${formData.get("customerName") || "-"}`,
      `📞 *Telefone:* ${formData.get("customerPhone") || "-"}`,
      `📦 *Recebimento:* ${ctx.method}`,
      ctx.method === "Entrega" ? `🏘️ *Bairro:* ${ctx.neighborhood.name}` : "",
      ctx.method === "Entrega" ? `📍 *Endereço:* ${formData.get("customerAddress") || "-"}` : "",
      ctx.method === "Entrega" ? `🧭 *Referência:* ${formData.get("customerReference") || "-"}` : "",
      ctx.method === "Entrega" ? `🕐 *Horário:* ${formData.get("deliveryTime") || "O quanto antes"}` : "",
      `💳 *Pagamento:* ${payment}`,
      payment === "Dinheiro" && formData.get("changeFor") ? `💵 *Troco para:* ${formData.get("changeFor")}` : "",
      notes ? `📝 *Observações:* ${notes}` : "",
      "", "Por favor, confirme estoque, pesagem quando aplicável, valores e disponibilidade da entrega."
    ].filter(Boolean).join("\n");

    const orders = load(KEYS.orders, []);
    orders.unshift({
      id: orderId,
      date: new Date().toISOString(),
      customer: String(formData.get("customerName") || ""),
      phone: String(formData.get("customerPhone") || ""),
      method: ctx.method,
      neighborhood: ctx.neighborhood?.name || "Retirada",
      payment,
      items: items.map(item => ({ id:item.id, name:item.name, qty:item.qty, price:item.price })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      deliveryFee: ctx.fee,
      total: finalTotal,
      status: "Enviado ao WhatsApp"
    });
    localStorage.setItem(KEYS.orders, JSON.stringify(orders.slice(0,500)));

    window.open(getWhatsAppUrl(message), "_blank", "noopener");
    showToast("✅", `Pedido ${orderId} preparado para o WhatsApp.`);
  };
  el.checkoutForm?.addEventListener("submit", submitCheckoutV3);

  // ---------- Eventos V3 ----------
  v3el.featuredOnly?.addEventListener("change", () => { state.featuredOnly = v3el.featuredOnly.checked; renderProducts(); });
  v3el.stockOnly?.addEventListener("change", () => { state.stockOnly = v3el.stockOnly.checked; renderProducts(); });

  document.querySelectorAll("[data-department]").forEach(button => button.addEventListener("click", () => setCategory(button.dataset.department)));

  v3el.bannerPrev?.addEventListener("click", () => goBanner(-1));
  v3el.bannerNext?.addEventListener("click", () => goBanner(1));
  v3el.bannerDots?.addEventListener("click", event => {
    const dot = event.target.closest("[data-banner-dot]");
    if (!dot) return;
    v3.bannerIndex = Number(dot.dataset.bannerDot);
    updateBannerPosition(); restartBannerTimer();
  });

  v3el.clearRecentBtn?.addEventListener("click", () => { v3.recent = []; localStorage.setItem(KEYS.recent,"[]"); renderRecent(); });
  v3el.recentTrack?.addEventListener("click", event => {
    const card = event.target.closest("[data-recent-quick]");
    if (card) openQuickView(Number(card.dataset.recentQuick));
  });

  document.querySelector("#favoritesBtn")?.addEventListener("click", openFavorites);
  v3el.closeFavoritesBtn?.addEventListener("click", closeFavorites);
  el.cartOverlay.addEventListener("click", closeFavorites);
  v3el.favoritesList?.addEventListener("click", event => {
    const button = event.target.closest("[data-favorite-add]");
    if (button) { addToCart(Number(button.dataset.favoriteAdd)); renderFavorites(); }
  });

  // Mantém drawer de favoritos sincronizado quando coração é alterado.
  document.addEventListener("click", event => {
    if (event.target.closest("[data-favorite]")) setTimeout(renderFavorites, 0);
  });

  v3el.customerNeighborhood?.addEventListener("change", updateCheckoutReviewV3);
  document.querySelectorAll('input[name="deliveryMethod"]').forEach(input => input.addEventListener("change", updateCheckoutReviewV3));

  // Escuta alterações do painel quando loja e painel estiverem em abas diferentes.
  window.addEventListener("storage", event => {
    if (Object.values(KEYS).includes(event.key)) location.reload();
  });

  // Atualiza textos de configuração sem exigir edição do HTML.
  document.querySelectorAll(".footer__brand p").forEach(node => { node.textContent = v3.settings.primaryMessage || node.textContent; });
  const footerInfo = document.querySelector(".footer__grid > div:nth-child(3)");
  if (footerInfo) {
    const spans = footerInfo.querySelectorAll("span");
    if (spans[0]) spans[0].textContent = v3.settings.openingHours || spans[0].textContent;
  }

  // ---------- Inicialização V3 ----------
  populateNeighborhoods();
  renderBanners();
  renderRecent();
  renderFavorites();
  renderProducts();
  renderCart();
  updateCheckoutReviewV3();
  restartBannerTimer();
})();
