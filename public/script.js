// ==========================================================
// SUPERMERCADO SC CENTRAL - V2
// Evolução da V1: mantém catálogo, filtros, carrinho e WhatsApp,
// adicionando busca inteligente, quick view, cupons, progresso,
// checkout com dados do cliente, entrega/retirada e navegação mobile.
// ==========================================================

const STORE = {
  name: "Supermercado SC Central",

  // IMPORTANTE:
  // Substitua abaixo pelo WhatsApp real da loja no formato:
  // 55 + DDD + número, somente dígitos.
  // Exemplo: 5582999999999
  whatsapp: "55XXXXXXXXXXX",

  currency: "BRL",
  locale: "pt-BR",

  // Valor de referência visual para a barra de progresso do carrinho.
  // Não representa frete grátis automático; serve como incentivo visual.
  cartGoal: 200,

  coupons: {
    BEMVINDO5: { type: "percent", value: 5, label: "5% de desconto" },
    CENTRAL10: { type: "fixed", value: 10, label: "R$ 10,00 de desconto" }
  }
};

const products = [
  { id: 1, name: "Arroz Branco Tipo 1", category: "mercearia", unit: "Pacote 5kg", price: 28.90, oldPrice: 32.99, badge: "OFERTA", emoji: "🍚" },
  { id: 2, name: "Feijão Carioca Premium", category: "mercearia", unit: "Pacote 1kg", price: 7.99, oldPrice: 9.49, badge: "OFERTA", emoji: "🫘" },
  { id: 3, name: "Leite Integral", category: "bebidas", unit: "Caixa 1L", price: 5.79, oldPrice: 6.49, badge: "OFERTA", emoji: "🥛" },
  { id: 4, name: "Refrigerante Cola", category: "bebidas", unit: "Garrafa 2L", price: 8.99, oldPrice: 10.99, badge: "OFERTA", emoji: "🥤" },
  { id: 5, name: "Banana Prata", category: "hortifruti", unit: "Preço por kg", price: 5.49, oldPrice: null, badge: "FRESQUINHO", emoji: "🍌" },
  { id: 6, name: "Tomate Selecionado", category: "hortifruti", unit: "Preço por kg", price: 6.79, oldPrice: 8.29, badge: "OFERTA", emoji: "🍅" },
  { id: 7, name: "Carne Bovina de Primeira", category: "acougue", unit: "Preço por kg", price: 34.90, oldPrice: 39.90, badge: "OFERTA", emoji: "🥩" },
  { id: 8, name: "Frango Inteiro Resfriado", category: "acougue", unit: "Preço por kg", price: 10.99, oldPrice: 12.49, badge: "OFERTA", emoji: "🍗" },
  { id: 9, name: "Pão Francês", category: "padaria", unit: "Preço por kg", price: 14.90, oldPrice: null, badge: "PADARIA", emoji: "🥖" },
  { id: 10, name: "Bolo Caseiro", category: "padaria", unit: "Unidade", price: 18.90, oldPrice: 21.90, badge: "OFERTA", emoji: "🍰" },
  { id: 11, name: "Detergente Neutro", category: "limpeza", unit: "Frasco 500ml", price: 2.79, oldPrice: 3.49, badge: "OFERTA", emoji: "🧴" },
  { id: 12, name: "Sabão em Pó", category: "limpeza", unit: "Pacote 1,6kg", price: 16.90, oldPrice: 19.99, badge: "OFERTA", emoji: "🧼" },
  { id: 13, name: "Café Torrado e Moído", category: "mercearia", unit: "Pacote 500g", price: 17.49, oldPrice: 19.90, badge: "OFERTA", emoji: "☕" },
  { id: 14, name: "Açúcar Cristal", category: "mercearia", unit: "Pacote 1kg", price: 4.89, oldPrice: null, badge: "ECONOMIA", emoji: "🧂" },
  { id: 15, name: "Óleo de Soja", category: "mercearia", unit: "Garrafa 900ml", price: 7.49, oldPrice: 8.39, badge: "OFERTA", emoji: "🫗" },
  { id: 16, name: "Maçã Nacional", category: "hortifruti", unit: "Preço por kg", price: 9.90, oldPrice: null, badge: "FRESQUINHO", emoji: "🍎" },
  { id: 17, name: "Cebola Branca", category: "hortifruti", unit: "Preço por kg", price: 5.29, oldPrice: 6.19, badge: "OFERTA", emoji: "🧅" },
  { id: 18, name: "Água Mineral", category: "bebidas", unit: "Garrafa 1,5L", price: 3.29, oldPrice: null, badge: "MAIS VENDIDO", emoji: "💧" },
  { id: 19, name: "Suco de Laranja", category: "bebidas", unit: "Garrafa 1L", price: 8.49, oldPrice: 9.79, badge: "OFERTA", emoji: "🍊" },
  { id: 20, name: "Papel Higiênico", category: "limpeza", unit: "Pacote c/ 12 rolos", price: 18.90, oldPrice: 22.90, badge: "OFERTA", emoji: "🧻" }
];

