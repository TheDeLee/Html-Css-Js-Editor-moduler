
/* =========================================================
 * settings.js — Editör & Uygulama Ayarları
 * ========================================================= */
(function () {
  'use strict';

  const STORAGE_KEY = 'delee_settings';

    const DEFAULTS = {
    theme: 'dracula',
    font: "'JetBrains Mono', monospace",
    fontsize: 13,
    indent: 2,
    linenums: true,
    linewrap: false,
    autocomplete: true,
    closebrackets: true,
    closetags: true,
    matchbrackets: true,
    activeline: true,
    foldgutter: true,
    matchselection: true,
    scrollpastend: true,
    autorun: true,
    livepreview: false,
    autorunDelay: 600,
    autosave: 3,
    autosaveEnabled: true,
    externalSave: false,
    savePathName: 'Projeler',
  };

  let settings = { ...DEFAULTS };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) Object.assign(settings, JSON.parse(raw));
    } catch (e) {}
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  function applyToUI() {
    const $ = id => document.getElementById(id);
    $('set-theme').value = settings.theme;
    $('set-font').value = settings.font;
    $('set-fontsize').value = settings.fontsize;
    $('set-indent').value = settings.indent;
    $('set-linenums').checked = settings.linenums;
    $('set-linewrap').checked = settings.linewrap;
    $('set-autocomplete').checked = settings.autocomplete;
    $('set-closebrackets').checked = settings.closebrackets;
    $('set-closetags').checked = settings.closetags;
    $('set-matchbrackets').checked = settings.matchbrackets;
    $('set-activeline').checked = settings.activeline;
    $('set-foldgutter').checked = settings.foldgutter;
    $('set-matchselection').checked = settings.matchselection;
    $('set-scrollpastend').checked = settings.scrollpastend;
    $('set-autorun').checked = settings.autorun;
    $('set-livepreview').checked = settings.livepreview;
    $('set-autosave-enabled').checked = settings.autosaveEnabled;
    $('set-external-save').checked = settings.externalSave;
    $('set-save-path').value = settings.savePathName || 'Projeler';
    document.getElementById('autosave-interval-row').style.opacity = settings.autosaveEnabled ? '1' : '0.4';
    document.getElementById('autosave-interval-row').style.pointerEvents = settings.autosaveEnabled ? '' : 'none';
    $('set-autorun-delay').value = settings.autorunDelay;
    $('set-autosave').value = settings.autosave;
  }

  function readFromUI() {
    const $ = id => document.getElementById(id);
    settings.theme = $('set-theme').value;
    settings.font = $('set-font').value;
    settings.fontsize = Math.max(10, Math.min(32, parseInt($('set-fontsize').value, 10) || 13));
    settings.indent = Math.max(1, Math.min(8, parseInt($('set-indent').value, 10) || 2));
    settings.linenums = $('set-linenums').checked;
    settings.linewrap = $('set-linewrap').checked;
    settings.autocomplete = $('set-autocomplete').checked;
    settings.closebrackets = $('set-closebrackets').checked;
    settings.closetags = $('set-closetags').checked;
    settings.matchbrackets = $('set-matchbrackets').checked;
    settings.activeline = $('set-activeline').checked;
    settings.foldgutter = $('set-foldgutter').checked;
    settings.matchselection = $('set-matchselection').checked;
    settings.scrollpastend = $('set-scrollpastend').checked;
    settings.autorun = $('set-autorun').checked;
    settings.livepreview = $('set-livepreview').checked;
    settings.autorunDelay = Math.max(100, Math.min(5000, parseInt($('set-autorun-delay').value, 10) || 600));
    settings.autosaveEnabled = $('set-autosave-enabled').checked;
    settings.externalSave = $('set-external-save').checked;
    settings.savePathName = $('set-save-path').value || 'Projeler';
    document.getElementById('autosave-interval-row').style.opacity = settings.autosaveEnabled ? '1' : '0.4';
    document.getElementById('autosave-interval-row').style.pointerEvents = settings.autosaveEnabled ? '' : 'none';
    settings.autosave = Math.max(1, Math.min(120, parseInt($('set-autosave').value, 10) || 3));
    save();

    document.querySelectorAll('.toggle-slider input[role="switch"]').forEach(sw => {
      sw.setAttribute('aria-checked', String(sw.checked));
    });
  }

  async function applyToAllEditors() {
    // ✅ DÜZELTME: Kendini çağıran satır kaldırıldı — sonsuz döngü çözüldü
    const realTheme = await window.switchTheme(settings.theme);

    if (!window.Tabs) return;

    window.Tabs.openTabs.forEach(function (tab) {
      if (!tab.cm) return;
      tab.cm.setOption('theme', realTheme);
      tab.cm.setOption('lineNumbers', settings.linenums);
      tab.cm.setOption('lineWrapping', settings.linewrap);
      tab.cm.setOption('tabSize', settings.indent);
      tab.cm.setOption('indentUnit', settings.indent);
      tab.cm.setOption('autoCloseBrackets', settings.closebrackets);
      tab.cm.setOption('autoCloseTags', settings.closetags);
      tab.cm.setOption('matchBrackets', settings.matchbrackets);
      tab.cm.setOption('styleActiveLine', settings.activeline);
      tab.cm.setOption('foldGutter', settings.foldgutter);
      tab.cm.setOption('highlightSelectionMatches', settings.matchselection ? { annotateScrollbar: false } : false);
      tab.cm.setOption('scrollPastEnd', settings.scrollpastend ? 0.5 : false);

      const gutters = ['CodeMirror-linenumbers'];
      if (settings.foldgutter) gutters.push('CodeMirror-foldgutter');
      tab.cm.setOption('gutters', gutters);

      const wrapper = tab.cm.getWrapperElement();
      if (wrapper) {
        wrapper.style.fontFamily = settings.font;
        wrapper.style.fontSize = settings.fontsize + 'px';
      }
    });

    document.documentElement.style.setProperty('--editor-font', settings.font);
    document.documentElement.style.setProperty('--editor-font-size', settings.fontsize + 'px');

    const consoleOutput = document.getElementById('console-output');
    if (consoleOutput) {
      consoleOutput.style.fontFamily = settings.font;
      consoleOutput.style.fontSize = settings.fontsize + 'px';
    }

    setTimeout(() => {
      window.Tabs.openTabs.forEach(tab => tab.cm?.refresh());
    }, 0);
  }

  function getCMOptions() {
    const gutters = ['CodeMirror-linenumbers'];
    if (settings.foldgutter) gutters.push('CodeMirror-foldgutter');

    return {
      theme: settings.theme,
      lineNumbers: settings.linenums,
      lineWrapping: settings.linewrap,
      tabSize: settings.indent,
      indentUnit: settings.indent,
      indentWithTabs: false,
      autoCloseBrackets: settings.closebrackets,
      autoCloseTags: settings.closetags,
      matchBrackets: settings.matchbrackets,
      styleActiveLine: settings.activeline,
      foldGutter: settings.foldgutter,
      gutters,
      matchTags: { bothTags: true },
      hintOptions: { completeSingle: false },
      highlightSelectionMatches: settings.matchselection ? { annotateScrollbar: false } : false,
      scrollPastEnd: settings.scrollpastend ? 0.5 : false,
    };
  }

  /* ---------- Getters ---------- */
  function getAutorunDelay() { return settings.autorunDelay; }
  function isAutorun() { return settings.autorun; }
  function isLivePreview() { return settings.livepreview; }
  function getAutosaveInterval() { return settings.autosave * 1000; }
  function getFontCSS() { return settings.font; }
  function getFontsize() { return settings.fontsize; }
  function isAutosaveEnabled() { return settings.autosaveEnabled; }

  /* ---------- Modal Kontrol ---------- */
  let _focusTrap = null;

  function openModal() {
    applyToUI();
    document.getElementById('settings-modal').classList.add('open');
    _focusTrap = window.Utils.trapFocus(document.querySelector('#settings-modal .modal'));
  }

  function closeModal() {
    if (_focusTrap) { _focusTrap(); _focusTrap = null; }
    document.getElementById('settings-modal').classList.remove('open');
  }

  /* ---------- Init ---------- */
  function initSettings() {
    load();
    window.switchTheme(settings.theme);

    const consoleOutput = document.getElementById('console-output');
    if (consoleOutput) {
      consoleOutput.style.fontFamily = settings.font;
      consoleOutput.style.fontSize = settings.fontsize + 'px';
    }

    const modal = document.getElementById('settings-modal');
    modal.querySelector('[data-close-settings]').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    modal.querySelectorAll('input, select').forEach(el => {
      if (el.id === 'set-autosave-enabled' || el.id === 'set-external-save') return;
      el.addEventListener('change', () => { readFromUI(); applyToAllEditors(); });
    });

    // Otomatik kayıt toggle — anlık UI güncelleme
    document.getElementById('set-autosave-enabled').addEventListener('change', function () {
      var enabled = this.checked;
      settings.autosaveEnabled = enabled;
      save();
      this.setAttribute('aria-checked', String(enabled));
      document.getElementById('autosave-interval-row').style.opacity = enabled ? '1' : '0.4';
      document.getElementById('autosave-interval-row').style.pointerEvents = enabled ? '' : 'none';
    });

    /* ── Kayıt Yolu ── */
    (function initSavePath() {
      var pathInput = document.getElementById('set-save-path');
      var browseBtn = document.getElementById('set-save-path-browse');
      var clearBtn = document.getElementById('set-save-path-clear');
      var statusDot = document.getElementById('save-path-status');
      var noteEl = document.getElementById('save-path-note');
      var externalToggle = document.getElementById('set-external-save');

      // API desteği kontrolü
      if (!window.showDirectoryPicker) {
        browseBtn.disabled = true;
        browseBtn.textContent = '⚠ Desteklenmiyor';
        browseBtn.title = 'Tarayıcınız File System Access API desteklemiyor. Chrome veya Edge kullanın.';
        noteEl.innerHTML = '⚠ Tarayıcınız dosya sistemi erişimini desteklemiyor. Chrome veya Edge gereklidir.';
        noteEl.style.color = 'var(--warning)';
        externalToggle.disabled = true;
        externalToggle.checked = false;
        settings.externalSave = false;
        save();
        return;
      }

      // Başlangıçta handle kontrolü
      window.VFS.getDirHandle().then(function (handle) {
        if (handle) {
          window.VFS.getDirName(handle).then(function (name) {
            if (name) {
              pathInput.value = name;
              settings.savePathName = name;
              save();
            }
            clearBtn.style.display = '';
            statusDot.style.background = 'var(--success)';
            statusDot.title = 'Klasör bağlı';
          });
        } else {
          statusDot.style.background = 'var(--text-muted)';
          statusDot.title = 'Klasör seçilmedi';
        }
      });

      // Gözat butonu
      browseBtn.addEventListener('click', async function () {
        try {
          var handle = await window.showDirectoryPicker({ mode: 'readwrite' });
          await window.VFS.setDirHandle(handle);
          var name = await window.VFS.getDirName(handle);
          if (name) {
            pathInput.value = name;
            settings.savePathName = name;
            save();
          }
          clearBtn.style.display = '';
          statusDot.style.background = 'var(--success)';
          statusDot.title = 'Klasör bağlı: ' + (name || '');
          window.DeLee?.toast('Kayıt yolu ayarlandı: ' + (name || 'klasör'), 'success');
        } catch (e) {
          if (e.name !== 'AbortError') {
            window.DeLee?.toast('Klasör seçilemedi: ' + e.message, 'error');
          }
        }
      });

      // Temizle butonu
      clearBtn.addEventListener('click', async function () {
        await window.VFS.clearDirHandle();
        pathInput.value = 'Projeler';
        settings.savePathName = 'Projeler';
        settings.externalSave = false;
        externalToggle.checked = false;
        externalToggle.setAttribute('aria-checked', 'false');
        clearBtn.style.display = 'none';
        statusDot.style.background = 'var(--text-muted)';
        statusDot.title = 'Klasör seçilmedi';
        window._externalSaveEnabled = false;
        save();
        window.DeLee?.toast('Kayıt yolu kaldırıldı', 'info');
      });

      // Dışa kayıt toggle
      externalToggle.addEventListener('change', function () {
        var enabled = this.checked;
        this.setAttribute('aria-checked', String(enabled));
        if (enabled) {
          // Handle var mı kontrol et
          window.VFS.getDirHandle().then(async function (handle) {
            if (!handle) {
              window.DeLee?.toast('Önce bir klasör seçin (Gözat)', 'warning');
              externalToggle.checked = false;
              externalToggle.setAttribute('aria-checked', 'false');
              settings.externalSave = false;
              save();
              return;
            }
            var ok = await window.VFS.verifyDirPermission(handle);
            if (!ok) {
              window.DeLee?.toast('Klasör yazma izni reddedildi', 'error');
              externalToggle.checked = false;
              externalToggle.setAttribute('aria-checked', 'false');
              settings.externalSave = false;
              save();
              return;
            }
            settings.externalSave = true;
            window._externalSaveEnabled = true;
            save();
            window.DeLee?.toast('Dışa kayıt aktif', 'success');
          });
        } else {
          settings.externalSave = false;
          window._externalSaveEnabled = false;
          save();
        }
      });
    })();

    // Tehlikeli butonlar
    document.getElementById('set-btn-clear-project').addEventListener('click', async () => {
      const ok = await window.DeLee.confirm('Tüm proje silinsin mi? (Geri alınamaz)', 'Projeyi Sil');
      if (!ok) return;
      window.DeLee.cleanup();
      window.VFS.instance.clear();
      window.VFS.instance.save();
      document.getElementById('project-name').value = '';
      window.DeLee.toast('Proje temizlendi', 'success');
      closeModal();
      window.Explorer?.render();
      document.getElementById('status-files').textContent = '0 dosya';
      window.DeLee.runPreview();
    });

    document.getElementById('set-btn-clear-data').addEventListener('click', async () => {
      const ok = await window.DeLee.confirm('Tüm tarayıcı tanımlama verileri silinecek. Sayfa yenilenecek. Devam?', 'Verileri Temizle');
      if (!ok) return;
      try {
        localStorage.clear();
        sessionStorage.clear();
        if (indexedDB.databases) {
          const dbs = await indexedDB.databases();
          await Promise.all(dbs.map(db => new Promise((res, rej) => {
  		const req = indexedDB.deleteDatabase(db.name);
  		req.onsuccess = res;
  		req.onerror = rej;
		})));
        } else {
          await Promise.all([
  		new Promise((r,j) => { var q=indexedDB.deleteDatabase('DeLeePad_VFS'); q.onsuccess=r; q.onerror=j; }),
  		new Promise((r,j) => { var q=indexedDB.deleteDatabase('DeLeePad_DirHandle'); q.onsuccess=r; q.onerror=j; }),
		]);
        }
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
        document.cookie.split(';').forEach(c => {
          const name = c.split('=')[0].trim();
          document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
        });
        window.DeLee.toast('Veriler temizlendi, yenileniyor...', 'success');
        setTimeout(() => location.reload(), 800);
      } catch (e) {
        window.DeLee.toast('Hata: ' + e.message, 'error');
      }
    });
  }

  /* ---------- Expose ---------- */
      window.Settings = {
    init: initSettings,
    open: openModal,
    close: closeModal,
    getCMOptions,
    getFontCSS,
    getFontsize,
    getAutorunDelay,
    isAutorun,
    isLivePreview,
    isAutosaveEnabled,
    isExternalSave: function () { return settings.externalSave; },
    getAutosaveInterval,
    applyToAllEditors,
  };

})();