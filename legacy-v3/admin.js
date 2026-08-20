// ==========================================================
// PAINEL ADMINISTRATIVO V3 - SC CENTRAL
// Demonstração 100% funcional em localStorage.
// ==========================================================

(() => {
  const D = window.SC_V3_DEFAULTS;
  const KEYS = {
    products:"scCentralV3Products", settings:"scCentralV3Settings", banners:"scCentralV3Banners",
    neighborhoods:"scCentralV3Neighborhoods", coupons:"scCentralV3Coupons", orders:"scCentralV3Orders"
  };
  const clone = v => JSON.parse(JSON.stringify(v));
  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? clone(fallback); } catch { return clone(fallback); } };
  const save = (key,value) => localStorage.setItem(key,JSON.stringify(value));
  const money = value => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));

  let products = load(KEYS.products,D.products);
  let settings = load(KEYS.settings,D.settings);
  let banners = load(KEYS.banners,D.banners);
  let neighborhoods = load(KEYS.neighborhoods,D.neighborhoods);
  let coupons = load(KEYS.coupons,D.coupons);
  let orders = load(KEYS.orders,[]);
  let activeTab = "dashboard";

  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const e = {
    sidebar:$("#adminSidebar"), menu:$("#adminMenu"), backdrop:$("#adminBackdrop"), modal:$("#adminModal"), modalClose:$("#modalClose"), modalBody:$("#modalBody"), modalTitle:$("#modalTitle"), modalEyebrow:$("#modalEyebrow"),
    pageTitle:$("#pageTitle"), kpiGrid:$("#kpiGrid"), categoryBars:$("#categoryBars"), dashboardOrders:$("#dashboardOrders"),
    productSearch:$("#productSearch"), productCategoryFilter:$("#productCategoryFilter"), productsTableBody:$("#productsTableBody"),
    bannerAdminGrid:$("#bannerAdminGrid"), couponAdminGrid:$("#couponAdminGrid"), deliveryTableBody:$("#deliveryTableBody"), ordersList:$("#ordersList"), settingsForm:$("#settingsForm"), toast:$("#adminToast")
  };

  function toast(text){ e.toast.textContent=text; e.toast.classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>e.toast.classList.remove("show"),2400); }
  function esc(value=""){ return String(value).replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch])); }
  function nextId(list){ return list.length ? Math.max(...list.map(i=>Number(i.id)||0))+1 : 1; }
  function productThumb(p){ return p.image ? `<img src="${esc(p.image)}" alt="" onerror="this.remove()">` : (p.emoji||"🛒"); }

  function switchTab(tab){
    activeTab=tab;
    $$(".admin-nav button").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
    $$(".admin-tab").forEach(node=>node.classList.toggle("active",node.id===`tab-${tab}`));
    const names={dashboard:"Dashboard",products:"Produtos",banners:"Banners",coupons:"Cupons",delivery:"Entrega",orders:"Pedidos",settings:"Configurações"};
    e.pageTitle.textContent=names[tab]||"Painel";
    e.sidebar.classList.remove("open");
    renderAll();
  }

  function renderDashboard(){
    const activeProducts=products.filter(p=>Number(p.stock)>0).length;
    const lowStock=products.filter(p=>Number(p.stock)>0&&Number(p.stock)<=8).length;
    const totalOrders=orders.length;
    const sales=orders.reduce((s,o)=>s+Number(o.total||0),0);
    const kpis=[
      ["📦","Produtos cadastrados",products.length,"Catálogo V3"],
      ["✅","Produtos em estoque",activeProducts,`${lowStock} com estoque baixo`],
      ["📋","Pedidos preparados",totalOrders,"Histórico local"],
      ["💰","Total estimado",money(sales),"Soma dos pedidos"]
    ];
    e.kpiGrid.innerHTML=kpis.map(k=>`<article class="kpi-card"><div class="kpi-card__top"><small>${k[1]}</small><div class="kpi-card__icon">${k[0]}</div></div><strong>${k[2]}</strong><b>${k[3]}</b></article>`).join("");
    const cats={}; products.forEach(p=>cats[p.category]=(cats[p.category]||0)+1); const max=Math.max(1,...Object.values(cats));
    e.categoryBars.innerHTML=Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([cat,count])=>`<div class="category-bar__row"><strong>${esc(cat)}</strong><div class="category-bar__track"><span style="width:${(count/max)*100}%"></span></div><b>${count}</b></div>`).join("");
    e.dashboardOrders.innerHTML=orders.slice(0,6).map(o=>`<div class="mini-order"><div><strong>${esc(o.id)} • ${esc(o.customer||"Cliente")}</strong><small>${new Date(o.date).toLocaleString("pt-BR")} • ${esc(o.method||"")}</small></div><b>${money(o.total)}</b></div>`).join("") || `<div class="mini-order"><div><strong>Nenhum pedido ainda</strong><small>Finalize uma compra na loja para aparecer aqui.</small></div></div>`;
  }

  function categories(){ return [...new Set(products.map(p=>p.category).filter(Boolean))].sort(); }
  function renderProducts(){
    const term=(e.productSearch?.value||"").toLowerCase(); const filter=e.productCategoryFilter?.value||"todos";
    if(e.productCategoryFilter){ const current=e.productCategoryFilter.value; e.productCategoryFilter.innerHTML=`<option value="todos">Todas as categorias</option>`+categories().map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join(""); e.productCategoryFilter.value=[...e.productCategoryFilter.options].some(o=>o.value===current)?current:"todos"; }
    const list=products.filter(p=>(!term||p.name.toLowerCase().includes(term)||p.category.toLowerCase().includes(term))&&(filter==="todos"||p.category===filter));
    e.productsTableBody.innerHTML=list.map(p=>`<tr><td><div class="product-cell"><div class="product-thumb">${productThumb(p)}</div><div><strong>${esc(p.name)}</strong><small>${esc(p.unit)} • ${esc(p.badge||"")}</small></div></div></td><td>${esc(p.category)}</td><td><strong>${money(p.price)}</strong>${p.oldPrice?`<br><small><s>${money(p.oldPrice)}</s></small>`:""}</td><td><span class="status-pill ${Number(p.stock)<=0?"off":""}">${Number(p.stock)} un.</span></td><td>${p.featured?"⭐ Sim":"—"}</td><td><div class="table-actions"><button class="icon-btn" data-edit-product="${p.id}">✎</button><button class="icon-btn danger" data-delete-product="${p.id}">×</button></div></td></tr>`).join("");
  }

  function renderBanners(){ e.bannerAdminGrid.innerHTML=banners.map(b=>`<article class="banner-admin-card">${b.image?`<img src="${esc(b.image)}" alt="" onerror="this.remove()">`:""}<small>${esc(b.eyebrow||"BANNER")}</small><strong>${esc(b.title)}</strong><p>${esc(b.text||"")}</p><div class="card-actions"><button data-edit-banner="${b.id}">Editar</button><button data-toggle-banner="${b.id}">${b.active!==false?"Desativar":"Ativar"}</button><button data-delete-banner="${b.id}">Excluir</button></div></article>`).join("") || "<p>Nenhum banner.</p>"; }
  function renderCoupons(){ e.couponAdminGrid.innerHTML=Object.entries(coupons).map(([code,c])=>`<article class="coupon-card"><strong>${esc(code)}</strong><span>${esc(c.label||"")}</span><span>${c.type==="percent"?`${c.value}%`:money(c.value)} • ${c.active!==false?"Ativo":"Inativo"}</span><div class="card-actions"><button data-edit-coupon="${esc(code)}">Editar</button><button data-toggle-coupon="${esc(code)}">${c.active!==false?"Desativar":"Ativar"}</button><button data-delete-coupon="${esc(code)}">Excluir</button></div></article>`).join("") || "<p>Nenhum cupom.</p>"; }
  function renderDelivery(){ e.deliveryTableBody.innerHTML=neighborhoods.filter(n=>n.name!=="Retirada na loja").map(n=>`<tr><td><strong>${esc(n.name)}</strong></td><td>${money(n.fee)}</td><td>${money(n.minimum)}</td><td><span class="status-pill ${n.active===false?"off":""}">${n.active===false?"Inativo":"Ativo"}</span></td><td><div class="table-actions"><button class="icon-btn" data-edit-neighborhood="${n.id}">✎</button><button class="icon-btn danger" data-delete-neighborhood="${n.id}">×</button></div></td></tr>`).join(""); }
  function renderOrders(){ e.ordersList.innerHTML=orders.map(o=>`<article class="order-card"><div><div class="order-card__top"><strong>${esc(o.id)}</strong><span>${esc(o.status||"Pedido")}</span></div><p><b>${esc(o.customer||"Cliente")}</b> • ${esc(o.phone||"")}<br>${esc(o.method||"")} • ${esc(o.neighborhood||"")} • ${esc(o.payment||"")}<br>${(o.items||[]).map(i=>`${i.qty}x ${esc(i.name)}`).join(" • ")}</p></div><div class="order-card__value"><strong>${money(o.total)}</strong><small>${new Date(o.date).toLocaleString("pt-BR")}</small></div></article>`).join("") || `<div class="panel"><strong>Nenhum pedido registrado.</strong><p>Os pedidos aparecem aqui quando o cliente finaliza pelo checkout V3.</p></div>`; }
  function renderSettings(){ const f=e.settingsForm; if(!f)return; Object.entries(settings).forEach(([key,value])=>{ const input=f.elements[key]; if(!input)return; if(input.type==="checkbox")input.checked=Boolean(value); else input.value=value??""; }); }
  function renderAll(){ renderDashboard(); renderProducts(); renderBanners(); renderCoupons(); renderDelivery(); renderOrders(); renderSettings(); }

  function openModal(title,eyebrow,html){ e.modalTitle.textContent=title; e.modalEyebrow.textContent=eyebrow; e.modalBody.innerHTML=html; e.modal.classList.add("active"); e.backdrop.classList.add("active"); e.modal.setAttribute("aria-hidden","false"); }
  function closeModal(){ e.modal.classList.remove("active"); e.backdrop.classList.remove("active"); e.modal.setAttribute("aria-hidden","true"); }

  function productForm(product={}){ const editing=Boolean(product.id); openModal(editing?"Editar produto":"Novo produto","CATÁLOGO",`<form class="modal-form" id="productForm"><input type="hidden" name="id" value="${product.id||""}"><label class="full"><span>Nome *</span><input name="name" required value="${esc(product.name||"")}"></label><label><span>Categoria *</span><input name="category" required value="${esc(product.category||"mercearia")}"></label><label><span>Unidade</span><input name="unit" value="${esc(product.unit||"Unidade")}"></label><label><span>Preço *</span><input name="price" type="number" min="0" step="0.01" required value="${product.price??""}"></label><label><span>Preço anterior</span><input name="oldPrice" type="number" min="0" step="0.01" value="${product.oldPrice??""}"></label><label><span>Estoque</span><input name="stock" type="number" min="0" step="1" value="${product.stock??0}"></label><label><span>Selo</span><input name="badge" value="${esc(product.badge||"")}" placeholder="OFERTA"></label><label><span>Emoji</span><input name="emoji" value="${esc(product.emoji||"🛒")}"></label><label><span>Destaque</span><select name="featured"><option value="false" ${!product.featured?"selected":""}>Não</option><option value="true" ${product.featured?"selected":""}>Sim</option></select></label><label class="full"><span>URL da foto do produto</span><input name="image" id="productImageUrl" value="${esc(product.image||"")}" placeholder="https://..."></label><label class="full"><span>Ou envie uma foto do computador</span><input type="file" id="productImageFile" accept="image/*"></label><div class="image-preview" id="imagePreview">${product.image?`<img src="${esc(product.image)}" alt="Prévia">`:"A prévia da imagem aparecerá aqui"}</div><div class="modal-form-actions"><button type="button" class="btn-secondary" data-close-modal>Cancelar</button><button class="btn-primary" type="submit">Salvar produto</button></div></form>`); setupImageUpload(); }

  function setupImageUpload(){ const file=$("#productImageFile"), url=$("#productImageUrl"), preview=$("#imagePreview"); const update=()=>{preview.innerHTML=url.value?`<img src="${esc(url.value)}" alt="Prévia" onerror="this.parentElement.textContent='Não foi possível carregar a imagem'">`:"A prévia da imagem aparecerá aqui"}; url?.addEventListener("input",update); file?.addEventListener("change",()=>{const f=file.files?.[0]; if(!f)return; if(f.size>1_500_000){toast("Use uma imagem de até 1,5 MB nesta demonstração.");file.value="";return} const r=new FileReader(); r.onload=()=>{url.value=r.result;update()}; r.readAsDataURL(f)}); }

  function bannerForm(banner={}){ const editing=Boolean(banner.id); openModal(editing?"Editar banner":"Novo banner","CARROSSEL",`<form class="modal-form" id="bannerForm"><input type="hidden" name="id" value="${banner.id||""}"><label class="full"><span>Chamada superior</span><input name="eyebrow" value="${esc(banner.eyebrow||"")}"></label><label class="full"><span>Título *</span><input name="title" required value="${esc(banner.title||"")}"></label><label class="full"><span>Texto</span><textarea name="text" rows="3">${esc(banner.text||"")}</textarea></label><label><span>Texto do botão</span><input name="button" value="${esc(banner.button||"Ver produtos")}"></label><label><span>Destino</span><input name="target" value="${esc(banner.target||"#produtos")}"></label><label><span>Ícone/emoji</span><input name="icon" value="${esc(banner.icon||"🛒")}"></label><label><span>Tema</span><select name="theme"><option value="blue" ${banner.theme==="blue"?"selected":""}>Azul</option><option value="fresh" ${banner.theme==="fresh"?"selected":""}>Verde</option><option value="dark" ${banner.theme==="dark"?"selected":""}>Escuro</option></select></label><label class="full"><span>Imagem de fundo (URL)</span><input name="image" value="${esc(banner.image||"")}"></label><label><span>Status</span><select name="active"><option value="true" ${banner.active!==false?"selected":""}>Ativo</option><option value="false" ${banner.active===false?"selected":""}>Inativo</option></select></label><div class="modal-form-actions"><button type="button" class="btn-secondary" data-close-modal>Cancelar</button><button class="btn-primary">Salvar banner</button></div></form>`); }

  function couponForm(code="",coupon={}){ openModal(code?"Editar cupom":"Novo cupom","PROMOÇÃO",`<form class="modal-form" id="couponForm"><input type="hidden" name="originalCode" value="${esc(code)}"><label class="full"><span>Código *</span><input name="code" required value="${esc(code)}" ${code?"readonly":""} style="text-transform:uppercase"></label><label><span>Tipo</span><select name="type"><option value="percent" ${coupon.type!=="fixed"?"selected":""}>Percentual</option><option value="fixed" ${coupon.type==="fixed"?"selected":""}>Valor fixo</option></select></label><label><span>Valor</span><input name="value" type="number" min="0" step="0.01" required value="${coupon.value??5}"></label><label class="full"><span>Descrição</span><input name="label" value="${esc(coupon.label||"")}" placeholder="5% de desconto"></label><label><span>Status</span><select name="active"><option value="true" ${coupon.active!==false?"selected":""}>Ativo</option><option value="false" ${coupon.active===false?"selected":""}>Inativo</option></select></label><div class="modal-form-actions"><button type="button" class="btn-secondary" data-close-modal>Cancelar</button><button class="btn-primary">Salvar cupom</button></div></form>`); }
  function neighborhoodForm(n={}){ openModal(n.id?"Editar região":"Nova região","ENTREGA",`<form class="modal-form" id="neighborhoodForm"><input type="hidden" name="id" value="${n.id||""}"><label class="full"><span>Bairro / região *</span><input name="name" required value="${esc(n.name||"")}"></label><label><span>Taxa de entrega</span><input name="fee" type="number" min="0" step="0.01" value="${n.fee??0}"></label><label><span>Pedido mínimo</span><input name="minimum" type="number" min="0" step="0.01" value="${n.minimum??0}"></label><label><span>Status</span><select name="active"><option value="true" ${n.active!==false?"selected":""}>Ativo</option><option value="false" ${n.active===false?"selected":""}>Inativo</option></select></label><div class="modal-form-actions"><button type="button" class="btn-secondary" data-close-modal>Cancelar</button><button class="btn-primary">Salvar região</button></div></form>`); }

  document.addEventListener("submit",event=>{
    const form=event.target; if(!["productForm","bannerForm","couponForm","neighborhoodForm"].includes(form.id))return; event.preventDefault(); const data=Object.fromEntries(new FormData(form));
    if(form.id==="productForm"){ const id=data.id?Number(data.id):nextId(products); const item={id,name:data.name.trim(),category:data.category.trim().toLowerCase(),unit:data.unit.trim(),price:Number(data.price),oldPrice:data.oldPrice?Number(data.oldPrice):null,stock:Number(data.stock||0),badge:data.badge.trim(),emoji:data.emoji||"🛒",featured:data.featured==="true",image:data.image.trim()}; const idx=products.findIndex(p=>p.id===id); if(idx>=0)products[idx]=item; else products.push(item); save(KEYS.products,products); toast("Produto salvo."); }
    if(form.id==="bannerForm"){ const id=data.id?Number(data.id):nextId(banners); const item={id,eyebrow:data.eyebrow,title:data.title,text:data.text,button:data.button,target:data.target,icon:data.icon,image:data.image,theme:data.theme,active:data.active==="true"}; const idx=banners.findIndex(b=>b.id===id); if(idx>=0)banners[idx]=item; else banners.push(item); save(KEYS.banners,banners); toast("Banner salvo."); }
    if(form.id==="couponForm"){ const code=data.code.trim().toUpperCase(); coupons[code]={type:data.type,value:Number(data.value),label:data.label||code,active:data.active==="true"}; save(KEYS.coupons,coupons); toast("Cupom salvo."); }
    if(form.id==="neighborhoodForm"){ const id=data.id?Number(data.id):nextId(neighborhoods); const item={id,name:data.name.trim(),fee:Number(data.fee||0),minimum:Number(data.minimum||0),active:data.active==="true"}; const idx=neighborhoods.findIndex(n=>n.id===id); if(idx>=0)neighborhoods[idx]=item; else neighborhoods.push(item); save(KEYS.neighborhoods,neighborhoods); toast("Região salva."); }
    closeModal(); renderAll();
  });

  document.addEventListener("click",event=>{
    const tab=event.target.closest("[data-tab]"); if(tab)switchTab(tab.dataset.tab);
    const go=event.target.closest("[data-go-tab]"); if(go)switchTab(go.dataset.goTab);
    if(event.target.closest("[data-close-modal]"))closeModal();
    const ep=event.target.closest("[data-edit-product]"); if(ep)productForm(products.find(p=>p.id===Number(ep.dataset.editProduct))||{});
    const dp=event.target.closest("[data-delete-product]"); if(dp&&confirm("Excluir este produto?")){products=products.filter(p=>p.id!==Number(dp.dataset.deleteProduct));save(KEYS.products,products);renderAll();toast("Produto excluído.")}
    const eb=event.target.closest("[data-edit-banner]"); if(eb)bannerForm(banners.find(b=>b.id===Number(eb.dataset.editBanner))||{});
    const tb=event.target.closest("[data-toggle-banner]"); if(tb){const b=banners.find(x=>x.id===Number(tb.dataset.toggleBanner));if(b){b.active=b.active===false;save(KEYS.banners,banners);renderBanners()}}
    const db=event.target.closest("[data-delete-banner]"); if(db&&confirm("Excluir este banner?")){banners=banners.filter(b=>b.id!==Number(db.dataset.deleteBanner));save(KEYS.banners,banners);renderBanners()}
    const ec=event.target.closest("[data-edit-coupon]"); if(ec)couponForm(ec.dataset.editCoupon,coupons[ec.dataset.editCoupon]);
    const tc=event.target.closest("[data-toggle-coupon]"); if(tc){coupons[tc.dataset.toggleCoupon].active=coupons[tc.dataset.toggleCoupon].active===false;save(KEYS.coupons,coupons);renderCoupons()}
    const dc=event.target.closest("[data-delete-coupon]"); if(dc&&confirm("Excluir este cupom?")){delete coupons[dc.dataset.deleteCoupon];save(KEYS.coupons,coupons);renderCoupons()}
    const en=event.target.closest("[data-edit-neighborhood]"); if(en)neighborhoodForm(neighborhoods.find(n=>n.id===Number(en.dataset.editNeighborhood))||{});
    const dn=event.target.closest("[data-delete-neighborhood]"); if(dn&&confirm("Excluir esta região?")){neighborhoods=neighborhoods.filter(n=>n.id!==Number(dn.dataset.deleteNeighborhood));save(KEYS.neighborhoods,neighborhoods);renderDelivery()}
  });

  $("#addProductBtn")?.addEventListener("click",()=>productForm()); $("#quickAddProduct")?.addEventListener("click",()=>productForm()); $("#addBannerBtn")?.addEventListener("click",()=>bannerForm()); $("#addCouponBtn")?.addEventListener("click",()=>couponForm()); $("#addNeighborhoodBtn")?.addEventListener("click",()=>neighborhoodForm());
  e.modalClose.addEventListener("click",closeModal); e.backdrop.addEventListener("click",()=>{closeModal();e.sidebar.classList.remove("open")}); e.menu.addEventListener("click",()=>{e.sidebar.classList.toggle("open");e.backdrop.classList.toggle("active",e.sidebar.classList.contains("open"))});
  e.productSearch?.addEventListener("input",renderProducts); e.productCategoryFilter?.addEventListener("change",renderProducts);

  e.settingsForm?.addEventListener("submit",event=>{event.preventDefault();const f=event.currentTarget; settings={storeName:f.storeName.value.trim(),whatsapp:f.whatsapp.value.trim(),cartGoal:Number(f.cartGoal.value||0),minimumOrder:Number(f.minimumOrder.value||0),primaryMessage:f.primaryMessage.value.trim(),openingHours:f.openingHours.value.trim(),address:f.address.value.trim(),allowDelivery:f.allowDelivery.checked,allowPickup:f.allowPickup.checked};save(KEYS.settings,settings);toast("Configurações salvas. Atualize a loja para aplicar.");renderDashboard()});
  $("#clearOrdersBtn")?.addEventListener("click",()=>{if(confirm("Apagar o histórico de pedidos deste navegador?")){orders=[];save(KEYS.orders,orders);renderAll();toast("Histórico limpo.")}});
  $("#resetDataBtn")?.addEventListener("click",()=>{if(!confirm("Restaurar os dados padrão da V3? Produtos, banners, cupons e entrega serão redefinidos."))return; products=clone(D.products);settings=clone(D.settings);banners=clone(D.banners);neighborhoods=clone(D.neighborhoods);coupons=clone(D.coupons);save(KEYS.products,products);save(KEYS.settings,settings);save(KEYS.banners,banners);save(KEYS.neighborhoods,neighborhoods);save(KEYS.coupons,coupons);renderAll();toast("Dados V3 restaurados.")});

  $("#exportBtn")?.addEventListener("click",()=>{const data={exportedAt:new Date().toISOString(),products,settings,banners,neighborhoods,coupons,orders};const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="sc-central-v3-backup.json";a.click();URL.revokeObjectURL(a.href);toast("Backup exportado.")});

  renderAll();
})();