const state = {
  activeCategory: "todos",
  search: "",
  sort: "relevancia",
  cart: JSON.parse(localStorage.getItem("scCentralCart") || "{}"),
  favorites: JSON.parse(localStorage.getItem("scCentralFavorites") || "[]"),
  coupon: JSON.parse(localStorage.getItem("scCentralCoupon") || "null")
};

const el = {
  productsGrid: document.querySelector("#productsGrid"),
  categoriesGrid: document.querySelector("#categoriesGrid"),
  productCountLabel: document.querySelector("#productCountLabel"),
  sortSelect: document.querySelector("#sortSelect"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  emptyState: document.querySelector("#emptyState"),
  clearFiltersBtn: document.querySelector("#clearFiltersBtn"),

  cartDrawer: document.querySelector("#cartDrawer"),
  cartOverlay: document.querySelector("#cartOverlay"),
  openCartBtn: document.querySelector("#openCartBtn"),
  closeCartBtn: document.querySelector("#closeCartBtn"),
  continueShoppingBtn: document.querySelector("#continueShoppingBtn"),
  cartItems: document.querySelector("#cartItems"),
  cartEmpty: document.querySelector("#cartEmpty"),
  cartFooter: document.querySelector("#cartFooter"),
  cartCount: document.querySelector("#cartCount"),
  cartHeaderTotal: document.querySelector("#cartHeaderTotal"),
  cartSubtotal: document.querySelector("#cartSubtotal"),
  cartTotal: document.querySelector("#cartTotal"),
  checkoutBtn: document.querySelector("#checkoutBtn"),

  menuToggle: document.querySelector("#menuToggle"),
  mainNav: document.querySelector("#mainNav"),

  countdown: document.querySelector("#countdown"),
  whatsappContactBtn: document.querySelector("#whatsappContactBtn"),
  footerWhatsapp: document.querySelector("#footerWhatsapp"),
  floatingWhatsapp: document.querySelector("#floatingWhatsapp"),
  toastContainer: document.querySelector("#toastContainer"),

  searchSuggestions: document.querySelector("#searchSuggestions"),
  couponInput: document.querySelector("#couponInput"),
  applyCouponBtn: document.querySelector("#applyCouponBtn"),
  couponMessage: document.querySelector("#couponMessage"),
  discountRow: document.querySelector("#discountRow"),
  cartDiscount: document.querySelector("#cartDiscount"),
  deliveryProgressText: document.querySelector("#deliveryProgressText"),
  deliveryProgressValue: document.querySelector("#deliveryProgressValue"),
  deliveryProgressBar: document.querySelector("#deliveryProgressBar"),

  modalBackdrop: document.querySelector("#modalBackdrop"),
  quickModal: document.querySelector("#quickModal"),
  quickModalContent: document.querySelector("#quickModalContent"),
  closeQuickModal: document.querySelector("#closeQuickModal"),

  checkoutModal: document.querySelector("#checkoutModal"),
  closeCheckoutModal: document.querySelector("#closeCheckoutModal"),
  checkoutForm: document.querySelector("#checkoutForm"),
  checkoutItemsCount: document.querySelector("#checkoutItemsCount"),
  checkoutTotal: document.querySelector("#checkoutTotal"),
  backToCartBtn: document.querySelector("#backToCartBtn"),
  deliveryAddressFields: document.querySelector("#deliveryAddressFields"),

  mobileCartBtn: document.querySelector("#mobileCartBtn"),
  mobileCartCount: document.querySelector("#mobileCartCount"),
  mobileWhatsappBtn: document.querySelector("#mobileWhatsappBtn"),

  pageLoader: document.querySelector("#pageLoader")
};

function money(value) {
  return new Intl.NumberFormat(STORE.locale, {
    style: "currency",
    currency: STORE.currency
  }).format(value);
}

function normalizeText(text) {
  return text
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getVisibleProducts() {
  let filtered = products.filter(product => {
    const matchesCategory =
      state.activeCategory === "todos" ||
      (state.activeCategory === "ofertas" && product.oldPrice) ||
      product.category === state.activeCategory;

    const matchesSearch =
      !state.search ||
      normalizeText(product.name).includes(normalizeText(state.search)) ||
      normalizeText(product.category).includes(normalizeText(state.search));

    return matchesCategory && matchesSearch;
  });

  if (state.sort === "menor-preco") filtered.sort((a, b) => a.price - b.price);
  if (state.sort === "maior-preco") filtered.sort((a, b) => b.price - a.price);
  if (state.sort === "nome") filtered.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return filtered;
}

function renderProducts() {
  const visible = getVisibleProducts();
  el.productCountLabel.textContent = `${visible.length} ${visible.length === 1 ? "produto" : "produtos"}`;

  el.productsGrid.innerHTML = visible.map(product => {
    const favorite = state.favorites.includes(product.id);
    return `
      <article class="product-card reveal in-view" data-id="${product.id}">
        <div class="product-image">
          ${product.badge ? `<span class="product-badge">${product.badge}</span>` : ""}
          <button class="favorite-btn ${favorite ? "active" : ""}" data-favorite="${product.id}" aria-label="Favoritar ${product.name}">
            ${favorite ? "♥" : "♡"}
          </button>
          <button class="product-card__quick" data-quick="${product.id}" type="button">VISUALIZAÇÃO RÁPIDA</button>
          <span class="product-emoji" aria-hidden="true">${product.emoji}</span>
        </div>
        <div class="product-info">
          <span class="product-category">${product.category}</span>
          <h3 class="product-name">${product.name}</h3>
          <span class="product-unit">${product.unit}</span>
          <div class="product-price-row">
            <div class="price-wrap">
              <span class="old-price">${product.oldPrice ? money(product.oldPrice) : ""}</span>
              <strong class="price">${money(product.price)}</strong>
            </div>
            ${state.cart[product.id]
              ? `<div class="product-cart-qty">${state.cart[product.id]} no carrinho</div>`
              : `<button class="add-cart" data-add="${product.id}" aria-label="Adicionar ${product.name} ao carrinho">＋</button>`}
          </div>
        </div>
      </article>
    `;
  }).join("");

  el.emptyState.hidden = visible.length !== 0;
  el.productsGrid.style.display = visible.length ? "" : "none";
}

function saveCart() {
  localStorage.setItem("scCentralCart", JSON.stringify(state.cart));
}

function saveFavorites() {
  localStorage.setItem("scCentralFavorites", JSON.stringify(state.favorites));
}

function getCartEntries() {
  return Object.entries(state.cart)
    .map(([id, qty]) => {
      const product = products.find(p => p.id === Number(id));
      return product ? { ...product, qty } : null;
    })
    .filter(Boolean);
}

function cartTotals() {
  const base = getCartEntries().reduce((acc, item) => {
    acc.quantity += item.qty;
    acc.subtotal += item.price * item.qty;
    return acc;
  }, { quantity: 0, subtotal: 0 });

  let discount = 0;

  if (state.coupon && STORE.coupons[state.coupon.code]) {
    const coupon = STORE.coupons[state.coupon.code];
    discount = coupon.type === "percent"
      ? base.subtotal * (coupon.value / 100)
      : coupon.value;

    discount = Math.min(discount, base.subtotal);
  }

  return {
    quantity: base.quantity,
    subtotal: base.subtotal,
    discount,
    total: Math.max(0, base.subtotal - discount)
  };
}

function renderCart() {
  const items = getCartEntries();
  const totals = cartTotals();

  el.cartCount.textContent = totals.quantity;
  el.cartHeaderTotal.textContent = money(totals.total);
  el.cartSubtotal.textContent = money(totals.subtotal);
  el.cartTotal.textContent = money(totals.total);

  if (el.mobileCartCount) el.mobileCartCount.textContent = totals.quantity;

  if (el.discountRow && el.cartDiscount) {
    el.discountRow.hidden = totals.discount <= 0;
    el.cartDiscount.textContent = `- ${money(totals.discount)}`;
  }

  const progress = Math.min(100, Math.round((totals.subtotal / STORE.cartGoal) * 100));
  if (el.deliveryProgressBar) el.deliveryProgressBar.style.width = `${progress}%`;
  if (el.deliveryProgressValue) el.deliveryProgressValue.textContent = `${progress}%`;
  if (el.deliveryProgressText) {
    const remaining = Math.max(0, STORE.cartGoal - totals.subtotal);
    el.deliveryProgressText.textContent = remaining > 0
      ? `Faltam ${money(remaining)} para atingir a meta do carrinho`
      : "Meta de compra atingida 🎉";
  }

  syncCouponUI();

  if (!items.length) {
    el.cartItems.innerHTML = "";
    el.cartEmpty.classList.add("active");
    el.cartFooter.classList.add("hidden");
    return;
  }

  el.cartEmpty.classList.remove("active");
  el.cartFooter.classList.remove("hidden");

  el.cartItems.innerHTML = items.map(item => `
    <div class="cart-item">
      <div class="cart-item__image">${item.emoji}</div>
      <div class="cart-item__info">
        <div class="cart-item__name">${item.name}</div>
        <div class="cart-item__price">${money(item.price * item.qty)}</div>
        <div class="cart-item__controls">
          <button class="qty-btn" data-decrease="${item.id}" aria-label="Diminuir quantidade">−</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" data-increase="${item.id}" aria-label="Aumentar quantidade">＋</button>
        </div>
      </div>
      <button class="remove-item" data-remove="${item.id}" aria-label="Remover produto">×</button>
    </div>
  `).join("");
}

function addToCart(id) {
  state.cart[id] = (state.cart[id] || 0) + 1;
  saveCart();
  renderCart();
  renderProducts();
  showToast("✅", "Produto adicionado ao carrinho.");

  const btn = document.querySelector(`[data-add="${id}"]`);
  if (btn) {
    btn.classList.add("added");
    btn.textContent = "✓";
    setTimeout(() => {
      btn.classList.remove("added");
      btn.textContent = "＋";
    }, 700);
  }
}

function changeQty(id, delta) {
  const next = (state.cart[id] || 0) + delta;
  if (next <= 0) delete state.cart[id];
  else state.cart[id] = next;
  saveCart();
  renderCart();
  renderProducts();
}

function removeFromCart(id) {
  delete state.cart[id];
  saveCart();
  renderCart();
  renderProducts();
  showToast("🗑️", "Produto removido do carrinho.");
}

function toggleFavorite(id) {
  if (state.favorites.includes(id)) {
    state.favorites = state.favorites.filter(itemId => itemId !== id);
    showToast("♡", "Removido dos favoritos.");
  } else {
    state.favorites.push(id);
    showToast("♥", "Adicionado aos favoritos.");
  }
  saveFavorites();
  renderProducts();
}

function openCart() {
  el.cartDrawer.classList.add("active");
  el.cartOverlay.classList.add("active");
  el.cartDrawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");
}

function closeCart() {
  el.cartDrawer.classList.remove("active");
  el.cartOverlay.classList.remove("active");
  el.cartDrawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("no-scroll");
}

function whatsappIsConfigured() {
  return /^\d{12,13}$/.test(STORE.whatsapp);
}

function getWhatsAppUrl(message) {
  const number = STORE.whatsapp.replace(/\D/g, "");
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function checkoutWhatsApp() {
  const items = getCartEntries();
  if (!items.length) {
    showToast("🛒", "Seu carrinho ainda está vazio.");
    return;
  }

  if (!whatsappIsConfigured()) {
    showToast("⚠️", "Configure o número do WhatsApp no arquivo script.js antes de usar o checkout.");
    return;
  }

  const totals = cartTotals();
  const lines = items.map((item, index) =>
    `${index + 1}. ${item.qty}x ${item.name} (${item.unit}) — ${money(item.price * item.qty)}`
  );

  const message = [
    `Olá! Gostaria de finalizar uma compra no *${STORE.name}*.`,
    "",
    "🛒 *MEU PEDIDO*",
    ...lines,
    "",
    `💰 *Total estimado: ${money(totals.total)}*`,
    "",
    "Por favor, confirme a disponibilidade dos produtos, o valor final, a forma de pagamento e a entrega."
  ].join("\n");

  window.open(getWhatsAppUrl(message), "_blank", "noopener");
}

function openSimpleWhatsApp() {
  if (!whatsappIsConfigured()) {
    showToast("⚠️", "Configure o número do WhatsApp no arquivo script.js.");
    return;
  }
  const message = `Olá! Vim pelo site do ${STORE.name} e gostaria de falar com o atendimento.`;
  window.open(getWhatsAppUrl(message), "_blank", "noopener");
}

function showToast(icon, text) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<span>${icon}</span><p>${text}</p>`;
  el.toastContainer.appendChild(toast);

  setTimeout(() => toast.classList.add("hide"), 2600);
  setTimeout(() => toast.remove(), 3000);
}

function setCategory(category) {
  state.activeCategory = category;

  document.querySelectorAll(".category-card").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.category === category);
  });

  renderProducts();
  document.querySelector("#produtos").scrollIntoView({ behavior: "smooth", block: "start" });
}

function setupCountdown() {
  let remaining = 8 * 60 * 60;

  const tick = () => {
    const hours = String(Math.floor(remaining / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
    const seconds = String(remaining % 60).padStart(2, "0");
    el.countdown.textContent = `${hours}:${minutes}:${seconds}`;

    remaining--;
    if (remaining < 0) remaining = 8 * 60 * 60;
  };

  tick();
  setInterval(tick, 1000);
}

function setupCounters() {
  const counters = document.querySelectorAll("[data-counter]");

  const runCounter = node => {
    const target = Number(node.dataset.counter);
    const duration = 1000;
    const start = performance.now();

    const frame = now => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = Math.floor(target * eased).toLocaleString("pt-BR") + (target > 99 ? "+" : "");
      if (progress < 1) requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  };

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.dataset.animated) {
        entry.target.dataset.animated = "true";
        runCounter(entry.target);
      }
    });
  }, { threshold: .5 });

  counters.forEach(counter => observer.observe(counter));
}

function setupRevealAnimations() {
  const nodes = [...document.querySelectorAll(".reveal")];
  const heroNodes = nodes.filter(node => node.closest(".hero"));
  const scrollNodes = nodes.filter(node => !node.closest(".hero"));

  // A hero já nasce na viewport. A entrada dela passa a ser determinística
  // e não depende do timing do IntersectionObserver.
  heroNodes.forEach(node => node.classList.remove("in-view"));
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      heroNodes.forEach(node => node.classList.add("in-view"));
    });
  });

  if (!("IntersectionObserver" in window)) {
    scrollNodes.forEach(node => node.classList.add("in-view"));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .12 });

  scrollNodes.forEach(node => observer.observe(node));
}

function restartHeroMotion() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const animated = document.querySelectorAll(
    ".hero-card, .floating-card, .ticker-track, .hero__grid-overlay"
  );

  animated.forEach(node => {
    node.style.animation = "none";
    void node.offsetWidth;
    node.style.animation = "";
  });
}

function setupNavHighlight() {
  const sections = [...document.querySelectorAll("section[id], header[id]")];
  const navLinks = [...document.querySelectorAll(".nav a")];

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(link => {
        const href = link.getAttribute("href");
        link.classList.toggle("active", href === `#${entry.target.id}`);
      });
    });
  }, { rootMargin: "-35% 0px -55% 0px", threshold: 0 });

  sections.forEach(section => observer.observe(section));
}

