// ==========================================================
// PAINEL ADMINISTRATIVO - SUPERMERCADO SC CENTRAL
// Catálogo, pedidos, clientes, usuários, relatórios e configurações.
// ==========================================================

(() => {
  const ROLE_LEVEL = { attendant:1, manager:2, admin:3 };
  const STATUS_LABEL = {
    novo:'Novo', confirmado:'Confirmado', separando:'Em separação', pronto:'Pronto',
    saiu_entrega:'Saiu para entrega', concluido:'Concluído', cancelado:'Cancelado'
  };
  const ACTION_LABEL = {
    login:'Login', logout:'Logout', create:'Cadastro', update:'Alteração', delete:'Exclusão',
    deactivate:'Desativação', status_update:'Status de pedido', export:'Exportação', change_password:'Senha alterada'
  };

  const state = {
    user:null,
    activeTab:'dashboard',
    bootstrap:null,
    products:[], categories:[], banners:[], coupons:{}, regions:[], settings:{},
    orders:[], users:[], audit:[], dashboard:null, storage:null,
    imageData:'',
    modalContext:null
  };

  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const e = {
    loading:$('#adminLoading'), sidebar:$('#adminSidebar'), sidebarOverlay:$('#adminSidebarOverlay'), backdrop:$('#adminBackdrop'), modal:$('#adminModal'),
    modalBody:$('#modalBody'), modalTitle:$('#modalTitle'), modalEyebrow:$('#modalEyebrow'), modalClose:$('#modalClose'),
    pageTitle:$('#pageTitle'), toast:$('#adminToast'), menu:$('#adminMenu'),
    userMenu:$('#userMenu'), userMenuBtn:$('#userMenuBtn'), userName:$('#userName'), userRole:$('#userRole'), userInitial:$('#userInitial'),
    serverStatus:$('#serverStatus'), ordersBadge:$('#ordersBadge'),
    kpiGrid:$('#kpiGrid'), categoryBars:$('#categoryBars'), dashboardOrders:$('#dashboardOrders'), statusOverview:$('#statusOverview'), healthGrid:$('#healthGrid'),
    productSearch:$('#productSearch'), productCategoryFilter:$('#productCategoryFilter'), productStatusFilter:$('#productStatusFilter'), productsTableBody:$('#productsTableBody'),
    bannerAdminGrid:$('#bannerAdminGrid'), couponAdminGrid:$('#couponAdminGrid'), deliveryTableBody:$('#deliveryTableBody'),
    orderSearch:$('#orderSearch'), orderStatusFilter:$('#orderStatusFilter'), ordersList:$('#ordersList'),
    usersGrid:$('#usersGrid'), auditList:$('#auditList'), settingsForm:$('#settingsForm'), imageFile:$('#productImageFile')
  };

  function esc(value='') {
    return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }
  function money(value) { return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value||0)); }
  function dt(value) { try { return new Date(value).toLocaleString('pt-BR'); } catch { return value || ''; } }
  function roleLabel(role) { return ({admin:'Administrador',manager:'Gerente',attendant:'Atendente'})[role] || role; }
  function can(role) { return (ROLE_LEVEL[state.user?.role]||0) >= (ROLE_LEVEL[role]||0); }

  function toast(text) {
    e.toast.textContent = text;
    e.toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => e.toast.classList.remove('show'), 2800);
  }

  async function api(url, options={}) {
    const response = await fetch(url, {
      cache:'no-store',
      headers:{'Content-Type':'application/json', ...(options.headers||{})},
      ...options
    });
    let data={};
    try { data = await response.json(); } catch {}
    if (response.status === 401) {
      location.href = 'login.html';
      throw new Error('Sessão expirada.');
    }
    if (!response.ok || data.ok === false) throw new Error(data.error || `Erro ${response.status}`);
    return data;
  }

  function openModal(title, eyebrow, html, context=null) {
    state.modalContext=context;
    e.modalTitle.textContent=title;
    e.modalEyebrow.textContent=eyebrow;
    e.modalBody.innerHTML=html;
    e.backdrop.classList.add('active');
    e.modal.classList.add('active');
    e.modal.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
  }
  function closeModal() {
    e.backdrop.classList.remove('active');
    e.modal.classList.remove('active');
    e.modal.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
    state.modalContext=null;
    state.imageData='';
  }

  async function checkAuth() {
    try {
      const data=await api('/api/auth/me');
      state.user=data.user;
      e.userName.textContent=state.user.name;
      e.userRole.textContent=roleLabel(state.user.role);
      e.userInitial.textContent=(state.user.name||'U').trim().charAt(0).toUpperCase();
      applyPermissions();
    } catch { return false; }
    return true;
  }

  function applyPermissions() {
    $$('[data-min-role]').forEach(node => {
      const allowed=can(node.dataset.minRole);
      node.style.display=allowed?'':'none';
    });
  }

  async function loadBootstrap() {
    const data=await api('/api/admin/bootstrap');
    state.bootstrap=data;
    state.products=data.products||[];
    state.categories=data.categories||[];
    state.banners=data.banners||[];
    state.coupons=data.coupons||{};
    state.regions=data.neighborhoods||[];
    state.settings=data.settings||{};
    state.storage=data.storage||null;
    renderSettings();
  }

  function switchTab(tab) {
    const button=$(`[data-tab="${tab}"]`);
    if (!button || button.style.display === 'none') tab='dashboard';
    state.activeTab=tab;
    $$('.admin-nav button[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    $$('.admin-tab').forEach(node=>node.classList.toggle('active',node.id===`tab-${tab}`));
    const names={dashboard:'Dashboard',products:'Produtos',categories:'Categorias',import:'Importar produtos',banners:'Banners',coupons:'Cupons',delivery:'Entrega',orders:'Pedidos',customers:'Clientes',reports:'Relatórios',users:'Usuários',audit:'Auditoria',settings:'Configurações'};
    e.pageTitle.textContent=names[tab]||'Painel';
    e.sidebar.classList.remove('open');
    e.sidebarOverlay?.classList.remove('active');
    e.menu?.setAttribute('aria-expanded','false');
    document.body.classList.remove('sidebar-open');
    renderTab(tab).catch(err=>toast(err.message));
  }

  async function renderTab(tab) {
    if (tab==='dashboard') return renderDashboard();
    if (tab==='products') return renderProducts();
    if (tab==='categories') return window.SC_V6_ADMIN?.renderCategories?.();
    if (tab==='import') return window.SC_V6_ADMIN?.renderImport?.();
    if (tab==='banners') return renderBanners();
    if (tab==='coupons') return renderCoupons();
    if (tab==='delivery') return renderRegions();
    if (tab==='orders') return loadOrders();
    if (tab==='customers') return window.SC_V6_ADMIN?.renderCustomers?.();
    if (tab==='reports') return window.SC_V6_ADMIN?.renderReports?.();
    if (tab==='users') return loadUsers();
    if (tab==='audit') return loadAudit();
    if (tab==='settings') return renderSettings();
  }

  async function renderDashboard() {
    const [data, health]=await Promise.all([api('/api/admin/dashboard'),api('/api/health')]);
    state.dashboard=data;
    const s=data.stats;
    const kpis=[
      ['📦','Produtos cadastrados',s.products,`${s.inStock} em estoque`],
      ['⚠️','Estoque baixo',s.lowStock,'até 8 unidades'],
      ['📋','Pedidos abertos',s.openOrders,`${s.orders} pedidos no total`],
      ['💰','Total em pedidos',money(s.sales),'valor estimado registrado']
    ];
    e.kpiGrid.innerHTML=kpis.map(k=>`<article class="kpi-card"><div class="kpi-card__top"><small>${k[1]}</small><div class="kpi-card__icon">${k[0]}</div></div><strong>${k[2]}</strong><b>${k[3]}</b></article>`).join('');

    const max=Math.max(1,...data.categories.map(c=>Number(c.count)));
    e.categoryBars.innerHTML=data.categories.map(c=>`<div class="category-bar__row"><strong>${esc(c.category)}</strong><div class="category-bar__track"><span style="width:${Number(c.count)/max*100}%"></span></div><b>${c.count}</b></div>`).join('') || '<p>Nenhuma categoria.</p>';

    e.dashboardOrders.innerHTML=data.recentOrders.map(o=>`<div class="mini-order" data-open-order="${esc(o.id)}"><div><strong>${esc(o.id)} • ${esc(o.customer_name)}</strong><small>${dt(o.created_at)} • ${esc(o.method)}</small></div><b>${money(o.total)}</b></div>`).join('') || '<div class="mini-order"><div><strong>Nenhum pedido ainda</strong><small>Os pedidos do site aparecerão aqui.</small></div></div>';

    e.statusOverview.innerHTML=data.byStatus.map(row=>`<div class="status-card"><span>${STATUS_LABEL[row.status]||esc(row.status)}</span><strong>${row.count}</strong></div>`).join('') || '<p>Nenhum pedido.</p>';
    const storage=health.storage||state.storage||{};
    const persistent=storage.persistent!==false;
    const updatedAt = health.time ? dt(health.time) : 'Agora';
    e.healthGrid.innerHTML=`
      <div class="health-item"><div><strong>Sistema</strong><small>Última verificação: ${esc(updatedAt)}</small></div><b>ONLINE</b></div>
      <div class="health-item ${persistent?'':'storage-alert'}"><div><strong>Armazenamento</strong><small>${persistent?'Cadastros e configurações protegidos':'ATENÇÃO: armazenamento temporário'}</small></div><b>${persistent?'PROTEGIDO':'ATENÇÃO'}</b></div>
      <div class="health-item"><div><strong>Loja online</strong><small>Catálogo e painel conectados</small></div><b>ATIVA</b></div>`;
    if(!persistent && !renderDashboard.storageWarned){toast('ATENÇÃO: o Railway está sem Volume persistente. Cadastros e configurações foram bloqueados para evitar perda de dados.');renderDashboard.storageWarned=true;}
    e.ordersBadge.textContent=s.openOrders;
  }

  function productCategories() { const managed=state.categories.filter(c=>c.active!==false).map(c=>c.slug||c.name.toLowerCase()); return [...new Set([...managed,...state.products.map(p=>p.category).filter(Boolean)])].sort(); }
  function productThumb(p) { return p.image ? `<img src="${esc(p.image)}" alt="" onerror="this.remove()">` : esc(p.emoji||'🛒'); }
  function stockText(p) {
    const value=Number(p.stock||0); const unit=p.measureUnit||'un';
    const text=Number.isInteger(value)?String(value):value.toLocaleString('pt-BR',{maximumFractionDigits:3});
    return `${text} ${unit==='un'?'un.':unit}`;
  }
  function renderProducts() {
    const current=e.productCategoryFilter.value;
    e.productCategoryFilter.innerHTML='<option value="todos">Todas as categorias</option>'+productCategories().map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    e.productCategoryFilter.value=[...e.productCategoryFilter.options].some(o=>o.value===current)?current:'todos';
    const term=(e.productSearch.value||'').toLowerCase(); const cat=e.productCategoryFilter.value; const status=e.productStatusFilter.value;
    const list=state.products.filter(p=>{const search=!term||p.name.toLowerCase().includes(term)||p.category.toLowerCase().includes(term)||String(p.sku||'').toLowerCase().includes(term)||String(p.barcode||'').includes(term);const category=cat==='todos'||p.category===cat;const st=status==='todos'||(status==='ativos'&&p.active)||(status==='sem-estoque'&&Number(p.stock)<=0)||(status==='baixo'&&Number(p.stock)>0&&Number(p.stock)<=8);return search&&category&&st;});
    e.productsTableBody.innerHTML=list.map(p=>`<tr>
      <td><div class="product-cell"><div class="product-thumb">${productThumb(p)}</div><div><strong>${esc(p.name)}</strong><small>${esc(p.unit)}${p.subcategory?` • ${esc(p.subcategory)}`:''}</small></div></div></td>
      <td><strong>${esc(p.sku||'—')}</strong>${p.barcode?`<br><small>${esc(p.barcode)}</small>`:''}</td>
      <td>${esc(p.category)}</td>
      <td><span class="status-pill">${p.saleMode==='weight'?`Peso • ${esc(p.measureUnit||'kg')}`:'Unidade'}</span><br><small>passo ${Number(p.quantityStep||1).toLocaleString('pt-BR')}</small></td>
      <td><strong>${money(p.price)}</strong>${p.oldPrice?`<br><small><s>${money(p.oldPrice)}</s></small>`:''}</td>
      <td><span class="status-pill ${Number(p.stock)<=0?'off':Number(p.stock)<=8?'low':''}">${stockText(p)}</span></td>
      <td><span class="status-pill ${p.active?'':'inactive'}">${p.active?'Ativo':'Inativo'}</span></td>
      <td>${p.featured?'⭐ Sim':'—'}</td>
      <td><div class="table-actions"><button class="icon-btn" data-edit-product="${p.id}" title="Editar">✎</button><button class="icon-btn danger" data-delete-product="${p.id}" title="Desativar">×</button></div></td>
    </tr>`).join('') || '<tr><td colspan="9">Nenhum produto encontrado.</td></tr>';
  }

  function productForm(p={}) {
    state.imageData=p.image||'';
    const cats=state.categories.length?state.categories.filter(c=>c.active!==false):productCategories().map((slug,i)=>({slug,name:slug}));
    const categoryOptions=cats.map(c=>`<option value="${esc(c.slug||c.name)}" ${(p.category||'mercearia')===(c.slug||c.name)?'selected':''}>${esc(c.icon||'')} ${esc(c.name)}</option>`).join('');
    return `<form class="modal-form-v4 modal-form-v6" id="productForm">
      <label class="full"><span>Nome do produto</span><input name="name" required value="${esc(p.name||'')}"></label>
      <label><span>SKU / código interno</span><input name="sku" value="${esc(p.sku||'')}"></label>
      <label><span>Código de barras</span><input name="barcode" value="${esc(p.barcode||'')}"></label>
      <label><span>Categoria</span><select name="category" required>${categoryOptions}</select></label>
      <label><span>Subcategoria</span><input name="subcategory" value="${esc(p.subcategory||'')}"></label>
      <label class="full"><span>Descrição</span><textarea name="description" rows="3">${esc(p.description||'')}</textarea></label>
      <label><span>Apresentação</span><input name="unit" value="${esc(p.unit||'')}"></label>
      <label><span>Modo de venda</span><select name="saleMode" id="productSaleMode"><option value="unit" ${p.saleMode!=='weight'?'selected':''}>Por unidade</option><option value="weight" ${p.saleMode==='weight'?'selected':''}>Por peso/medida</option></select></label>
      <label><span>Unidade de medida</span><select name="measureUnit"><option value="un" ${p.measureUnit==='un'||!p.measureUnit?'selected':''}>un</option><option value="kg" ${p.measureUnit==='kg'?'selected':''}>kg</option><option value="g" ${p.measureUnit==='g'?'selected':''}>g</option><option value="l" ${p.measureUnit==='l'?'selected':''}>L</option><option value="ml" ${p.measureUnit==='ml'?'selected':''}>ml</option></select></label>
      <label><span>Incremento da quantidade</span><input name="quantityStep" type="number" min="0.001" step="0.001" value="${p.quantityStep??1}"></label>
      <label><span>Quantidade mínima</span><input name="minQuantity" type="number" min="0.001" step="0.001" value="${p.minQuantity??1}"></label>
      <label><span>Preço atual</span><input name="price" type="number" min="0" step="0.01" required value="${p.price??''}"></label>
      <label><span>Preço anterior</span><input name="oldPrice" type="number" min="0" step="0.01" value="${p.oldPrice??''}"></label>
      <label><span>Início da promoção</span><input name="promoStart" type="datetime-local" value="${esc((p.promoStart||'').slice(0,16))}"></label>
      <label><span>Fim da promoção</span><input name="promoEnd" type="datetime-local" value="${esc((p.promoEnd||'').slice(0,16))}"></label>
      <label><span>Estoque disponível</span><input name="stock" type="number" min="0" step="0.001" value="${p.stock??0}"></label>
      <label><span>Ordem no catálogo</span><input name="sortOrder" type="number" step="1" value="${p.sortOrder??0}"></label>
      <label><span>Badge</span><input name="badge" value="${esc(p.badge||'')}"></label>
      <label><span>Emoji fallback</span><input name="emoji" value="${esc(p.emoji||'🛒')}"></label>
      <label class="full"><span>URL da imagem</span><input name="image" id="productImageUrl" value="${esc(p.image||'')}" placeholder="https://... ou faça upload abaixo"></label>
      <div class="image-tools-v4"><button type="button" id="chooseImageBtn">Enviar imagem do computador</button><button type="button" id="clearImageBtn">Remover imagem</button></div>
      <div class="image-preview-v4" id="productImagePreview">${p.image?`<img src="${esc(p.image)}" alt="">`:'Prévia da imagem'}</div>
      <label class="modal-check"><input type="checkbox" name="featured" ${p.featured?'checked':''}> <span>Produto em destaque</span></label>
      <label class="modal-check"><input type="checkbox" name="active" ${p.active===false?'':'checked'}> <span>Produto ativo</span></label>
      <div class="modal-actions-v4"><button type="button" class="btn-secondary" data-close-modal>Cancelar</button><button type="submit" class="btn-primary">Salvar produto</button></div>
    </form>`;
  }

  async function persistProductImage(image) {
    if (!String(image||'').startsWith('data:image/')) return image || '';
    const result=await api('/api/admin/uploads/image',{method:'POST',body:JSON.stringify({dataUrl:image})});
    return result.url;
  }
  function bindProductForm(id=null) {
    const form=$('#productForm'); const imageUrl=$('#productImageUrl'); const preview=$('#productImagePreview');
    $('#chooseImageBtn')?.addEventListener('click',()=>e.imageFile.click());
    $('#clearImageBtn')?.addEventListener('click',()=>{state.imageData='';imageUrl.value='';preview.textContent='Prévia da imagem';});
    imageUrl?.addEventListener('input',()=>{state.imageData=imageUrl.value.trim();preview.innerHTML=state.imageData?`<img src="${esc(state.imageData)}" alt="">`:'Prévia da imagem';});
    e.imageFile.onchange=()=>{const file=e.imageFile.files?.[0];if(!file)return;if(file.size>2*1024*1024){toast('Imagem muito grande. Use até 2 MB.');e.imageFile.value='';return;}const reader=new FileReader();reader.onload=()=>{state.imageData=String(reader.result);imageUrl.value='';preview.innerHTML=`<img src="${state.imageData}" alt="">`;};reader.readAsDataURL(file);};
    form.addEventListener('submit',async ev=>{
      ev.preventDefault();const fd=new FormData(form);const submit=form.querySelector('[type="submit"]');const old=submit.textContent;submit.disabled=true;submit.textContent='Salvando...';
      try {
        const image=await persistProductImage(state.imageData||String(fd.get('image')||''));
        const payload={name:fd.get('name'),sku:fd.get('sku'),barcode:fd.get('barcode'),category:fd.get('category'),subcategory:fd.get('subcategory'),description:fd.get('description'),unit:fd.get('unit'),saleMode:fd.get('saleMode'),measureUnit:fd.get('measureUnit'),quantityStep:Number(fd.get('quantityStep')||1),minQuantity:Number(fd.get('minQuantity')||1),price:Number(fd.get('price')||0),oldPrice:fd.get('oldPrice')===''?null:Number(fd.get('oldPrice')),promoStart:fd.get('promoStart'),promoEnd:fd.get('promoEnd'),stock:Number(fd.get('stock')||0),sortOrder:Number(fd.get('sortOrder')||0),badge:fd.get('badge'),emoji:fd.get('emoji'),image,featured:fd.get('featured')==='on',active:fd.get('active')==='on'};
        await api(id?`/api/admin/products/${id}`:'/api/admin/products',{method:id?'PUT':'POST',body:JSON.stringify(payload)});toast(id?'Produto atualizado.':'Produto cadastrado.');closeModal();await loadBootstrap();renderProducts();renderDashboard();
      } finally { submit.disabled=false;submit.textContent=old; }
    });
  }

  function openProduct(id=null){const p=id?state.products.find(x=>x.id===Number(id)):null;openModal(p?'Editar produto':'Novo produto','CATÁLOGO',productForm(p||{}),{type:'product',id});bindProductForm(id);}

  function renderBanners(){
    e.bannerAdminGrid.innerHTML=state.banners.map(b=>`<article class="banner-admin-card">${b.image?`<img src="${esc(b.image)}" alt="" onerror="this.remove()">`:''}<small>${esc(b.eyebrow||'BANNER')}</small><strong>${esc(b.title)}</strong><p>${esc(b.text||'')}</p><div class="card-actions"><button data-edit-banner="${b.id}">Editar</button><button data-toggle-banner="${b.id}">${b.active?'Desativar':'Ativar'}</button><button data-delete-banner="${b.id}">Excluir</button></div></article>`).join('')||'<p>Nenhum banner.</p>';
  }
  function bannerForm(b={}){return `<form class="modal-form-v4" id="bannerForm"><label class="full"><span>Título</span><input name="title" required value="${esc(b.title||'')}"></label><label class="full"><span>Chamada superior</span><input name="eyebrow" value="${esc(b.eyebrow||'OFERTA')}"></label><label class="full"><span>Texto</span><textarea name="text" rows="3">${esc(b.text||'')}</textarea></label><label><span>Texto do botão</span><input name="button" value="${esc(b.button||'Ver produtos')}"></label><label><span>Destino</span><input name="target" value="${esc(b.target||'#produtos')}"></label><label><span>Ícone</span><input name="icon" value="${esc(b.icon||'🛒')}"></label><label><span>Tema</span><select name="theme"><option value="blue" ${b.theme==='blue'?'selected':''}>Azul</option><option value="fresh" ${b.theme==='fresh'?'selected':''}>Fresco</option><option value="dark" ${b.theme==='dark'?'selected':''}>Escuro</option></select></label><label class="full"><span>Imagem / URL</span><input name="image" value="${esc(b.image||'')}"></label><label><span>Ordem</span><input name="sortOrder" type="number" value="${b.sortOrder??0}"></label><label class="modal-check"><input type="checkbox" name="active" ${b.active===false?'':'checked'}><span>Ativo</span></label><div class="modal-actions-v4"><button type="button" class="btn-secondary" data-close-modal>Cancelar</button><button type="submit" class="btn-primary">Salvar banner</button></div></form>`;}
  function openBanner(id=null){const b=id?state.banners.find(x=>x.id===Number(id)):null;openModal(b?'Editar banner':'Novo banner','CAMPANHA',bannerForm(b||{}));$('#bannerForm').addEventListener('submit',async ev=>{ev.preventDefault();const fd=new FormData(ev.currentTarget);const payload={title:fd.get('title'),eyebrow:fd.get('eyebrow'),text:fd.get('text'),button:fd.get('button'),target:fd.get('target'),icon:fd.get('icon'),theme:fd.get('theme'),image:fd.get('image'),sortOrder:Number(fd.get('sortOrder')||0),active:fd.get('active')==='on'};await api(id?`/api/admin/banners/${id}`:'/api/admin/banners',{method:id?'PUT':'POST',body:JSON.stringify(payload)});toast('Banner salvo.');closeModal();await loadBootstrap();renderBanners();});}

  function renderCoupons(){e.couponAdminGrid.innerHTML=Object.entries(state.coupons).map(([code,c])=>`<article class="coupon-card"><strong>${esc(code)}</strong><span>${esc(c.label||'')}</span><span>${c.type==='percent'?`${c.value}%`:money(c.value)} • mínimo ${money(c.minimumOrder||0)} • ${c.active?'Ativo':'Inativo'}</span><div class="card-actions"><button data-edit-coupon="${esc(code)}">Editar</button><button data-toggle-coupon="${esc(code)}">${c.active?'Desativar':'Ativar'}</button><button data-delete-coupon="${esc(code)}">Excluir</button></div></article>`).join('')||'<p>Nenhum cupom.</p>';}
  function couponForm(code='',c={}){return `<form class="modal-form-v4" id="couponForm"><label><span>Código</span><input name="code" required ${code?'disabled':''} value="${esc(code)}"></label><label><span>Tipo</span><select name="type"><option value="percent" ${c.type==='percent'?'selected':''}>Percentual</option><option value="fixed" ${c.type==='fixed'?'selected':''}>Valor fixo</option></select></label><label><span>Valor</span><input name="value" type="number" min="0" step="0.01" required value="${c.value??''}"></label><label><span>Pedido mínimo</span><input name="minimumOrder" type="number" min="0" step="0.01" value="${c.minimumOrder??0}"></label><label class="full"><span>Descrição</span><input name="label" value="${esc(c.label||'')}"></label><label class="modal-check"><input type="checkbox" name="active" ${c.active===false?'':'checked'}><span>Ativo</span></label><div class="modal-actions-v4"><button type="button" class="btn-secondary" data-close-modal>Cancelar</button><button type="submit" class="btn-primary">Salvar cupom</button></div></form>`;}
  function openCoupon(code=''){const c=code?state.coupons[code]:null;openModal(code?'Editar cupom':'Novo cupom','PROMOÇÃO',couponForm(code,c||{}));$('#couponForm').addEventListener('submit',async ev=>{ev.preventDefault();const fd=new FormData(ev.currentTarget);const payload={code:code||String(fd.get('code')).toUpperCase(),type:fd.get('type'),value:Number(fd.get('value')||0),minimumOrder:Number(fd.get('minimumOrder')||0),label:fd.get('label'),active:fd.get('active')==='on'};await api(code?`/api/admin/coupons/${encodeURIComponent(code)}`:'/api/admin/coupons',{method:code?'PUT':'POST',body:JSON.stringify(payload)});toast('Cupom salvo.');closeModal();await loadBootstrap();renderCoupons();});}

  function renderRegions(){e.deliveryTableBody.innerHTML=state.regions.map(r=>`<tr><td><strong>${esc(r.name)}</strong></td><td>${money(r.fee)}</td><td>${money(r.minimum)}</td><td><span class="status-pill ${r.active?'':'off'}">${r.active?'Ativo':'Inativo'}</span></td><td><div class="table-actions"><button class="icon-btn" data-edit-region="${r.id}">✎</button><button class="icon-btn danger" data-delete-region="${r.id}">×</button></div></td></tr>`).join('')||'<tr><td colspan="5">Nenhuma região.</td></tr>';}
  function regionForm(r={}){return `<form class="modal-form-v4" id="regionForm"><label class="full"><span>Nome da região / bairro</span><input name="name" required value="${esc(r.name||'')}"></label><label><span>Taxa de entrega</span><input name="fee" type="number" min="0" step="0.01" value="${r.fee??0}"></label><label><span>Pedido mínimo</span><input name="minimum" type="number" min="0" step="0.01" value="${r.minimum??0}"></label><label class="modal-check"><input type="checkbox" name="active" ${r.active===false?'':'checked'}><span>Região ativa</span></label><div class="modal-actions-v4"><button type="button" class="btn-secondary" data-close-modal>Cancelar</button><button type="submit" class="btn-primary">Salvar região</button></div></form>`;}
  function openRegion(id=null){const r=id?state.regions.find(x=>x.id===Number(id)):null;openModal(r?'Editar região':'Nova região','LOGÍSTICA',regionForm(r||{}));$('#regionForm').addEventListener('submit',async ev=>{ev.preventDefault();const fd=new FormData(ev.currentTarget);const payload={name:fd.get('name'),fee:Number(fd.get('fee')||0),minimum:Number(fd.get('minimum')||0),active:fd.get('active')==='on'};await api(id?`/api/admin/regions/${id}`:'/api/admin/regions',{method:id?'PUT':'POST',body:JSON.stringify(payload)});toast('Região salva.');closeModal();await loadBootstrap();renderRegions();});}

  async function loadOrders(){
    const status=e.orderStatusFilter.value||'todos'; const q=e.orderSearch.value.trim();
    const data=await api(`/api/admin/orders?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`); state.orders=data.orders;
    e.ordersList.innerHTML=state.orders.map(o=>`<article class="order-card-v4"><div class="order-card-v4__main"><strong>${esc(o.id)} • ${esc(o.customer)}</strong><span>${esc(o.phone)} • ${esc(o.method)}${o.regionName?` • ${esc(o.regionName)}`:''}</span><small>${dt(o.createdAt)}</small></div><div class="order-card-v4__meta"><strong>${money(o.total)}</strong><span>${STATUS_LABEL[o.status]||esc(o.status)}</span><b class="order-status-pill ${o.status}">${STATUS_LABEL[o.status]||esc(o.status)}</b></div><div class="order-card-v4__actions"><button data-view-order="${esc(o.id)}">Abrir pedido</button></div></article>`).join('')||'<div class="panel"><p>Nenhum pedido encontrado.</p></div>';
    const open=state.orders.filter(o=>!['concluido','cancelado'].includes(o.status)).length; e.ordersBadge.textContent=open;
  }

  async function openOrder(id){
    const data=await api(`/api/admin/orders/${encodeURIComponent(id)}`); const o=data.order;
    const timeline=[...o.events].reverse().map(ev=>`<div class="order-event-v4"><strong>${STATUS_LABEL[ev.status]||esc(ev.status)}</strong><small>${dt(ev.createdAt)}${ev.userName?` • ${esc(ev.userName)}`:''}</small>${ev.note?`<p>${esc(ev.note)}</p>`:''}</div>`).join('');
    openModal(`Pedido ${o.id}`,'CENTRAL DE PEDIDOS',`<div class="order-detail-v4"><div class="order-detail-head"><div><strong>${esc(o.customer)}</strong><small>${esc(o.phone)} • ${dt(o.createdAt)}</small></div><span class="order-status-pill ${o.status}">${STATUS_LABEL[o.status]||o.status}</span></div><div class="order-detail-grid"><div class="order-detail-block"><span>Recebimento</span><strong>${esc(o.method)}${o.regionName?` • ${esc(o.regionName)}`:''}</strong></div><div class="order-detail-block"><span>Pagamento</span><strong>${esc(o.payment||'A combinar')}</strong></div><div class="order-detail-block"><span>Endereço</span><strong>${esc(o.address||'Retirada na loja')}</strong></div><div class="order-detail-block"><span>Total</span><strong>${money(o.total)} • taxa ${money(o.deliveryFee)}</strong></div></div><div class="order-items-v4">${o.items.map(i=>`<div class="order-item-v4"><span>${i.qty}x ${esc(i.name)} • ${esc(i.unit)}</span><b>${money(i.price*i.qty)}</b></div>`).join('')}</div><div class="order-detail-block"><span>Substituição</span><strong>${({contact:'Entrar em contato',equivalent:'Pode substituir por equivalente',none:'Não substituir'})[o.substitutionPreference]||esc(o.substitutionPreference||'Entrar em contato')}</strong></div>${o.notes?`<div class="order-detail-block"><span>Observações</span><strong>${esc(o.notes)}</strong></div>`:''}<div class="status-editor-v4"><label><span>Novo status</span><select id="orderNewStatus">${Object.entries(STATUS_LABEL).map(([value,label])=>`<option value="${value}" ${o.status===value?'selected':''}>${label}</option>`).join('')}</select></label><label><span>Observação da atualização</span><input id="orderStatusNote" placeholder="Ex.: pedido separado com sucesso"></label><button id="saveOrderStatus">Atualizar status</button></div><div class="order-events-v4"><strong>Histórico</strong>${timeline}</div></div>`,{type:'order',id:o.id});
    $('#saveOrderStatus').addEventListener('click',async()=>{const status=$('#orderNewStatus').value,note=$('#orderStatusNote').value;await api(`/api/admin/orders/${encodeURIComponent(o.id)}/status`,{method:'PUT',body:JSON.stringify({status,note})});toast('Status do pedido atualizado.');closeModal();await loadOrders();renderDashboard();await loadBootstrap();});
  }

  async function loadUsers(){const data=await api('/api/admin/users');state.users=data.users;e.usersGrid.innerHTML=state.users.map(u=>`<article class="user-card-v4"><div class="user-card-v4__head"><div class="user-card-v4__avatar">${esc(u.name.charAt(0).toUpperCase())}</div><div><strong>${esc(u.name)}</strong><small>@${esc(u.username)} • ${u.active?'ativo':'inativo'}</small></div></div><span class="role-pill ${u.role}">${roleLabel(u.role)}</span><div class="user-card-v4__actions"><button data-edit-user="${u.id}">Editar</button><button data-disable-user="${u.id}">${u.active?'Desativar':'Inativo'}</button></div></article>`).join('')||'<p>Nenhum usuário.</p>';}
  function userForm(u={}){return `<form class="modal-form-v4" id="userForm"><label class="full"><span>Nome</span><input name="name" required value="${esc(u.name||'')}"></label><label><span>Usuário</span><input name="username" required value="${esc(u.username||'')}"></label><label><span>Nível de acesso</span><select name="role"><option value="attendant" ${u.role==='attendant'?'selected':''}>Atendente</option><option value="manager" ${u.role==='manager'?'selected':''}>Gerente</option><option value="admin" ${u.role==='admin'?'selected':''}>Administrador</option></select></label><label class="full"><span>${u.id?'Nova senha (deixe vazio para manter)':'Senha inicial'}</span><input name="password" type="password" ${u.id?'':'required'} minlength="8"></label><label class="modal-check"><input type="checkbox" name="active" ${u.active===false?'':'checked'}><span>Usuário ativo</span></label><div class="modal-actions-v4"><button type="button" class="btn-secondary" data-close-modal>Cancelar</button><button type="submit" class="btn-primary">Salvar usuário</button></div></form>`;}
  function openUser(id=null){const u=id?state.users.find(x=>x.id===Number(id)):null;openModal(u?'Editar usuário':'Novo usuário','ACESSO',userForm(u||{}));$('#userForm').addEventListener('submit',async ev=>{ev.preventDefault();const fd=new FormData(ev.currentTarget);const payload={name:fd.get('name'),username:fd.get('username'),role:fd.get('role'),password:fd.get('password'),active:fd.get('active')==='on'};await api(id?`/api/admin/users/${id}`:'/api/admin/users',{method:id?'PUT':'POST',body:JSON.stringify(payload)});toast('Usuário salvo.');closeModal();await loadUsers();});}

  async function loadAudit(){const data=await api('/api/admin/audit');state.audit=data.logs;e.auditList.innerHTML=state.audit.map(log=>`<div class="audit-row"><strong>${esc(log.userName)}<br><small>@${esc(log.username||'sistema')}</small></strong><span class="audit-action">${ACTION_LABEL[log.action]||esc(log.action)}</span><span>${esc(log.entityType)} ${esc(log.entityId)}${log.details?` • ${esc(log.details)}`:''}</span><small>${dt(log.createdAt)}</small></div>`).join('')||'<p>Nenhum registro.</p>';}

  function renderSettings(){if(!e.settingsForm||!state.settings)return;for(const [key,value] of Object.entries(state.settings)){const field=e.settingsForm.elements[key];if(!field)continue;if(field.type==='checkbox')field.checked=Boolean(value);else field.value=value??'';}}

  function openChangePassword(){openModal('Alterar minha senha','SEGURANÇA',`<form class="modal-form-v4" id="passwordForm"><label class="full"><span>Senha atual</span><input name="currentPassword" type="password" required></label><label class="full"><span>Nova senha</span><input name="newPassword" type="password" minlength="8" required></label><label class="full"><span>Confirmar nova senha</span><input name="confirmPassword" type="password" minlength="8" required></label><div class="modal-actions-v4"><button type="button" class="btn-secondary" data-close-modal>Cancelar</button><button type="submit" class="btn-primary">Alterar senha</button></div></form>`);$('#passwordForm').addEventListener('submit',async ev=>{ev.preventDefault();const fd=new FormData(ev.currentTarget);if(fd.get('newPassword')!==fd.get('confirmPassword'))return toast('As senhas não conferem.');await api('/api/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword:fd.get('currentPassword'),newPassword:fd.get('newPassword')})});alert('Senha alterada. Faça login novamente.');location.href='login.html';});}

  async function exportBackup(){const data=await api('/api/admin/export');const blob=new Blob([JSON.stringify(data.data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`sc-central-v4-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup exportado.');}

  function bindEvents(){
    $$('.admin-nav button[data-tab]').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));
    document.addEventListener('click',ev=>{const go=ev.target.closest('[data-go-tab]');if(go)switchTab(go.dataset.goTab);const close=ev.target.closest('[data-close-modal]');if(close)closeModal();});
    e.menu.addEventListener('click',()=>{
      const open=!e.sidebar.classList.contains('open');
      e.sidebar.classList.toggle('open',open);
      e.sidebarOverlay?.classList.toggle('active',open);
      e.menu.setAttribute('aria-expanded',String(open));
      document.body.classList.toggle('sidebar-open',open);
    });
    e.sidebarOverlay?.addEventListener('click',()=>{
      e.sidebar.classList.remove('open');
      e.sidebarOverlay.classList.remove('active');
      e.menu.setAttribute('aria-expanded','false');
      document.body.classList.remove('sidebar-open');
    });
    e.modalClose.addEventListener('click',closeModal); e.backdrop.addEventListener('click',closeModal);
    e.userMenuBtn.addEventListener('click',()=>e.userMenu.classList.toggle('open'));
    document.addEventListener('click',ev=>{if(!ev.target.closest('.user-menu-wrap'))e.userMenu.classList.remove('open');});
    $('#logoutBtn').addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST',body:'{}'});location.href='login.html';});
    $('#changePasswordBtn').addEventListener('click',openChangePassword);
    $('#refreshBtn').addEventListener('click',async()=>{await loadBootstrap();await renderTab(state.activeTab);toast('Dados sincronizados.');});
    $('#exportBtn').addEventListener('click',exportBackup);
    $('#quickAddProduct').addEventListener('click',()=>openProduct()); $('#addProductBtn').addEventListener('click',()=>openProduct());
    e.productSearch.addEventListener('input',renderProducts);e.productCategoryFilter.addEventListener('change',renderProducts);e.productStatusFilter.addEventListener('change',renderProducts);
    e.productsTableBody.addEventListener('click',async ev=>{const edit=ev.target.closest('[data-edit-product]');if(edit)return openProduct(edit.dataset.editProduct);const del=ev.target.closest('[data-delete-product]');if(del&&confirm('Desativar este produto?')){await api(`/api/admin/products/${del.dataset.deleteProduct}`,{method:'DELETE'});toast('Produto desativado.');await loadBootstrap();renderProducts();}});
    $('#addBannerBtn').addEventListener('click',()=>openBanner()); e.bannerAdminGrid.addEventListener('click',async ev=>{const edit=ev.target.closest('[data-edit-banner]');if(edit)return openBanner(edit.dataset.editBanner);const toggle=ev.target.closest('[data-toggle-banner]');if(toggle){const b=state.banners.find(x=>x.id===Number(toggle.dataset.toggleBanner));await api(`/api/admin/banners/${b.id}`,{method:'PUT',body:JSON.stringify({...b,active:!b.active})});await loadBootstrap();renderBanners();return;}const del=ev.target.closest('[data-delete-banner]');if(del&&confirm('Excluir banner?')){await api(`/api/admin/banners/${del.dataset.deleteBanner}`,{method:'DELETE'});await loadBootstrap();renderBanners();}});
    $('#addCouponBtn').addEventListener('click',()=>openCoupon()); e.couponAdminGrid.addEventListener('click',async ev=>{const edit=ev.target.closest('[data-edit-coupon]');if(edit)return openCoupon(edit.dataset.editCoupon);const toggle=ev.target.closest('[data-toggle-coupon]');if(toggle){const code=toggle.dataset.toggleCoupon,c=state.coupons[code];await api(`/api/admin/coupons/${encodeURIComponent(code)}`,{method:'PUT',body:JSON.stringify({...c,active:!c.active})});await loadBootstrap();renderCoupons();return;}const del=ev.target.closest('[data-delete-coupon]');if(del&&confirm('Excluir cupom?')){await api(`/api/admin/coupons/${encodeURIComponent(del.dataset.deleteCoupon)}`,{method:'DELETE'});await loadBootstrap();renderCoupons();}});
    $('#addNeighborhoodBtn').addEventListener('click',()=>openRegion()); e.deliveryTableBody.addEventListener('click',async ev=>{const edit=ev.target.closest('[data-edit-region]');if(edit)return openRegion(edit.dataset.editRegion);const del=ev.target.closest('[data-delete-region]');if(del&&confirm('Desativar região?')){await api(`/api/admin/regions/${del.dataset.deleteRegion}`,{method:'DELETE'});await loadBootstrap();renderRegions();}});
    e.orderSearch.addEventListener('input',()=>{clearTimeout(loadOrders.t);loadOrders.t=setTimeout(loadOrders,300)});e.orderStatusFilter.addEventListener('change',loadOrders);$('#reloadOrdersBtn').addEventListener('click',loadOrders);e.ordersList.addEventListener('click',ev=>{const btn=ev.target.closest('[data-view-order]');if(btn)openOrder(btn.dataset.viewOrder)});e.dashboardOrders.addEventListener('click',ev=>{const row=ev.target.closest('[data-open-order]');if(row)openOrder(row.dataset.openOrder)});
    $('#addUserBtn').addEventListener('click',()=>openUser());e.usersGrid.addEventListener('click',async ev=>{const edit=ev.target.closest('[data-edit-user]');if(edit)return openUser(edit.dataset.editUser);const disable=ev.target.closest('[data-disable-user]');if(disable&&confirm('Desativar este usuário?')){await api(`/api/admin/users/${disable.dataset.disableUser}`,{method:'DELETE'});toast('Usuário desativado.');await loadUsers();}});
    $('#reloadAuditBtn').addEventListener('click',loadAudit);
    e.settingsForm.addEventListener('submit',async ev=>{ev.preventDefault();const fd=new FormData(ev.currentTarget);const payload={storeName:fd.get('storeName'),whatsapp:String(fd.get('whatsapp')||'').replace(/\D/g,''),cartGoal:Number(fd.get('cartGoal')||0),minimumOrder:Number(fd.get('minimumOrder')||0),freeDeliveryThreshold:Number(fd.get('freeDeliveryThreshold')||0),storeEmail:fd.get('storeEmail'),pwaName:fd.get('pwaName'),defaultSubstitution:fd.get('defaultSubstitution')||'contact',primaryMessage:fd.get('primaryMessage'),openingHours:fd.get('openingHours'),address:fd.get('address'),allowDelivery:fd.get('allowDelivery')==='on',allowPickup:fd.get('allowPickup')==='on'};const data=await api('/api/admin/settings',{method:'PUT',body:JSON.stringify(payload)});state.settings=data.settings;toast('Configurações salvas com sucesso.');});
    document.addEventListener('keydown',ev=>{if(ev.key==='Escape'){
      closeModal();
      e.userMenu.classList.remove('open');
      e.sidebar.classList.remove('open');
      e.sidebarOverlay?.classList.remove('active');
      e.menu?.setAttribute('aria-expanded','false');
      document.body.classList.remove('sidebar-open');
    }});
  }

  window.addEventListener('resize',()=>{
    if(window.innerWidth>900){
      e.sidebar.classList.remove('open');
      e.sidebarOverlay?.classList.remove('active');
      e.menu?.setAttribute('aria-expanded','false');
      document.body.classList.remove('sidebar-open');
    }
  });

  async function init(){
    const ok=await checkAuth(); if(!ok)return;
    bindEvents();
    try{
      await loadBootstrap();
      await renderDashboard();
      e.serverStatus.classList.add('online');
      document.body.classList.remove('admin-v4-loading');
      e.loading.classList.add('hidden');
      setTimeout(()=>e.loading.remove(),500);
    }catch(error){e.serverStatus.classList.add('offline');toast(error.message);document.body.classList.remove('admin-v4-loading');e.loading.classList.add('hidden');}

    // Atualiza número de pedidos abertos periodicamente sem interromper a tela atual.
    setInterval(async()=>{try{const d=await api('/api/admin/dashboard');e.ordersBadge.textContent=d.stats.openOrders;if(state.activeTab==='dashboard')await renderDashboard();}catch{}},30000);
  }

  init();
})();
