// ==========================================================
// SC CENTRAL — COMPATIBILIDADE RESPONSIVA DO PAINEL
// Complementa admin-v4.js sem alterar regras de negócio.
// ==========================================================
(() => {
  'use strict';

  const BREAKPOINT = 1100;
  const body = document.body;
  const sidebar = document.getElementById('adminSidebar');
  const menu = document.getElementById('adminMenu');
  const overlay = document.getElementById('adminSidebarOverlay');

  body.classList.add('admin-panel-clean', 'admin-compat');

  function isCompact() {
    return window.innerWidth <= BREAKPOINT;
  }

  function closeSidebar() {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('active');
    overlay?.setAttribute('aria-hidden', 'true');
    menu?.setAttribute('aria-expanded', 'false');
    body.classList.remove('sidebar-open', 'admin-nav-open');
  }

  function syncSidebar() {
    if (!isCompact()) {
      closeSidebar();
      return;
    }

    const open = Boolean(sidebar?.classList.contains('open'));
    overlay?.classList.toggle('active', open);
    overlay?.setAttribute('aria-hidden', open ? 'false' : 'true');
    menu?.setAttribute('aria-expanded', open ? 'true' : 'false');
    body.classList.toggle('sidebar-open', open);
  }

  /* Evita divergência entre o breakpoint do JS antigo (900) e o CSS (1100). */
  window.addEventListener('resize', () => {
    clearTimeout(syncSidebar.timer);
    syncSidebar.timer = setTimeout(syncSidebar, 70);
  }, { passive: true });

  window.addEventListener('orientationchange', () => {
    setTimeout(syncSidebar, 120);
  }, { passive: true });

  document.querySelectorAll('.admin-nav button[data-tab]').forEach(button => {
    button.addEventListener('click', () => {
      if (isCompact()) closeSidebar();
    });
  });

  overlay?.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSidebar();
  });

  /* Corrige elementos antigos que podem manter largura mínima indevida. */
  function normalizeDynamicContent(root = document) {
    root.querySelectorAll(
      '.panel,.table-card,.health-item,.kpi-card,.order-card,.order-card-v4,' +
      '.v6-category-card,.v6-customer-card,.user-card-v4'
    ).forEach(node => {
      node.style.minWidth = '0';
    });

    root.querySelectorAll('.data-table-wrap').forEach(wrap => {
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'Tabela com rolagem horizontal');
      if (!wrap.hasAttribute('tabindex')) wrap.tabIndex = 0;
    });
  }

  normalizeDynamicContent();

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          normalizeDynamicContent(node);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  syncSidebar();
})();