function setupMagneticButton() {
  const button = document.querySelector(".magnetic");
  if (!button || window.matchMedia("(pointer: coarse)").matches) return;

  button.addEventListener("mousemove", event => {
    const rect = button.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    button.style.transform = `translate(${x * .08}px, ${y * .08}px) translateY(-2px)`;
  });

  button.addEventListener("mouseleave", () => {
    button.style.transform = "";
  });
}

function handleGlobalClick(event) {
  const addBtn = event.target.closest("[data-add]");
  if (addBtn) addToCart(Number(addBtn.dataset.add));

  const favoriteBtn = event.target.closest("[data-favorite]");
  if (favoriteBtn) toggleFavorite(Number(favoriteBtn.dataset.favorite));

  const quickBtn = event.target.closest("[data-quick]");
  if (quickBtn) openQuickView(Number(quickBtn.dataset.quick));

  const increaseBtn = event.target.closest("[data-increase]");
  if (increaseBtn) changeQty(Number(increaseBtn.dataset.increase), 1);

  const decreaseBtn = event.target.closest("[data-decrease]");
  if (decreaseBtn) changeQty(Number(decreaseBtn.dataset.decrease), -1);

  const removeBtn = event.target.closest("[data-remove]");
  if (removeBtn) removeFromCart(Number(removeBtn.dataset.remove));
}


