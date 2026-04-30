/* =========================================================
 * console-panel.js — Konsol Çıktısı & Filtreler
 * ========================================================= */
(function () {
  'use strict';

  const V = window.VFS;

  const CONSOLE_CONFIG = {
    log: { icon: '◦', filterable: true },
    info: { icon: '🛈', filterable: true },
    warn: { icon: '⚠', filterable: true },
    error: { icon: '❌', filterable: true },
    debug: { icon: '🛠', filterable: true },
    trace: { icon: '🔍', filterable: true },
    success: { icon: '✅', filterable: true },
    fatal: { icon: '💀', filterable: true },
    network: { icon: '🌐', filterable: true },
    performance: { icon: '⚡', filterable: true },
    security: { icon: '🔒', filterable: true },
    table: { icon: '📊', filterable: false },
    assert: { icon: '❗', filterable: false },
    group: { icon: '📂', filterable: false },
    'group-end': { icon: '📁', filterable: false },
  };

  const FILTERABLE_LEVELS = Object.entries(CONSOLE_CONFIG).filter(([, v]) => v.filterable).map(([k]) => k);
  const consoleFilters = new Set(FILTERABLE_LEVELS.slice());

  let _consoleScrollPending = false;

  function _requestConsoleScroll(container) {
    if (_consoleScrollPending) return;
    _consoleScrollPending = true;
    requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; _consoleScrollPending = false; });
  }

  function _sanitizeTableHTML(html) {
    const allowedTags = ['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption'];
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<(?!\/?(table|thead|tbody|tfoot|tr|th|td|caption)\b)[^>]+>/gi, '')
      .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
      .replace(/javascript\s*:/gi, '');
  }

  function addConsole(level, msg, src, depth) {
    const out = document.getElementById('console-output');
    if (!out) return;

    const empty = out.querySelector('.console-empty');
    if (empty) empty.remove();

    const cssClass = level === 'group' ? 'group-start' : level === 'group-end' ? 'group-end' : level;
    const div = document.createElement('div');
    div.className = 'console-msg ' + cssClass;
    div.dataset.level = level;

    if (!consoleFilters.has(level)) div.style.display = 'none';

    const indent = (depth || 0) * 16;
    if (indent > 0) div.style.paddingLeft = (12 + indent) + 'px';

    // Icon
    const iconEl = document.createElement('span');
    iconEl.className = 'msg-icon';
    iconEl.textContent = CONSOLE_CONFIG[level]?.icon || '◦';
    iconEl.setAttribute('aria-hidden', 'true');
    div.appendChild(iconEl);

    // Kaynak bağlantısı
    if (src?.file) {
      const srcEl = document.createElement('span');
      const baseName = V.basename(src.file);

      if (src.internal || src.line == null) {
        srcEl.className = 'msg-src';
        srcEl.textContent = '(bundler)';
        srcEl.title = 'Konsol yakalama (bundler) iç satırı';
      } else {
        srcEl.className = 'msg-src clickable';
        srcEl.textContent = baseName + ':' + src.line;
        srcEl.title = src.file + ':' + src.line + (src.inline ? ' (inline)' : '') + ' — tıklayarak satıra git';

        (function (file, line, col) {
          srcEl.addEventListener('click', function () {
            if (window.innerWidth <= 768) document.querySelector('#mobile-tabs .mobile-tab[data-panel="editor-area"]')?.click();
            window.Tabs?.openAtLine(file, line, col);
          });
        })(src.file, src.line, src.col);
      }
      div.appendChild(srcEl);
    }

    // Mesaj metni
    const textEl = document.createElement('span');
    textEl.className = 'msg-text';
    textEl.innerHTML = (level === 'table' && typeof msg === 'string' && msg.startsWith('<table'))
      ? _sanitizeTableHTML(msg)
      : '';
    if (!textEl.innerHTML) textEl.textContent = msg;
    div.appendChild(textEl);

    out.appendChild(div);
    _requestConsoleScroll(out);

    const countEl = document.getElementById('console-count');
    if (countEl) {
      const n = out.querySelectorAll('.console-msg').length;
      countEl.textContent = n;
      countEl.classList.toggle('visible', n > 0);
    }
  }

  function clearConsole() {
    const out = document.getElementById('console-output');
    if (!out) return;
    out.innerHTML = '<div class="console-empty">◦ Konsol çıktıları burada görünecek</div>';
    const cc = document.getElementById('console-count');
    cc.textContent = '0';
    cc.classList.remove('visible');
  }

  function toggleConsoleFilter(level) {
    if (level === 'all') {
      const allActive = FILTERABLE_LEVELS.every(l => consoleFilters.has(l));
      if (allActive) consoleFilters.clear();
      else FILTERABLE_LEVELS.forEach(l => consoleFilters.add(l));
    } else {
      if (consoleFilters.has(level)) consoleFilters.delete(level);
      else consoleFilters.add(level);
    }
    applyConsoleFilters();
    updateConsoleFilterBtns();
  }

  function applyConsoleFilters() {
    document.querySelectorAll('#console-output .console-msg').forEach(el => {
      el.style.display = consoleFilters.has(el.dataset.level) ? '' : 'none';
    });
  }

  function updateConsoleFilterBtns() {
    document.querySelectorAll('.console-filter').forEach(btn => {
      const lv = btn.dataset.level;
      const isActive = lv === 'all' ? FILTERABLE_LEVELS.every(l => consoleFilters.has(l)) : consoleFilters.has(lv);
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  // iframe'den gelen mesajları dinle
  window.addEventListener('message', e => {
    if (e.data?.__delee) {
      if (e.data.type === 'console-clear') { clearConsole(); return; }
      if (e.data.type === 'console') addConsole(e.data.level, e.data.msg, e.data.src, e.data.depth);
    }
  });

  // Filtre butonları event delegation
  document.getElementById('console-filters')?.addEventListener('click', e => {
    const btn = e.target.closest('.console-filter');
    if (btn) toggleConsoleFilter(btn.dataset.level);
  });

  /* ---------- Expose ---------- */
  window.ConsolePanel = {
    add: addConsole,
    clear: clearConsole,
    toggleFilter: toggleConsoleFilter,
    applyFilters: applyConsoleFilters,
    updateFilterBtns: updateConsoleFilterBtns,
  };

})();