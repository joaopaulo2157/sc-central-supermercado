// ==========================================================
// SUPERMERCADO SC CENTRAL - V6 FINAL
// Quantidades por unidade/peso, categorias gerenciáveis, PWA
// e refinamentos finais da experiência de compra.
// ==========================================================
(() => {
  const bootstrap = window.SC_V4_BOOTSTRAP || {};
  const categories = Array.isArray(bootstrap.categories)
    ? bootstrap.categories
    : (() => { try { return JSON.parse(localStorage.getItem('scCentralV6Categories') || '[]'); } catch { return []; } })();

  function decimalsForStep(step) {
    step = Number(step || 1);
    if (step < 0.01) return 3;
    if (step < 1) return 2;
    return 0;
  }
  function productStep(product) { return Math.max(.001, Number(product?.quantityStep || (product?.saleMode === 'weight' ? .1 : 1))); }
  function productMin(product) { return Math.max(productStep(product), Number(product?.minQuantity || productStep(product))); }
  function normalizeQty(product, qty) {
    const step=productStep(product), min=productMin(product), decimals=decimalsForStep(step);
    let value=Number(qty); if(!Number.isFinite(value)||value<=0)value=min;
    value=Math.round(value/step)*step;
    return Number(Math.max(min,value).toFixed(decimals));
  }
  function formatQty(product, qty) {
    const value=Number(qty||0);
    const text=Number.isInteger(value)?String(value):value.toLocaleString('pt-BR',{maximumFractionDigits:3});
    const unit=product?.measureUnit || (product?.saleMode==='weight'?'kg':'un');
    return `${text} ${unit==='un'?'un.':unit}`;
  }
  function formatStock(product) { return formatQty(product, Number(product?.stock||0)); }

  // Categorias gerenciadas pelo painel substituem os botões fixos da demonstração.
  function renderManagedCategories() {
    const grid=document.querySelector('#categoriesGrid'); if(!grid||!categories.length)return;
    const active=categories.filter(c=>c.active!==false);
    grid.innerHTML=`<button class="category-card active" data-category="todos"><span>✨</span><strong>Todos</strong></button><button class="category-card" data-category="ofertas"><span>🏷️</span><strong>Ofertas</strong></button>`+
      active.map(c=>`<button class="category-card" data-category="${c.slug}"><span>${c.icon||'🛒'}</span><strong>${c.name}</strong></button>`).join('');
  }

  // V6 redefine os incrementos do carrinho para suportar peso e medidas decimais.
  addToCart = function addToCartV6(id) {
    const product=products.find(p=>p.id===Number(id)); if(!product)return;
    const stock=Number(product.stock||0); if(stock<=0)return showToast('⚠️','Produto indisponível no momento.');
    const current=Number(state.cart[id]||0); const step=current>0?productStep(product):productMin(product);
    const next=normalizeQty(product,current+step);
    if(next>stock+1e-9)return showToast('📦',`Disponível: ${formatStock(product)}.`);
    state.cart[id]=next; saveCart(); renderCart(); renderProducts(); showToast('✅',`${formatQty(product,step)} adicionado ao carrinho.`);
  };

  changeQty = function changeQtyV6(id, direction) {
    const product=products.find(p=>p.id===Number(id)); if(!product)return;
    const current=Number(state.cart[id]||0); const step=productStep(product);
    let next=current+(Number(direction)>0?step:-step);
    if(next < productMin(product)-1e-9){delete state.cart[id];}
    else {
      next=normalizeQty(product,next);
      if(next>Number(product.stock||0)+1e-9)return showToast('📦',`Quantidade máxima: ${formatStock(product)}.`);
      state.cart[id]=next;
    }
    saveCart(); renderCart(); renderProducts();
  };

  const renderProductsBeforeV6 = renderProducts;
  renderProducts = function renderProductsV6() {
    renderProductsBeforeV6();
    document.querySelectorAll('.product-card[data-id]').forEach(card=>{
      const product=products.find(p=>p.id===Number(card.dataset.id)); if(!product)return;
      const unit=card.querySelector('.product-unit');
      if(unit) unit.textContent=product.saleMode==='weight' ? `${product.unit} • escolha em ${product.measureUnit||'kg'}` : product.unit;
      const stock=card.querySelector('.product-stock');
      if(stock){const value=Number(product.stock||0);stock.textContent=value<=0?'● Sem estoque':value<=Number(productMin(product)*4)?`● Últimas ${formatStock(product)}`:`● Em estoque • ${formatStock(product)}`;}
      const price=card.querySelector('.price');
      if(price && product.saleMode==='weight' && !price.querySelector('.v6-price-measure')) price.insertAdjacentHTML('beforeend',`<small class="v6-price-measure"> / ${product.measureUnit||'kg'}</small>`);
      const qty=card.querySelector('.product-cart-qty'); if(qty) qty.textContent=`${formatQty(product,state.cart[product.id])} no carrinho`;
      if(product.saleMode==='weight') card.classList.add('v6-weight-product');
      if(product.oldPrice && product.promotionActive===false){const old=card.querySelector('.old-price');if(old)old.textContent='';}
      if(product.sku && !card.querySelector('.v6-sku')) card.querySelector('.product-info')?.insertAdjacentHTML('afterbegin',`<span class="v6-sku">${product.sku}</span>`);
    });
  };

  const renderCartBeforeV6 = renderCart;
  renderCart = function renderCartV6() {
    renderCartBeforeV6();
    const entries=getCartEntries();
    document.querySelectorAll('#cartItems .cart-item').forEach((node,index)=>{
      const item=entries[index]; if(!item)return; const product=products.find(p=>p.id===Number(item.id))||item;
      const q=node.querySelector('.qty-value');
      if(q){
        if(product.saleMode==='weight') q.outerHTML=`<input class="v6-qty-input" data-v6-qty="${product.id}" type="number" min="${productMin(product)}" max="${Number(product.stock||0)}" step="${productStep(product)}" value="${Number(item.qty)}" aria-label="Quantidade de ${product.name}">`;
        else q.textContent=formatQty(product,item.qty);
      }
      const image=node.querySelector('.cart-item__image');if(image&&product.image)image.innerHTML=`<img src="${product.image}" alt="${product.name}" onerror="this.remove()"><span>${product.emoji||'🛒'}</span>`;
      const name=node.querySelector('.cart-item__name');if(name&&!node.querySelector('.v6-cart-unit'))name.insertAdjacentHTML('afterend',`<div class="v6-cart-unit">${product.saleMode==='weight'?'Venda por '+(product.measureUnit||'kg'):product.unit}</div>`);
    });
    const lines=entries.length;
    if(el.cartCount)el.cartCount.textContent=lines;
    if(el.mobileCartCount)el.mobileCartCount.textContent=lines;
    if(el.checkoutItemsCount)el.checkoutItemsCount.textContent=lines;
  };

  // Preferência de substituição configurável pela loja.
  function syncSubstitutionDefault() {
    const preferred=bootstrap.settings?.defaultSubstitution || 'contact';
    const radio=document.querySelector(`input[name="substitutionPreference"][value="${preferred}"]`);
    if(radio) radio.checked=true;
  }


  const openQuickViewBeforeV6 = openQuickView;
  openQuickView = function openQuickViewV6(id) {
    openQuickViewBeforeV6(id);
    const product=products.find(p=>p.id===Number(id)); if(!product)return;
    const info=document.querySelector('#quickModalContent .quick-modal__info');
    if(!info)return;
    const paragraph=info.querySelector('p');
    if(paragraph) paragraph.textContent=product.description || `${product.unit}. Estoque e valor final sujeitos à confirmação.`;
    if(product.saleMode==='weight') {
      info.querySelector('.quick-modal__price')?.insertAdjacentHTML('beforeend',`<span class="v6-quick-measure">Preço por ${product.measureUnit||'kg'} • mínimo ${formatQty(product,productMin(product))}</span>`);
    }
  };

  document.addEventListener('change',event=>{
    const input=event.target.closest('[data-v6-qty]'); if(!input)return;
    const product=products.find(p=>p.id===Number(input.dataset.v6Qty)); if(!product)return;
    let next=normalizeQty(product,input.value);
    if(next>Number(product.stock||0)){next=Number(product.stock||0);showToast('📦',`Quantidade ajustada para ${formatStock(product)}.`);}
    if(next<productMin(product)){delete state.cart[product.id];}else state.cart[product.id]=next;
    saveCart();renderCart();renderProducts();
  });

  // PWA: instalação opcional no celular/desktop compatível.
  let deferredPrompt=null;
  const installButton=document.querySelector('#installPwaBtn');
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredPrompt=event;if(installButton)installButton.hidden=false;});
  installButton?.addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installButton.hidden=true;});
  window.addEventListener('appinstalled',()=>{if(installButton)installButton.hidden=true;if(typeof showToast==='function')showToast('📲','SC Central instalado com sucesso.');});
  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));

  // Indicador visual da arquitetura final.
  const sync=document.querySelector('#v4SyncChip b');if(sync&&window.SC_V4_ONLINE)sync.textContent='V6 sincronizada';

  renderManagedCategories();
  syncSubstitutionDefault();
  renderProducts();
  renderCart();
})();