// ==========================================================
// V2 - BUSCA INTELIGENTE
// ==========================================================
function renderSearchSuggestions() {
  if (!el.searchSuggestions) return;

  const term = el.searchInput.value.trim();
  if (term.length < 1) {
    el.searchSuggestions.classList.remove("active");
    el.searchSuggestions.innerHTML = "";
    return;
  }

  const found = products
    .filter(product => normalizeText(product.name).includes(normalizeText(term)))
    .slice(0, 5);

  if (!found.length) {
    el.searchSuggestions.innerHTML = `
      <button class="search-suggestion" type="button" data-suggestion-clear>
        <span class="search-suggestion__emoji">🔎</span>
        <div><strong>Nenhum resultado imediato</strong><small>Pressione Buscar para ver todos os filtros.</small></div>
      </button>
    `;
  } else {
    el.searchSuggestions.innerHTML = found.map(product => `
      <button class="search-suggestion" type="button" data-suggestion="${product.id}">
        <span class="search-suggestion__emoji">${product.emoji}</span>
        <div><strong>${product.name}</strong><small>${product.unit} • ${money(product.price)}</small></div>
      </button>
    `).join("");
  }

  el.searchSuggestions.classList.add("active");
}

// ==========================================================
// V2 - VISUALIZAÇÃO RÁPIDA
// ==========================================================
function openQuickView(id) {
  const product = products.find(item => item.id === id);
  if (!product || !el.quickModal || !el.modalBackdrop) return;

  el.quickModalContent.innerHTML = `
    <div class="quick-modal__grid">
      <div class="quick-modal__visual">
        <span class="quick-modal__emoji">${product.emoji}</span>
      </div>
      <div class="quick-modal__info">
        <span class="eyebrow eyebrow--blue">${product.badge || "SC CENTRAL"}</span>
        <h3>${product.name}</h3>
        <p>${product.unit}. Produto disponível para inclusão no carrinho. O estoque e o valor final são confirmados pelo atendimento.</p>
        <div class="quick-modal__price">
          <strong>${money(product.price)}</strong>
          ${product.oldPrice ? `<s>${money(product.oldPrice)}</s>` : ""}
        </div>
        <div class="quick-modal__actions">
          <button class="btn btn--secondary" type="button" data-quick-close>Continuar vendo</button>
          <button class="btn btn--primary" type="button" data-quick-add="${product.id}">Adicionar ao carrinho</button>
        </div>
      </div>
    </div>
  `;

  el.modalBackdrop.classList.add("active");
  el.quickModal.classList.add("active");
  el.quickModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");
}

