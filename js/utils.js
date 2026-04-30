/* =========================================================
 * utils.js — Sabitler, a11y yardımcıları, HTML escape, tema yönetimi
 * ========================================================= */
(function () {
  'use strict';

  /* ---------- Dosya İkonları ---------- */
  const FILE_TAB_ICONS = {
    folder: '📁', folderOpen: '📂',
    html: '🟧', htm: '🟧', css: '🎨',
    js: '⚡', mjs: '⚡', json: '📋',
    md: '📝', txt: '📝',
    svg: '🖼', png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', webp: '🖼', ico: '🖼',
    woff: '🔤', woff2: '🔤', ttf: '🔤', otf: '🔤',
    default: '📄'
  };

  /* ---------- CodeMirror Mode Haritası ---------- */
  const MODE_MAP = {
    html: 'htmlmixed', htm: 'htmlmixed',
    css: 'css', scss: 'sass',
    js: 'javascript', mjs: 'javascript', jsx: 'javascript',
    ts: 'javascript', tsx: 'javascript',
    json: { name: 'javascript', json: true },
    md: 'markdown', xml: 'xml', svg: 'xml',
    php: 'php', py: 'python',
    java: 'text/x-java', c: 'text/x-csrc', cpp: 'text/x-c++src',
    cs: 'text/x-csharp', kt: 'text/x-kotlin',
    sql: 'sql', sh: 'shell', bash: 'shell',
    yml: 'yaml', yaml: 'yaml', vue: 'vue',
  };

  /* ---------- Arama Sabitleri ---------- */
  const MAX_PATTERN_LEN = 500;

  /* ---------- HTML Escape ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"'`]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c])
    );
  }

  /* ---------- A11Y: Inert Kontrolü ---------- */
  function setInert(enable) {
    const app = document.getElementById('app');
    const loading = document.getElementById('loading');
    if (app) app.inert = enable;
    if (loading) loading.inert = enable;
  }

  /* ---------- A11Y: Focus Trap ---------- */
  function trapFocus(el) {
    if (!el) return () => {};
    const focusable = el.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return () => {};
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    function onKey(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }

  /* ---------- FileIcons Yardımcısı ---------- */
  const FileIcons = {
    getForPath(p) {
      return FILE_TAB_ICONS[window.VFS.extOf(p)] || FILE_TAB_ICONS.default;
    },
    getForEntry(entry) {
      if (entry.type === 'folder') return FILE_TAB_ICONS.folder;
      return this.getForPath(entry.path);
    }
  };

  /* =========================================================
   * Tema Yönetimi — Lazy Loading
   * Her tema sadece 1 kere yüklenir ve cache edilir.
   * ========================================================= */
  const _themeLinks = new Map();

  (function initThemeManager() {
    const staticDracula = document.querySelector('link[href*="theme/dracula.css"]');
    if (staticDracula) {
      _themeLinks.set('dracula', staticDracula);
    }
  })();

  /**
   * Tema CSS'ini lazy load eder.
   * @param {string} theme - 'dracula', 'ayu-dark', vb.
   * @returns {Promise<string>} Gerçekten aktif olan tema adı
   */
  async function switchTheme(theme) {
    // Tüm tema link'lerini devre dışı bırak
    _themeLinks.forEach(function (link) { link.disabled = true; });

    // Zaten yüklenmiş mi?
    if (_themeLinks.has(theme)) {
      _themeLinks.get(theme).disabled = false;
      return theme;
    }

    // Lazy load
    const newLink = document.createElement('link');
    newLink.rel = 'stylesheet';
    newLink.href = 'lib/codemirror/theme/' + theme + '.css';
    document.head.appendChild(newLink);

    try {
      await new Promise(function (resolve, reject) {
        newLink.onload = resolve;
        newLink.onerror = reject;
      });
      _themeLinks.set(theme, newLink);
      newLink.disabled = false;
      return theme;
    } catch (err) {
      console.warn('[Theme] Bulunamadı: ' + theme + ' → dracula');
      newLink.remove();
      if (_themeLinks.has('dracula')) {
        _themeLinks.get('dracula').disabled = false;
      }
      return 'dracula';
    }
  }

  /* ---------- Expose ---------- */
  window.Utils = { escapeHtml, setInert, trapFocus };
  window.FileIcons = FileIcons;
  window.FILE_TAB_ICONS = FILE_TAB_ICONS;
  window.MODE_MAP = MODE_MAP;
  window.MAX_PATTERN_LEN = MAX_PATTERN_LEN;
  window.switchTheme = switchTheme;

})();