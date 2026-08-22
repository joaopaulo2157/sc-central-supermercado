// ==========================================================
// SC CENTRAL — RBAC VISUAL E MATRIZ DE ACESSO
// A segurança real também é validada no backend.
// ==========================================================
(() => {
  'use strict';

  const TAB_ACCESS = {
    admin: new Set([
      'dashboard','products','categories','import','banners','coupons',
      'delivery','orders','customers','reports','users','audit','settings'
    ]),
    editor: new Set([
      'dashboard','products','categories','import','banners','coupons',
      'delivery','orders','customers','reports'
    ]),
    cadastrador: new Set([
      'products','categories','import'
    ])
  };

  const ROLE_LABEL = {
    admin: 'Administrador',
    editor: 'Editor',
    cadastrador: 'Cadastrador'
  };

  const normalizeRole = role => ({
    manager:'editor',
    attendant:'cadastrador'
  })[String(role || '').toLowerCase()] || String(role || '').toLowerCase();

  let currentRole = '';

  async function getCurrentRole() {
    try {
      const response = await fetch('/api/auth/me', {
        cache:'no-store',
        credentials:'same-origin'
      });
      const data = await response.json();
      if (!response.ok || !data?.user) return '';
      return normalizeRole(data.user.role);
    } catch {
      return '';
    }
  }

  function setDisplay(node, allowed) {
    if (!node) return;
    node.style.setProperty('display', allowed ? '' : 'none', allowed ? '' : 'important');
    node.setAttribute('aria-hidden', allowed ? 'false' : 'true');
  }

  function applyRoleVisibility(role) {
    const allowedTabs = TAB_ACCESS[role] || TAB_ACCESS.cadastrador;
    document.body.dataset.adminRole = role;
    document.body.classList.add('admin-rbac-ready');

    document.querySelectorAll('.admin-nav [data-tab]').forEach(button => {
      setDisplay(button, allowedTabs.has(button.dataset.tab));
    });

    const exportBtn = document.getElementById('exportBtn');
    setDisplay(exportBtn, role === 'admin');

    // Cadastrador pode criar e editar produtos, mas não desativar/excluir.
    document.querySelectorAll('[data-delete-product]').forEach(node => {
      setDisplay(node, role !== 'cadastrador');
    });

    // Categoria é visível ao cadastrador para seleção/consulta,
    // mas sua estrutura só pode ser alterada por editor/admin.
    const canManageCategories = role === 'admin' || role === 'editor';
    setDisplay(document.getElementById('v6AddCategoryBtn'), canManageCategories);
    document.querySelectorAll(
      '[data-v6-edit-category],[data-v6-disable-category]'
    ).forEach(node => setDisplay(node, canManageCategories));

    // Se o usuário estiver em uma aba que não pertence ao seu perfil,
    // envia para a primeira área permitida.
    const active = document.querySelector('.admin-nav [data-tab].active');
    if (active && !allowedTabs.has(active.dataset.tab)) {
      const fallback = role === 'cadastrador' ? 'products' : 'dashboard';
      document.querySelector(`.admin-nav [data-tab="${fallback}"]`)?.click();
    }

    const userRole = document.getElementById('userRole');
    if (userRole && ROLE_LABEL[role]) userRole.textContent = ROLE_LABEL[role];
  }

  function injectAccessMatrix() {
    const usersTab = document.getElementById('tab-users');
    if (!usersTab || usersTab.querySelector('.rbac-access-matrix')) return;

    const header = usersTab.querySelector('.tab-header');
    const matrix = document.createElement('section');
    matrix.className = 'rbac-access-matrix';
    matrix.setAttribute('aria-label', 'Matriz de níveis de acesso');
    matrix.innerHTML = `
      <article class="rbac-access-card admin">
        <div class="rbac-access-card__head">
          <strong>Administrador</strong>
          <span class="rbac-access-card__badge">Acesso total</span>
        </div>
        <p>Controla catálogo, operação, pedidos, clientes, relatórios, usuários, auditoria, configurações e backup.</p>
      </article>
      <article class="rbac-access-card editor">
        <div class="rbac-access-card__head">
          <strong>Editor</strong>
          <span class="rbac-access-card__badge">Operação</span>
        </div>
        <p>Edita catálogo, categorias, banners, cupons e entrega; acompanha pedidos, clientes e relatórios. Não administra usuários nem configurações globais.</p>
      </article>
      <article class="rbac-access-card cadastrador">
        <div class="rbac-access-card__head">
          <strong>Cadastrador</strong>
          <span class="rbac-access-card__badge">Catálogo</span>
        </div>
        <p>Cadastra e edita produtos, envia imagens, importa CSV e consulta categorias. Não vê pedidos, clientes, relatórios, campanhas ou configurações.</p>
      </article>`;
    header?.insertAdjacentElement('afterend', matrix);
  }

  function normalizeRoleSelect(root = document) {
    root.querySelectorAll('select[name="role"]').forEach(select => {
      const current = normalizeRole(select.value || 'cadastrador');
      const parent = select.closest('label');

      select.innerHTML = `
        <option value="cadastrador">Cadastrador — somente catálogo</option>
        <option value="editor">Editor — operação comercial</option>
        <option value="admin">Administrador — acesso total</option>`;
      select.value = ['admin','editor','cadastrador'].includes(current)
        ? current
        : 'cadastrador';

      if (parent && !parent.parentElement?.querySelector('.rbac-role-help')) {
        const help = document.createElement('small');
        help.className = 'rbac-role-help';
        help.textContent =
          'Cadastrador: produtos/importação. Editor: operação comercial. Administrador: acesso total, incluindo usuários e configurações.';
        parent.insertAdjacentElement('afterend', help);
      }
    });
  }

  function applyDynamicRules(root = document) {
    normalizeRoleSelect(root);

    if (!currentRole) return;

    if (currentRole === 'cadastrador') {
      root.querySelectorAll('[data-delete-product]').forEach(node => setDisplay(node, false));
    }

    const canManageCategories = currentRole === 'admin' || currentRole === 'editor';
    root.querySelectorAll(
      '[data-v6-edit-category],[data-v6-disable-category]'
    ).forEach(node => setDisplay(node, canManageCategories));
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        if (node.nodeType === Node.ELEMENT_NODE) applyDynamicRules(node);
      }
    }
  });

  async function init() {
    currentRole = await getCurrentRole();
    if (!currentRole) return;

    applyRoleVisibility(currentRole);
    injectAccessMatrix();
    applyDynamicRules(document);

    observer.observe(document.body, {
      childList:true,
      subtree:true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();