function closeQuickView() {
  if (!el.quickModal || !el.modalBackdrop) return;
  el.quickModal.classList.remove("active");
  el.quickModal.setAttribute("aria-hidden", "true");

  if (!el.checkoutModal?.classList.contains("active")) {
    el.modalBackdrop.classList.remove("active");
    document.body.classList.remove("no-scroll");
  }
}

// ==========================================================
// V2 - CUPONS
// ==========================================================
function syncCouponUI() {
  if (!el.couponMessage || !el.couponInput) return;

  if (state.coupon && STORE.coupons[state.coupon.code]) {
    const coupon = STORE.coupons[state.coupon.code];
    el.couponInput.value = state.coupon.code;
    el.couponMessage.className = "coupon-message success";
    el.couponMessage.textContent = `Cupom ${state.coupon.code} aplicado: ${coupon.label}.`;
  } else {
    el.couponMessage.className = "coupon-message";
    el.couponMessage.textContent = "Teste na demonstração: BEMVINDO5 ou CENTRAL10.";
  }
}

function applyCoupon() {
  const code = (el.couponInput?.value || "").trim().toUpperCase();

  if (!code) {
    state.coupon = null;
    localStorage.removeItem("scCentralCoupon");
    renderCart();
    showToast("🏷️", "Cupom removido.");
    return;
  }

  const coupon = STORE.coupons[code];

  if (!coupon) {
    state.coupon = null;
    localStorage.removeItem("scCentralCoupon");
    if (el.couponMessage) {
      el.couponMessage.className = "coupon-message error";
      el.couponMessage.textContent = "Cupom não encontrado.";
    }
    renderCart();
    showToast("⚠️", "Cupom inválido.");
    return;
  }

  state.coupon = { code };
  localStorage.setItem("scCentralCoupon", JSON.stringify(state.coupon));
  renderCart();
  showToast("🏷️", `Cupom ${code} aplicado.`);
}

