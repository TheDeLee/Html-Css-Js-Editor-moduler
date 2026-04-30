
/* =========================================================
 * app.js — Başlatma, Event Bağlama, Örnek Projeler, Preview
 * ========================================================= */
(function () {
  'use strict';

  const V = window.VFS;
  const vfs = V.instance;

  let runTimer = null;
  let lastCtx = null;
  let _runGeneration = 0;
  let preferredEntry = null;

  /* ─── Subscriptions (temizlenebilir) ─── */
  const _appSubs = [];
  function _appSub(fn) { _appSubs.push(vfs.on(fn)); }

  /* =========================================================
   * Mevcut Dosya Kontrolü — 3 Seçenekli Modal
   *
   * VFS'te dosya varsa:
   *   true      → Kaydet + Temizle + createFn
   *   'secondary' → Kaydetmeden Temizle + createFn
   *   false     → İptal (hiçbir şey yapma)
   *
   * VFS boşsa → soru sormadan direkt createFn
   * ========================================================= */
  async function checkBeforeCreate(createFn) {
    if (vfs.list().length === 0) {
      createFn();
      return;
    }

    const result = await window.Modals.confirm(
      'Mevcut dosyalar var. Ne yapmak istersiniz?',
      'Mevcut Dosyalar',
      {
        okText: '💾 Dosyaları Kaydet',
        okClass: 'primary',
        secondaryText: '🗑 Kaydetmeden Devam Et',
        secondaryClass: 'danger',
      }
    );

    if (result === true) {
      /* Kaydet → temizle → oluştur */
      await vfs.save();
      window.Tabs?.closeAll();
      vfs.clear();
      window.Explorer?.render();
      updateStatusBar();
      createFn();

    } else if (result === 'secondary') {
      /* Kaydetmeden temizle → oluştur */
      window.Tabs?.closeAll();
      vfs.clear();
      window.Explorer?.render();
      updateStatusBar();
      createFn();
    }
    /* false → iptal, hiçbir şey yapma */
  }

  /* =========================================================
   * Entry Point Detection
   * ========================================================= */
  function findEntryCandidates() {
    const files = vfs.list().filter(e => e.type === 'file' && /\.(html|htm)$/i.test(e.path));
    files.sort((a, b) => {
      const ap = a.path.toLowerCase(), bp = b.path.toLowerCase();
      const aRootIdx = ap === 'index.html' ? 0 : (V.dirname(ap) === '' ? 1 : 2);
      const bRootIdx = bp === 'index.html' ? 0 : (V.dirname(bp) === '' ? 1 : 2);
      if (aRootIdx !== bRootIdx) return aRootIdx - bRootIdx;
      return ap.localeCompare(bp);
    });
    return files.map(f => f.path);
  }

  function updateEntrySelect() {
    const sel = document.getElementById('entry-select');
    if (!sel) return null;
    const candidates = findEntryCandidates();
    sel.innerHTML = '';
    if (!candidates.length) {
      const opt = document.createElement('option');
      opt.textContent = '(HTML yok)';
      opt.value = '';
      sel.appendChild(opt);
      return null;
    }
    candidates.forEach(p => {
      const o = document.createElement('option');
      o.value = p;
      o.textContent = p;
      sel.appendChild(o);
    });
    const chosen = (preferredEntry && candidates.includes(preferredEntry)) ? preferredEntry : candidates[0];
    if (!chosen) { preferredEntry = null; return null; }
    sel.value = chosen;
    preferredEntry = chosen;
    return chosen;
  }

  /* =========================================================
   * Preview — Run & Schedule
   * ========================================================= */
  async function runPreview() {
    window.ConsolePanel.clear();
    const entry = updateEntrySelect();
    if (!entry) {
      document.getElementById('preview-iframe').srcdoc =
        '<html><body style="font-family:sans-serif;padding:40px;color:#888;text-align:center">' +
        '<h2>Önizleme için bir HTML dosyası yok</h2>' +
        '<p>Kök dizinde <code>index.html</code> oluşturun.</p></body></html>';
      return;
    }
    if (lastCtx) lastCtx.revokeAll();
    try {
      const { html, ctx } = await window.Bundler.bundle(vfs, entry);
      lastCtx = ctx;
      if (ctx.warnings.length) {
        ctx.warnings.slice(0, 5).forEach(w => window.ConsolePanel.add('warn', '[bundler] ' + w));
      }
      document.getElementById('preview-iframe').srcdoc = html;
    } catch (err) {
      console.error(err);
      window.Modals.toast('Bundle hatası: ' + err.message, 'error');
      window.ConsolePanel.add('error', '[bundler] ' + err.message);
    }
  }

  function scheduleRun() {
    clearTimeout(runTimer);
    const gen = ++_runGeneration;
    runTimer = setTimeout(() => {
      if (gen === _runGeneration) runPreview();
    }, window.Settings.getAutorunDelay());
  }

  /* =========================================================
   * Status Bar
   * ========================================================= */
  function updateStatusBar() {
    const n = vfs.list().filter(e => e.type === 'file').length;
    document.getElementById('status-files').textContent = n + ' dosya';
  }

  /* =========================================================
   * Divider Drag
   * ========================================================= */
  function bindDivider(id, left, right) {
    const d = document.getElementById(id);
    if (!d) return;
    let start = 0, sl = 0, sr = 0;

    d.addEventListener('mousedown', e => {
      e.preventDefault();
      d.classList.add('dragging');
      start = e.clientX;
      sl = left.getBoundingClientRect().width;
      sr = right.getBoundingClientRect().width;

      const onMove = ev => {
        const dx = ev.clientX - start;
        if (id === 'explorer-divider') {
          const totalLeft = sl + dx;
          if (totalLeft >= 140 && totalLeft <= 560) {
            left.style.width = totalLeft + 'px';
            d.setAttribute('aria-valuenow', String(Math.round(totalLeft)));
          }
        } else if (id === 'preview-divider') {
          const totalRight = sr - dx;
          if (totalRight >= 200 && totalRight <= window.innerWidth * 0.75) {
            right.style.width = totalRight + 'px';
          }
        }
        window.Tabs?.openTabs.forEach(t => t.cm?.refresh());
      };

      const onUp = () => {
        d.classList.remove('dragging');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    d.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const step = e.shiftKey ? 50 : 10;

      if (id === 'explorer-divider') {
        const current = left.getBoundingClientRect().width;
        let target = current;
        if (e.key === 'ArrowLeft') target = Math.max(140, current - step);
        if (e.key === 'ArrowRight') target = Math.min(560, current + step);
        if (e.key === 'Home') target = 160;
        if (e.key === 'End') target = 560;
        left.style.width = target + 'px';
      } else if (id === 'preview-divider') {
        const rCurrent = right.getBoundingClientRect().width;
        let newRight = rCurrent;
        if (e.key === 'ArrowLeft') newRight = Math.min(window.innerWidth * 0.75, rCurrent + step);
        if (e.key === 'ArrowRight') newRight = Math.max(200, rCurrent - step);
        if (e.key === 'Home') newRight = 200;
        if (e.key === 'End') newRight = Math.round(window.innerWidth * 0.75);
        right.style.width = newRight + 'px';
      }
      window.Tabs?.openTabs.forEach(t => t.cm?.refresh());
    });
  }

  /* =========================================================
   * Console Resizer
   * ========================================================= */
  function bindConsoleResizer() {
    const r = document.getElementById('console-resizer');
    const cp = document.getElementById('console-panel');
    if (!r || !cp) return;

    r.addEventListener('mousedown', e => {
      e.preventDefault();
      const sh = cp.getBoundingClientRect().height;
      const sy = e.clientY;
      const onMove = ev => {
        const dy = sy - ev.clientY;
        cp.style.height = Math.max(40, Math.min(window.innerHeight * 0.7, sh + dy)) + 'px';
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    r.addEventListener('keydown', e => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const step = e.shiftKey ? 50 : 10;
      const current = cp.getBoundingClientRect().height;
      let target = current;
      if (e.key === 'ArrowUp') target = Math.max(40, current - step);
      if (e.key === 'ArrowDown') target = Math.min(window.innerHeight * 0.7, current + step);
      if (e.key === 'Home') target = 40;
      if (e.key === 'End') target = Math.round(window.innerHeight * 0.7);
      cp.style.height = target + 'px';
    });
  }

  /* =========================================================
   * Panel Toggle
   * ========================================================= */
  function togglePanel(panelId, dividerId) {
    const el = document.getElementById(panelId);
    if (!el) return;
    el.classList.toggle('collapsed');
    const hidden = el.classList.contains('collapsed');

    if (dividerId) {
      const divider = document.getElementById(dividerId);
      if (divider) divider.classList.toggle('divider-hidden', hidden);
    }

    const stripMap = {
      'explorer': 'strip-explorer',
      'editor-area': 'strip-editor',
      'preview-panel': 'strip-preview',
      'console-panel': 'strip-console',
    };
    const strip = document.getElementById(stripMap[panelId]);
    if (strip) strip.setAttribute('aria-expanded', String(!hidden));

    window.Tabs?.openTabs.forEach(t => t.cm?.refresh());
  }

  /* =========================================================
   * Dropdown Yönetimi
   * ========================================================= */
  function initDropdowns() {
    const uploadBtn = document.getElementById('btn-upload');
    const uploadMenu = document.getElementById('upload-menu');
    const logoWrap = document.getElementById('logo-wrap');
    const logoDropdown = document.getElementById('logo-dropdown');

    function closeAll() {
      uploadMenu?.classList.remove('open');
      logoDropdown?.classList.remove('open');
      if (uploadBtn) uploadBtn.setAttribute('aria-expanded', 'false');
      if (logoWrap) logoWrap.setAttribute('aria-expanded', 'false');
    }

    document.addEventListener('mousedown', e => {
      if (!e.target.closest('.upload-wrap') && !e.target.closest('#logo-wrap')) closeAll();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (document.querySelector('.modal-overlay.open')) return;
        if (document.getElementById('search-panel')?.classList.contains('open')) return;
        closeAll();
      }
    });

    if (uploadBtn) {
      uploadBtn.addEventListener('click', e => {
        e.stopPropagation();
        const wasOpen = uploadMenu?.classList.contains('open');
        closeAll();
        if (!wasOpen) {
          uploadMenu?.classList.add('open');
          uploadBtn.setAttribute('aria-expanded', 'true');
        }
      });
    }

    if (uploadMenu) {
      uploadMenu.addEventListener('click', e => {
        const item = e.target.closest('.upload-item');
        if (!item) return;
        const act = item.dataset.action;
        closeAll();
        if (act === 'files') document.getElementById('file-input')?.click();
        else if (act === 'folder') document.getElementById('folder-input')?.click();
        else if (act === 'zip') document.getElementById('zip-input')?.click();
        else if (act === 'create-file') createSingleFile();
        else if (act === 'create-project') createProjectFiles();
      });
    }

    if (logoWrap) {
      logoWrap.addEventListener('click', e => {
        e.stopPropagation();
        const wasOpen = logoDropdown?.classList.contains('open');
        closeAll();
        if (!wasOpen) {
          logoDropdown?.classList.add('open');
          logoWrap.setAttribute('aria-expanded', 'true');
        }
      });
    }

    if (logoDropdown) {
      logoDropdown.addEventListener('click', e => {
        const item = e.target.closest('.upload-item');
        if (!item) return;
        const act = item.dataset.action;
        closeAll();
        switch (act) {
          case 'egitim': break;
          case 'kaydet': vfs.save(); window.Modals.toast('Proje kaydedildi', 'success'); break;
          case 'indir': window.IO.downloadZip(); break;
          case 'ayarlar': window.Settings.open(); break;
          case 'sonkullananlar': break;
          case 'cikis':
            try { window.close(); } catch (e) {}
            // window.close() sadece window.open() ile açılan pencerelerde çalışır
            if (!window.closed) {
              window.Modals.toast('Bu pencere tarayıcı tarafından kapatılamadı. Sekmeyi manuel kapatın.', 'warning', 4000);
            }
            break;
        }
      });
    }
  }

  /* =========================================================
   * Mobile Tab Switching
   * ========================================================= */
  function initMobileTabs() {
    const PANELS = {
      'explorer': document.getElementById('explorer'),
      'editor-area': document.getElementById('editor-area'),
      'preview-panel': document.getElementById('preview-panel'),
    };
    const tabs = document.querySelectorAll('#mobile-tabs .mobile-tab');

    function activate(panelName) {
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      const btn = document.querySelector(`#mobile-tabs .mobile-tab[data-panel="${panelName}"]`);
      if (btn) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
      }

      Object.values(PANELS).forEach(el => el?.classList.remove('mobile-active', 'mobile-console'));

      if (panelName === 'console') {
        PANELS['preview-panel']?.classList.add('mobile-active', 'mobile-console');
      } else if (PANELS[panelName]) {
        PANELS[panelName].classList.add('mobile-active');
      }

      if (panelName === 'editor-area') {
        setTimeout(() => window.Tabs?.openTabs.forEach(t => t.cm?.refresh()), 50);
      }
    }

    tabs.forEach(tab => {
      tab.addEventListener('click', () => activate(tab.dataset.panel));
    });

    if (window.innerWidth <= 768) activate('editor-area');
  }

  /* =========================================================
   * Tabs Keyboard Navigation (role="tablist")
   * ========================================================= */
  function initTabsKeyboard() {
    const bar = document.getElementById('tabs-bar');
    if (!bar) return;

    bar.addEventListener('keydown', function (e) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      if (!e.target.classList.contains('tab')) return;
      e.preventDefault();

      const tabs = Array.from(this.querySelectorAll('.tab'));
      const idx = tabs.indexOf(e.target);
      if (idx < 0) return;

      let next;
      switch (e.key) {
        case 'ArrowRight': next = tabs[(idx + 1) % tabs.length]; break;
        case 'ArrowLeft': next = tabs[(idx - 1 + tabs.length) % tabs.length]; break;
        case 'Home': next = tabs[0]; break;
        case 'End': next = tabs[tabs.length - 1]; break;
      }
      if (next) { next.focus(); next.click(); }
    });
  }

  /* =========================================================
   * Örnek Proje Şablonları
   * ========================================================= */

  /* ✅ GÜNCELLENDİ: checkBeforeCreate ile sarmalandı */
  function createSingleFile() {
    checkBeforeCreate(doCreateSingleFile);
  }

  function doCreateSingleFile() {
    vfs.writeFile('index.html', `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DeLee</title>
  <style>
  body {
    font-family: system-ui, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }
  h1 { font-size: 2.5rem; margin-bottom: 1rem; }
  p { font-size: 1.2rem; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>Merhaba DeLee!</h1>
  <p>HTML, CSS ve JavaScript ile geliştirmeye başlayın.</p>
  <script>
console.log('DeLee hazır! 🚀');
console.info('DeLee bilgi');
console.warn('DeLee uyarı');
console.error('DeLee hata');
console.debug('DeLee debug');
console.trace('DeLee iz');
console.success('DeLee başarılı');
console.fatal('DeLee kritik');
console.network('GET /api');
console.security('XSS risk');
console.table([{ad:'Ali',yaş:25},{ad:'Ayşe',yaş:30}]);
console.assert(1===2, 'Hata!');
console.time('fetch'); console.timeEnd('fetch');
console.group('DeLee Modül A');
  console.log('DeLee içerik');
  console.group('DeLee Alt grup');
    console.log('DeLee iç içe');
  console.groupEnd();
console.groupEnd();
console.count('DeLee tik');
console.count('DeLee tik');
const greeting = 'Merhaba DeLee!';
console.log(greeting);
const numbers = [1, 2, 3, 4, 5];
console.log('Sayılar:', numbers);
try { throw new Error('Örnek hata'); } catch(e) { console.error('Yakalanan hata:', e.message); }
  </script>
</body>
</html>`);
    vfs.save();
    window.Tabs.openFile('index.html');
    updateStatusBar();
    runPreview();
    window.Modals.toast('index.html oluşturuldu', 'success');
  }

  /* ✅ GÜNCELLENDİ: checkBeforeCreate ile sarmalandı */
  function createProjectFiles() {
    checkBeforeCreate(doCreateProject);
  }

  function doCreateProject() {
    vfs.writeFile('index.html', `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DeLee</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Merhaba DeLee!</h1>
  <p>HTML, CSS ve JavaScript ile geliştirmeye başlayın.</p>
  <script src="script.js"></script>
</body>
</html>`);

    vfs.writeFile('style.css', `body {
  font-family: system-ui, sans-serif;
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}
h1 { font-size: 2.5rem; margin-bottom: 1rem; }
p { font-size: 1.2rem; line-height: 1.6; }`);

    vfs.writeFile('script.js', `console.log('DeLee hazır! 🚀');
console.info('DeLee bilgi');
console.warn('DeLee uyarı');
console.error('DeLee hata');
console.debug('DeLee debug');
console.trace('DeLee iz');
console.success('DeLee başarılı');
console.fatal('DeLee kritik');
console.network('GET /api');
console.security('XSS risk');
console.table([{ad:'Ali',yaş:25},{ad:'Ayşe',yaş:30}]);
console.assert(1===2, 'Hata!');
console.time('fetch'); console.timeEnd('fetch');
console.group('DeLee Modül A');
  console.log('DeLee içerik');
  console.group('DeLee Alt grup');
    console.log('DeLee iç içe');
  console.groupEnd();
console.groupEnd();
console.count('DeLee tik');
console.count('DeLee tik');
const greeting = 'Merhaba DeLee!';
console.log(greeting);
const numbers = [1, 2, 3, 4, 5];
console.log('Sayılar:', numbers);
try { throw new Error('Örnek hata'); } catch(e) { console.error('Yakalanan hata:', e.message); }`);

    vfs.save();
    window.Tabs.openFile('index.html');
    updateStatusBar();
    runPreview();
    window.Modals.toast('Proje oluşturuldu (3 dosya)', 'success');
  }

  function loadSample() {
    if (vfs.list().length) {
      window.Modals.confirm('Mevcut proje temizlenip örnek proje yüklensin mi?', 'Örnek Proje').then(ok => {
        if (ok) { vfs.clear(); doLoadSample(); }
      });
    } else doLoadSample();
  }

  function doLoadSample() {
    vfs.writeFile('index.html', `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>DeLee Örnek</title>
  <link rel="stylesheet" href="./styles/main.css">
</head>
<body>
  <div class="wrap">
    <h1>👋 Merhaba DeLee!</h1>
    <img src="./assets/logo.svg" alt="logo" width="80">
    <p>Bu proje: <strong>VFS + ES modules + blob URL bundler</strong> ile çalışıyor.</p>
    <button id="btn">Tıkla</button>
    <div id="out"></div>
  </div>
  <script type="module" src="./src/main.js"></script>
</body>
</html>`);
    vfs.writeFile('styles/main.css', `@import "./reset.css";
body { font-family: system-ui, sans-serif; background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; min-height:100vh; }
.wrap { max-width:720px; margin:60px auto; padding:30px; background:rgba(0,0,0,.25); border-radius:14px; backdrop-filter:blur(8px); }
h1 { margin-bottom:16px; }
button { background:#fff; color:#333; border:none; padding:10px 22px; border-radius:20px; cursor:pointer; font-weight:600; margin-top:12px; }
button:hover { background:#f0f0f0; }
#out { margin-top:16px; font-family:monospace; font-size:14px; }
img { vertical-align:middle; margin:10px 0; }`);
    vfs.writeFile('styles/reset.css', `*{margin:0;padding:0;box-sizing:border-box}`);
    vfs.writeFile('src/main.js', `import { greet } from './utils/greet.js';
import { counter } from './utils/counter.js';
console.log('main.js yüklendi 🚀');
document.getElementById('btn').addEventListener('click', () => {
  const n = counter();
  document.getElementById('out').textContent = greet('DeLee') + ' — sayaç: ' + n;
});`);
    vfs.writeFile('src/utils/greet.js', `export function greet(name){ return 'Merhaba, ' + name + '!'; }`);
    vfs.writeFile('src/utils/counter.js', `let n = 0; export function counter(){ return ++n; }`);
    vfs.writeFile('assets/logo.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#58a6ff"/><text x="50" y="60" text-anchor="middle" fill="#fff" font-family="Arial" font-size="34" font-weight="bold">D</text></svg>`);

    window.IO.setProjectName('ornek-proje');
    vfs.save();
    window.Tabs.openFile('index.html');
    updateStatusBar();
    runPreview();
  }

  /* =========================================================
   * INIT — Ana Başlatma Fonksiyonu
   * ========================================================= */
  async function init() {
    /* ── Dışa Kayıt Hook ── */
    window._externalSaveEnabled = false;
    window._doExternalSave = async function (vfsInstance) {
      if (!window._externalSaveEnabled) return;
      try {
        var handle = await window.VFS.getDirHandle();
        if (!handle) return;
        var ok = await window.VFS.verifyDirPermission(handle);
        if (!ok) {
          window._externalSaveEnabled = false;
          window.Settings.close();
          window.DeLee?.toast('Klasör izni kaybedildi, dışa kayıt kapatıldı', 'warning');
          return;
        }
        var files = vfsInstance.list().filter(function (e) { return e.type === 'file'; });
        if (!files.length) return;
        await window.VFS.saveFilesToDir(handle, files, vfsInstance.projectName);
      } catch (e) {
        // Sessiz — ana kayıt IndexedDB'ye yapıldı, dışa kayıt ekstra
      }
    };
    await vfs.load();
    if (vfs.projectName) document.getElementById('project-name').value = vfs.projectName;

    window.Explorer?.render();
    updateStatusBar();

    const htmlFiles = findEntryCandidates();
    if (htmlFiles.length) {
      window.Tabs.openFile(htmlFiles[0]);
      preferredEntry = htmlFiles[0];
    } else {
      const first = vfs.list().find(e => e.type === 'file');
      if (first) window.Tabs.openFile(first.path);
    }
    updateEntrySelect();
    runPreview();

    /* ── Header Butonları ── */
    document.getElementById('btn-run').onclick = runPreview;
    document.getElementById('btn-refresh').onclick = runPreview;
    document.getElementById('btn-format').onclick = () => window.IO.formatActiveFile();

    document.getElementById('btn-open-tab').onclick = async () => {
      const entry = updateEntrySelect();
      if (!entry) { window.Modals.toast('Önizlenecek HTML yok', 'warning'); return; }
      try {
        const { html, ctx } = await window.Bundler.bundle(vfs, entry);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (!w) { window.Modals.toast('Açılır pencere engellendi', 'error'); return; }
        const cleanup = () => { try { URL.revokeObjectURL(url); } catch (e) {} try { ctx.revokeAll(); } catch (e) {} };
        const timer = setTimeout(cleanup, 10 * 60 * 1000);
        const iv = setInterval(() => { if (w.closed) { clearInterval(iv); clearTimeout(timer); cleanup(); } }, 1500);
        window.Modals.toast('Önizleme yeni sekmede açıldı', 'success');
      } catch (err) {
        window.Modals.toast('Açılamadı: ' + err.message, 'error');
      }
    };

    document.getElementById('btn-new-file').onclick = async () => {
      const name = await window.Modals.prompt('Dosya yolu (ör: src/app.js):', 'new-file.js', 'Yeni Dosya');
      if (!name) return;
      if (vfs.has(name)) { window.Modals.toast('Dosya zaten var', 'error'); return; }
      vfs.writeFile(name, '');
      vfs.save();
      window.Tabs.openFile(name);
      updateStatusBar();
    };

    document.getElementById('btn-new-folder').onclick = async () => {
      const name = await window.Modals.prompt('Klasör yolu (ör: src/utils):', 'new-folder', 'Yeni Klasör');
      if (!name) return;
      try { vfs.mkdir(name); vfs.save(); updateStatusBar(); }
      catch (e) { window.Modals.toast(e.message, 'error'); }
    };

    document.getElementById('exp-new-file').onclick = () => document.getElementById('btn-new-file').click();
    document.getElementById('exp-new-folder').onclick = () => document.getElementById('btn-new-folder').click();
    document.getElementById('exp-collapse').onclick = () => {
      if (!window.Explorer) return;
      window.Explorer.isAnyExpanded() ? window.Explorer.collapseAll() : window.Explorer.expandAll();
    };

    document.getElementById('btn-download-zip').onclick = () => window.IO.downloadZip();

    /* ── Dosya Input'ları ── */
    document.getElementById('file-input').addEventListener('change', async e => {
      await window.IO.handleFiles(e.target.files);
      e.target.value = '';
    });
    document.getElementById('folder-input').addEventListener('change', async e => {
      await window.IO.handleFiles(e.target.files, { stripTop: true });
      e.target.value = '';
      window.Explorer?.render();
    });
    document.getElementById('zip-input').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (f) await window.IO.handleZip(f);
      e.target.value = '';
      window.Explorer?.render();
    });

    /* ── Konsol ── */
    document.getElementById('console-clear').onclick = () => window.ConsolePanel.clear();

    document.getElementById('entry-select').addEventListener('change', e => {
      preferredEntry = e.target.value;
      runPreview();
    });

    document.getElementById('project-name').addEventListener('input', e => {
      vfs.projectName = e.target.value.trim() || 'untitled';
      vfs.save();
    });

    /* ── Empty State ── */
    document.getElementById('empty-new-file').onclick = () => document.getElementById('btn-new-file').click();
    document.getElementById('empty-upload-folder').onclick = () => document.getElementById('folder-input').click();
    document.getElementById('empty-sample').onclick = loadSample;

    /* ── VFS Events ── */
    _appSub(ev => {
      if (ev.type === 'create' || ev.type === 'delete' || ev.type === 'clear' || ev.type === 'load') {
        updateStatusBar();
        updateEntrySelect();
      }
      if ((ev.type === 'update' || ev.type === 'create') && window.Settings.isAutorun()) {
        scheduleRun();
      }
    });

    /* ── Dropdown'lar ── */
    initDropdowns();

    /* ── Divider'lar ── */
    bindDivider('explorer-divider', document.getElementById('explorer'), document.getElementById('editor-area'));
    bindDivider('preview-divider', document.getElementById('editor-area'), document.getElementById('preview-panel'));
    bindConsoleResizer();

    /* ── Panel Toggle ── */
    const STRIP_MAP = {
      'strip-explorer': ['explorer', 'explorer-divider'],
      'strip-editor': ['editor-area', null],
      'strip-preview': ['preview-panel', 'preview-divider'],
      'strip-console': ['console-panel', null],
    };
    Object.entries(STRIP_MAP).forEach(([id, args]) => {
      const el = document.getElementById(id);
      if (!el) return;
      function activate() { togglePanel(...args); }
      el.addEventListener('click', activate);
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      });
    });

    document.getElementById('close-explorer').onclick = () => togglePanel('explorer', 'explorer-divider');
    document.getElementById('close-editor').onclick = () => togglePanel('editor-area', null);
    document.getElementById('close-preview').onclick = () => togglePanel('preview-panel', 'preview-divider');
    document.getElementById('close-console').onclick = () => togglePanel('console-panel', null);

    /* ── Settings ── */
    window.Settings.init();

    // Dışa kayıt ayarını yansıt
    window._externalSaveEnabled = window.Settings.isExternalSave?.() || false;

    /* ── Mobile ── */
    initMobileTabs();
    initTabsKeyboard();

    /* ── Global Keyboard ── */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (document.getElementById('settings-modal').classList.contains('open')) {
          e.preventDefault();
          window.Settings.close();
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runPreview(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); runPreview(); }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); window.IO.formatActiveFile(); }
    });

    /* ── Resize ── */
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const exp = document.getElementById('explorer');
      const prev = document.getElementById('preview-panel');
      if (exp && !exp.classList.contains('collapsed') && exp.getBoundingClientRect().width > w * 0.5) {
        exp.style.width = Math.round(w * 0.3) + 'px';
      }
      if (prev && !prev.classList.contains('collapsed') && prev.getBoundingClientRect().width > w * 0.7) {
        prev.style.width = Math.round(w * 0.4) + 'px';
      }
    });

    /* ── Loading ── */
    setTimeout(() => {
      const loading = document.getElementById('loading');
      loading.classList.add('hidden');
      loading.setAttribute('aria-hidden', 'true');
      document.getElementById('app').setAttribute('aria-busy', 'false');
    }, 1000);
  }

  /* =========================================================
   * Expose — window.DeLee
   * ========================================================= */
  window.DeLee = {
    runPreview,
    scheduleRun,
    toast: (...args) => window.Modals.toast(...args),
    prompt: (...args) => window.Modals.prompt(...args),
    confirm: (...args) => window.Modals.confirm(...args),
    vfs,
    addConsole: (...args) => window.ConsolePanel.add(...args),
    clearConsole: (...args) => window.ConsolePanel.clear(...args),
    updateEntrySelect,
    updateStatusBar,
    loadSample,

    cleanup() {
      if (lastCtx) { lastCtx.revokeAll(); lastCtx = null; }
      _appSubs.forEach(fn => fn());
      _appSubs.length = 0;
      window.Explorer?.cleanup();
      window.Tabs?.closeAll();
      clearTimeout(runTimer);
      runTimer = null;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();