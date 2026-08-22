// ==========================================================
// SC CENTRAL — LIMPEZA VISUAL + COMPORTAMENTO RESPONSIVO
// Mantém os identificadores internos para não quebrar funções.
// ==========================================================
(() => {
  'use strict';

  document.body.classList.add('admin-panel-clean');

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function cleanStaticChrome() {
    const loadingText = $('#adminLoading strong');
    if (loadingText) loadingText.textContent = 'Carregando painel administrativo...';

    const brandText = $('.admin-brand span');
    if (brandText) brandText.innerHTML = 'Painel <b>Administrativo</b>';

    const refresh = $('#refreshBtn');
    if (refresh) refresh.textContent = '↻ Atualizar';

    const technicalInfo = $('#copyServerInfoBtn');
    if (technicalInfo) {
      technicalInfo.hidden = true;
      technicalInfo.classList.add('admin-tech-hidden');
      technicalInfo.setAttribute('aria-hidden', 'true');
      technicalInfo.tabIndex = -1;
    }

    const status = $('#serverStatus');
    if (status) {
      status.classList.add('admin-tech-hidden');
      status.setAttribute('aria-hidden', 'true');
    }

    const sidebarVersion = $('#sidebarVersion');
    if (sidebarVersion) sidebarVersion.remove();

    const callout = $('.v4-callout');
    if (callout) callout.remove();

    const health = $('#healthGrid');
    const healthPanel = health?.closest('.panel');
    if (healthPanel) {
      healthPanel.classList.add('admin-tech-hidden');
      healthPanel.setAttribute('aria-hidden', 'true');
    }

    const operationGrid = $('.dashboard-grid--v4');
    if (operationGrid) operationGrid.classList.add('admin-dashboard-operation-only');

    sanitizeVisibleVersionLabels(document);
  }

  function stripVersion(text) {
    return String(text || '')
      .replace(/\bV6\s*FINAL\b/gi, '')
      .replace(/\bV6\b/gi, '')
      .replace(/\bV4\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([•|–—:-])/g, ' $1')
      .trim();
  }

  function sanitizeVisibleVersionLabels(root) {
    const selectors = [
      '.admin-sidebar',
      '.admin-topbar',
      '.tab-header',
      '.panel-heading',
      '.admin-modal__header',
      '.v6-dialog__head',
      '.v6-dialog__foot'
    ];

    selectors.forEach(selector => {
      $$(selector, root === document ? document : root).forEach(container => {
        const walker = document.createTreeWalker(
          container,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              if (!node.nodeValue || !/\bV(?:4|6)\b|FINAL/i.test(node.nodeValue)) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(node => {
          node.nodeValue = stripVersion(node.nodeValue);
        });
      });
    });

    $$('input', root === document ? document : root).forEach(input => {
      if (/^\s*V6\s*[•\-–—]\s*OFERTA\s*$/i.test(input.value || '')) {
        input.value = 'OFERTA';
      }
    });
  }

  function setupSidebarOverlay() {
    let overlay = $('.admin-mobile-nav-overlay');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'admin-mobile-nav-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      document.body.appendChild(overlay);
    }

    const sidebar = $('#adminSidebar');
    const menu = $('#adminMenu');

    const sync = () => {
      const mobile = window.matchMedia('(max-width: 1100px)').matches;
      const open = mobile && sidebar?.classList.contains('open');
      overlay.classList.toggle('active', Boolean(open));
      overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
      document.body.classList.toggle('admin-nav-open', Boolean(open));
    };

    const close = () => {
      sidebar?.classList.remove('open');
      sync();
    };

    menu?.addEventListener('click', () => requestAnimationFrame(sync));
    overlay.addEventListener('click', close);

    $$('.admin-nav button[data-tab]').forEach(button => {
      button.addEventListener('click', () => {
        if (window.matchMedia('(max-width: 1100px)').matches) close();
      });
    });

    window.addEventListener('resize', () => {
      if (!window.matchMedia('(max-width: 1100px)').matches) close();
      else sync();
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(sync, 120);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
    });
  }

  function markScrollableTables() {
    $$('.data-table-wrap').forEach(wrap => {
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'Tabela com rolagem horizontal');
      wrap.tabIndex = 0;
    });
  }

  function observeDynamicContent() {
    const observer = new MutationObserver(mutations => {
      let shouldClean = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes?.length || mutation.type === 'characterData') {
          shouldClean = true;
          break;
        }
      }

      if (!shouldClean) return;

      sanitizeVisibleVersionLabels(document);

      const health = $('#healthGrid');
      const panel = health?.closest('.panel');
      if (panel) panel.classList.add('admin-tech-hidden');
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true
    });
  }

  cleanStaticChrome();
  setupSidebarOverlay();
  markScrollableTables();
  observeDynamicContent();
})();