// ==========================================================
// V2 - CHECKOUT COM DADOS DO CLIENTE
// ==========================================================
function updateCheckoutReview() {
  const totals = cartTotals();
  if (el.checkoutItemsCount) el.checkoutItemsCount.textContent = totals.quantity;
  if (el.checkoutTotal) el.checkoutTotal.textContent = money(totals.total);
}

function openCheckoutModal() {
  const items = getCartEntries();

  if (!items.length) {
    showToast("🛒", "Seu carrinho ainda está vazio.");
    return;
  }

  closeCart();
  closeQuickView();

  updateCheckoutReview();
  el.modalBackdrop?.classList.add("active");
  el.checkoutModal?.classList.add("active");
  el.checkoutModal?.setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");

  setTimeout(() => document.querySelector("#customerName")?.focus(), 250);
}

function closeCheckoutModal() {
  el.checkoutModal?.classList.remove("active");
  el.checkoutModal?.setAttribute("aria-hidden", "true");
  el.modalBackdrop?.classList.remove("active");
  document.body.classList.remove("no-scroll");
}

function toggleAddressFields() {
  const selected = document.querySelector('input[name="deliveryMethod"]:checked')?.value;
  if (!el.deliveryAddressFields) return;

  const isDelivery = selected === "Entrega";
  el.deliveryAddressFields.style.display = isDelivery ? "" : "none";

  const address = document.querySelector("#customerAddress");
  if (address) address.required = isDelivery;
}

