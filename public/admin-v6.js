// ==========================================================
// SC CENTRAL - ADMIN V6 FINAL
// Categorias, importação CSV, exportação e relatórios.
// ==========================================================
(() => {
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
  const number = v => Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:3});

  async function api(url, options={}) {
    const response = await fetch(url,{cache:'no-store',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
    let data={}; try{data=await response.json();}catch{}
    if(response.status===401){location.href='login.html';throw new Error('Sessão expirada.');}
    if(!response.ok||data.ok===false) throw new Error(data.error||`Erro ${response.status}`);
    return data;
  }

  function notify(text, kind='ok') {
    const old=$('.v6-notice'); if(old) old.remove();
    const n=document.createElement('div');n.className=`v6-notice ${kind}`;n.textContent=text;document.body.appendChild(n);
    requestAnimationFrame(()=>n.classList.add('show'));setTimeout(()=>{n.classList.remove('show');setTimeout(()=>n.remove(),250)},3000);
  }

  function slugify(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}

  function ensureDialog() {
    let d=$('#v6Dialog');
    if(d) return d;
    d=document.createElement('dialog');d.id='v6Dialog';d.className='v6-dialog';document.body.appendChild(d);
    d.addEventListener('click',e=>{if(e.target===d)d.close();});
    return d;
  }

  async function openCategory(id=null) {
    const data=await api('/api/admin/categories');
    const c=id?data.categories.find(x=>x.id===Number(id)):null;
    const d=ensureDialog();
    d.innerHTML=`<form method="dialog" class="v6-dialog__shell" id="v6CategoryForm">
      <div class="v6-dialog__head"><div><small>CATÁLOGO V6</small><h2>${c?'Editar categoria':'Nova categoria'}</h2></div><button value="cancel" aria-label="Fechar">×</button></div>
      <div class="v6-dialog__body">
        <label><span>Nome</span><input name="name" required value="${esc(c?.name||'')}"></label>
        <label><span>Identificador (slug)</span><input name="slug" value="${esc(c?.slug||'')}" placeholder="gerado automaticamente"></label>
        <label><span>Ícone</span><input name="icon" value="${esc(c?.icon||'🛒')}" maxlength="8"></label>
        <label><span>Ordem</span><input name="sortOrder" type="number" value="${c?.sortOrder??0}"></label>
        <label class="full"><span>Descrição</span><textarea name="description" rows="3">${esc(c?.description||'')}</textarea></label>
        <label class="full"><span>Imagem / URL opcional</span><input name="image" value="${esc(c?.image||'')}"></label>
        <label class="v6-check full"><input type="checkbox" name="active" ${c?.active===false?'':'checked'}> Categoria ativa na loja</label>
      </div>
      <div class="v6-dialog__foot"><button value="cancel" class="btn-secondary">Cancelar</button><button type="button" class="btn-primary" id="v6SaveCategory">Salvar categoria</button></div>
    </form>`;
    d.showModal();
    $('#v6SaveCategory').addEventListener('click',async()=>{
      const form=$('#v6CategoryForm');if(!form.reportValidity())return;const fd=new FormData(form);const name=String(fd.get('name')||'').trim();
      const payload={name,slug:String(fd.get('slug')||'').trim()||slugify(name),icon:fd.get('icon'),description:fd.get('description'),image:fd.get('image'),sortOrder:Number(fd.get('sortOrder')||0),active:fd.get('active')==='on'};
      try{await api(id?`/api/admin/categories/${id}`:'/api/admin/categories',{method:id?'PUT':'POST',body:JSON.stringify(payload)});d.close();notify('Categoria salva.');await renderCategories();document.querySelector('#refreshBtn')?.click();}catch(e){notify(e.message,'error');}
    });
  }

  async function renderCategories() {
    const grid=$('#v6CategoriesGrid'); if(!grid)return;
    grid.innerHTML='<div class="v6-loading-card">Carregando categorias...</div>';
    try{
      const data=await api('/api/admin/categories');
      grid.innerHTML=data.categories.map(c=>`<article class="v6-category-card ${c.active?'':'is-off'}">
        <div class="v6-category-card__icon">${esc(c.icon||'🛒')}</div>
        <div class="v6-category-card__copy"><small>${esc(c.slug)}</small><strong>${esc(c.name)}</strong><p>${esc(c.description||'Sem descrição.')}</p><span>${c.active?'Ativa na loja':'Inativa'} • ordem ${c.sortOrder}</span></div>
        <div class="v6-category-card__actions"><button data-v6-edit-category="${c.id}">Editar</button><button data-v6-disable-category="${c.id}" ${!c.active?'disabled':''}>Desativar</button></div>
      </article>`).join('')||'<div class="panel"><p>Nenhuma categoria cadastrada.</p></div>';
    }catch(e){grid.innerHTML=`<div class="panel"><p>${esc(e.message)}</p></div>`;}
  }

  function parseCsv(text) {
    const rows=[];let row=[],field='',quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(ch==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;continue;}
      if(!quoted&&(ch===';'||ch===',')){row.push(field.trim());field='';continue;}
      if(!quoted&&(ch==='\n'||ch==='\r')){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field.trim());field='';if(row.some(Boolean))rows.push(row);row=[];continue;}
      field+=ch;
    }
    if(field||row.length){row.push(field.trim());if(row.some(Boolean))rows.push(row);}
    if(rows.length<2)return[];
    const headers=rows.shift().map(h=>h.replace(/^\uFEFF/,'').trim());
    return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
  }

  function csvEscape(v){const s=String(v??'');return /[;"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
  function download(filename, text, type='text/csv;charset=utf-8'){
    const blob=new Blob(['\uFEFF'+text],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},200);
  }

  async function importCsv() {
    const file=$('#v6CsvFile')?.files?.[0];if(!file)return notify('Selecione um arquivo CSV.','error');
    const result=$('#v6ImportResult');result.textContent='Lendo arquivo...';
    try{
      const rows=parseCsv(await file.text());if(!rows.length)throw new Error('Não foi possível identificar dados no CSV.');
      result.textContent=`${rows.length} linhas encontradas. Importando...`;
      const response=await api('/api/admin/products/import',{method:'POST',body:JSON.stringify({rows})});
      result.innerHTML=`<strong>Importação concluída.</strong><br>${response.created} produtos criados • ${response.updated} atualizados.`;notify('Catálogo importado com sucesso.');document.querySelector('#refreshBtn')?.click();
    }catch(e){result.textContent=e.message;notify(e.message,'error');}
  }

  async function exportCsv() {
    try{
      const data=await api('/api/admin/products');
      const headers=['sku','nome','categoria','subcategoria','unidade','preco','estoque','modo','medida','passo','minimo','codigoBarras','imagem'];
      const lines=[headers.join(';')];
      data.products.forEach(p=>lines.push([p.sku,p.name,p.category,p.subcategory,p.unit,p.price,p.stock,p.saleMode,p.measureUnit,p.quantityStep,p.minQuantity,p.barcode,p.image].map(csvEscape).join(';')));
      download(`sc-central-produtos-${new Date().toISOString().slice(0,10)}.csv`,lines.join('\n'));notify('CSV exportado.');
    }catch(e){notify(e.message,'error');}
  }

  function downloadTemplate() {
    const text='sku;nome;categoria;subcategoria;unidade;preco;estoque;modo;medida;passo;minimo;codigoBarras;imagem\nSC1000;Exemplo Banana;hortifruti;Frutas;Preço por kg;5.99;30;weight;kg;0.5;0.5;;';
    download('modelo-importacao-sc-central.csv',text);
  }

  function renderImport(){/* os controles são estáticos; função existe para o roteador do painel */}


  async function renderCustomers() {
    const grid=$('#v6CustomersGrid'); if(!grid)return;
    const q=String($('#v6CustomerSearch')?.value||'').trim();grid.innerHTML='<div class="v6-loading-card">Carregando clientes...</div>';
    try{const d=await api(`/api/admin/customers?q=${encodeURIComponent(q)}`);grid.innerHTML=d.customers.map(c=>`<article class="v6-customer-card"><div class="v6-customer-avatar">${esc((c.name||'C').charAt(0).toUpperCase())}</div><div><strong>${esc(c.name)}</strong><span>${esc(c.phone)}</span><small>${esc(c.lastRegion||'Sem região')} • ${c.orderCount} pedido(s)</small></div><div class="v6-customer-value"><small>Total em pedidos</small><strong>${money(c.totalSpent)}</strong></div></article>`).join('')||'<div class="panel"><p>Nenhum cliente encontrado.</p></div>';}
    catch(e){grid.innerHTML=`<div class="panel"><p>${esc(e.message)}</p></div>`;}
  }

  function barRows(rows, valueKey, labelKey, formatter=v=>number(v)) {
    const max=Math.max(1,...rows.map(r=>Number(r[valueKey]||0)));
    return rows.map(r=>`<div class="v6-report-row"><div><strong>${esc(r[labelKey]||'Sem informação')}</strong><span>${formatter(r[valueKey])}</span></div><div class="v6-report-track"><i style="width:${Math.max(2,Number(r[valueKey]||0)/max*100)}%"></i></div></div>`).join('')||'<p>Sem dados no período.</p>';
  }

  async function renderReports() {
    const days=Number($('#v6ReportPeriod')?.value||30);const k=$('#v6ReportKpis');if(!k)return;
    k.innerHTML='<article class="kpi-card"><small>Carregando relatório...</small></article>';
    try{
      const d=await api(`/api/admin/reports?days=${days}`);const s=d.summary;
      k.innerHTML=[['📋','Pedidos',s.orders,`${days} dias`],['💰','Valor em pedidos',money(s.revenue),'cancelados excluídos'],['🧾','Ticket médio',money(s.ticket),'por pedido'],['👥','Clientes',s.customers,'telefones únicos']].map(x=>`<article class="kpi-card"><div class="kpi-card__top"><small>${x[1]}</small><div class="kpi-card__icon">${x[0]}</div></div><strong>${x[2]}</strong><b>${x[3]}</b></article>`).join('');
      $('#v6TopProducts').innerHTML=barRows(d.topProducts,'revenue','name',money);
      $('#v6RegionsReport').innerHTML=barRows(d.regions,'orders','region',v=>`${number(v)} pedidos`);
      const max=Math.max(1,...d.daily.map(x=>x.revenue));
      $('#v6DailyChart').innerHTML=d.daily.map(day=>`<div class="v6-day"><div class="v6-day__bar"><i style="height:${Math.max(5,day.revenue/max*100)}%"></i></div><strong>${new Date(day.day+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</strong><span>${money(day.revenue)}</span></div>`).join('')||'<p>Sem pedidos no período.</p>';
    }catch(e){k.innerHTML=`<article class="panel"><p>${esc(e.message)}</p></article>`;}
  }

  window.SC_V6_ADMIN={renderCategories,renderImport,renderReports,renderCustomers};

  document.addEventListener('click',e=>{
    const edit=e.target.closest('[data-v6-edit-category]');if(edit)openCategory(edit.dataset.v6EditCategory);
    const dis=e.target.closest('[data-v6-disable-category]');if(dis&&!dis.disabled){if(confirm('Desativar esta categoria?'))api(`/api/admin/categories/${dis.dataset.v6DisableCategory}`,{method:'DELETE'}).then(()=>{notify('Categoria desativada.');renderCategories()}).catch(err=>notify(err.message,'error'));}
  });
  $('#v6AddCategoryBtn')?.addEventListener('click',()=>openCategory());
  $('#v6ImportCsvBtn')?.addEventListener('click',importCsv);
  $('#v6ExportCsvBtn')?.addEventListener('click',exportCsv);
  $('#v6DownloadTemplateBtn')?.addEventListener('click',downloadTemplate);
  $('#v6ReportPeriod')?.addEventListener('change',renderReports);
  $('#v6ReloadCustomers')?.addEventListener('click',renderCustomers);
  $('#v6CustomerSearch')?.addEventListener('input',()=>{clearTimeout(renderCustomers.timer);renderCustomers.timer=setTimeout(renderCustomers,250);});
})();