function formatCheckoutMessage(formData) {
  const items = getCartEntries();
  const totals = cartTotals();

  const lines = items.map((item, index) =>
    `${index + 1}. ${item.qty}x ${item.name} (${item.unit}) — ${money(item.price * item.qty)}`
  );

  const deliveryMethod = formData.get("deliveryMethod") || "Entrega";
  const isDelivery = deliveryMethod === "Entrega";

  const customerLines = [
    `👤 *Cliente:* ${formData.get("customerName") || "-"}`,
    `📞 *Telefone:* ${formData.get("customerPhone") || "-"}`,
    `📦 *Recebimento:* ${deliveryMethod}`
  ];

  if (isDelivery) {
    customerLines.push(
      `📍 *Endereço:* ${formData.get("customerAddress") || "-"}`,
      `🏘️ *Bairro:* ${formData.get("customerNeighborhood") || "-"}`,
      `🧭 *Referência:* ${formData.get("customerReference") || "-"}`,
      `🕐 *Horário preferido:* ${formData.get("deliveryTime") || "O quanto antes"}`
    );
  } else {
    customerLines.push(`🏘️ *Bairro:* ${formData.get("customerNeighborhood") || "-"}`);
  }

  customerLines.push(
    `💳 *Pagamento:* ${formData.get("paymentMethod") || "A combinar"}`
  );

  if (formData.get("paymentMethod") === "Dinheiro" && formData.get("changeFor")) {
    customerLines.push(`💵 *Troco para:* ${formData.get("changeFor")}`);
  }

  const couponLine = state.coupon
    ? `🏷️ *Cupom:* ${state.coupon.code}`
    : "🏷️ *Cupom:* nenhum";

  const notes = (formData.get("customerNotes") || "").trim();

  return [
    `Olá! Gostaria de finalizar uma compra no *${STORE.name}*.`,
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "🛒 *MEU PEDIDO*",
    "━━━━━━━━━━━━━━━━━━━━",
    ...lines,
    "",
    `📋 *Quantidade de itens:* ${totals.quantity}`,
    `💲 *Subtotal:* ${money(totals.subtotal)}`,
    totals.discount > 0 ? `✅ *Desconto estimado:* - ${money(totals.discount)}` : "",
    couponLine,
    `💰 *TOTAL ESTIMADO: ${money(totals.total)}*`,
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "📌 *DADOS DO CLIENTE*",
    "━━━━━━━━━━━━━━━━━━━━",
    ...customerLines,
    notes ? `📝 *Observações:* ${notes}` : "",
    "",
    "Por favor, confirme disponibilidade dos produtos, valores, pagamento e entrega/retirada."
  ].filter(Boolean).join("\n");
}

function submitCheckout(event) {
  event.preventDefault();

  const items = getCartEntries();
  if (!items.length) {
    closeCheckoutModal();
    showToast("🛒", "Seu carrinho está vazio.");
    return;
  }

  if (!whatsappIsConfigured()) {
    showToast("⚠️", "Configure o número do WhatsApp no arquivo script.js antes de usar o checkout.");
    return;
  }

  const formData = new FormData(el.checkoutForm);
  const deliveryMethod = formData.get("deliveryMethod");

  if (deliveryMethod === "Entrega" && !String(formData.get("customerAddress") || "").trim()) {
    showToast("📍", "Informe o endereço para entrega.");
    document.querySelector("#customerAddress")?.focus();
    return;
  }

  const message = formatCheckoutMessage(formData);
  window.open(getWhatsAppUrl(message), "_blank", "noopener");
}

// ==========================================================
// V2 - MÁSCARA SIMPLES DE TELEFONE
// ==========================================================
function formatPhoneInput(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
}


function initEvents() {
  document.addEventListener("click", handleGlobalClick);

  el.categoriesGrid.addEventListener("click", event => {
    const button = event.target.closest("[data-category]");
    if (button) setCategory(button.dataset.category);
  });

  el.sortSelect.addEventListener("change", () => {
    state.sort = el.sortSelect.value;
    renderProducts();
  });

  el.searchForm.addEventListener("submit", event => {
    event.preventDefault();
    state.search = el.searchInput.value.trim();
    renderProducts();
    document.querySelector("#produtos").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  el.searchInput.addEventListener("input", () => {
    state.search = el.searchInput.value.trim();
    renderProducts();
  });

  el.clearFiltersBtn.addEventListener("click", () => {
    state.search = "";
    state.activeCategory = "todos";
    el.searchInput.value = "";
    document.querySelectorAll(".category-card").forEach(btn => btn.classList.toggle("active", btn.dataset.category === "todos"));
    renderProducts();
  });

  el.openCartBtn.addEventListener("click", openCart);
  el.closeCartBtn.addEventListener("click", closeCart);
  el.cartOverlay.addEventListener("click", closeCart);
  el.continueShoppingBtn.addEventListener("click", () => {
    closeCart();
    document.querySelector("#produtos").scrollIntoView({ behavior: "smooth" });
  });
  el.checkoutBtn.addEventListener("click", openCheckoutModal);

  el.menuToggle.addEventListener("click", () => el.mainNav.classList.toggle("open"));
  document.querySelectorAll(".nav a").forEach(link => link.addEventListener("click", () => el.mainNav.classList.remove("open")));

  el.whatsappContactBtn.addEventListener("click", event => {
    event.preventDefault();
    openSimpleWhatsApp();
  });
  el.footerWhatsapp.addEventListener("click", event => {
    event.preventDefault();
    openSimpleWhatsApp();
  });
  el.floatingWhatsapp.addEventListener("click", openSimpleWhatsApp);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeCart();
      closeQuickView();
      closeCheckoutModal();
    }
  });

  // V2 - busca inteligente
  el.searchInput.addEventListener("input", renderSearchSuggestions);
  el.searchInput.addEventListener("focus", renderSearchSuggestions);

  el.searchSuggestions?.addEventListener("click", event => {
    const suggestion = event.target.closest("[data-suggestion]");
    if (suggestion) {
      const product = products.find(item => item.id === Number(suggestion.dataset.suggestion));
      if (product) {
        el.searchInput.value = product.name;
        state.search = product.name;
        renderProducts();
        el.searchSuggestions.classList.remove("active");
        document.querySelector("#produtos").scrollIntoView({ behavior: "smooth" });
      }
    }

    if (event.target.closest("[data-suggestion-clear]")) {
      el.searchSuggestions.classList.remove("active");
    }
  });

  document.addEventListener("click", event => {
    if (!event.target.closest(".search")) {
      el.searchSuggestions?.classList.remove("active");
    }

    const quickAdd = event.target.closest("[data-quick-add]");
    if (quickAdd) {
      addToCart(Number(quickAdd.dataset.quickAdd));
      closeQuickView();
      openCart();
    }

    if (event.target.closest("[data-quick-close]")) {
      closeQuickView();
    }
  });

  // V2 - cupom
  el.applyCouponBtn?.addEventListener("click", applyCoupon);
  el.couponInput?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyCoupon();
    }
  });

  // V2 - quick view
  el.closeQuickModal?.addEventListener("click", closeQuickView);

  // V2 - checkout
  el.closeCheckoutModal?.addEventListener("click", closeCheckoutModal);
  el.backToCartBtn?.addEventListener("click", () => {
    closeCheckoutModal();
    openCart();
  });
  el.checkoutForm?.addEventListener("submit", submitCheckout);

  document.querySelectorAll('input[name="deliveryMethod"]').forEach(input => {
    input.addEventListener("change", toggleAddressFields);
  });

  const phoneInput = document.querySelector("#customerPhone");
  phoneInput?.addEventListener("input", () => {
    phoneInput.value = formatPhoneInput(phoneInput.value);
  });

  // V2 - navegação mobile
  el.mobileCartBtn?.addEventListener("click", openCart);
  el.mobileWhatsappBtn?.addEventListener("click", openSimpleWhatsApp);

  // Fecha modal ao clicar no backdrop
  el.modalBackdrop?.addEventListener("click", () => {
    closeQuickView();
    closeCheckoutModal();
  });
}

function init() {
  document.querySelector("#currentYear").textContent = new Date().getFullYear();
  renderProducts();
  renderCart();
  syncCouponUI();
  toggleAddressFields();
  updateCheckoutReview();
  setupCountdown();
  setupCounters();
  setupRevealAnimations();
  setupNavHighlight();
  setupMagneticButton();
  initEvents();

  restartHeroMotion();

  window.addEventListener("pageshow", () => {
    restartHeroMotion();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) restartHeroMotion();
  });

  window.addEventListener("load", () => {
    setTimeout(() => el.pageLoader.classList.add("hidden"), 450);
  });

  // Fallback do loader em conexões lentas/arquivos abertos localmente.
  setTimeout(() => el.pageLoader.classList.add("hidden"), 1700);
}

init();
