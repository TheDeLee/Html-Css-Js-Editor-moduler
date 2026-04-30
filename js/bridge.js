<!-- ============ PYTHON BACKEND BRIDGE ============ -->

(function () {
  'use strict';

  /* ── Backend kontrolü ─────────────────────────────────── */
  const API = window.location.origin;
  let currentSavePath = null;   // Ayarlardan seçilen kayıt klasörü
  let currentProjectPath = null; // Açılan projenin dosya yolu (kaynak)
  let lastSavedPayload = null;  // beforeunload için cache
  let bridgeReady = false;

  async function api(path, opts = {}) {
    try {
      const res = await fetch(API + path, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
      });
      return await res.json();
    } catch (e) {
      console.warn('[Bridge] API hatası:', path, e);
      return null;
    }
  }

  /* ── Backend kontrol ──────────────────────────────────── */
  async function checkBackend() {
    const r = await api('/api/ping');
    if (r && r.alive) {
      bridgeReady = true;
      currentSavePath = r.saveDir || null;
      console.log('[Bridge] Python backend aktif — kayıt yolu:', currentSavePath);
      initBridge();
    } else {
      console.log('[Bridge] Python backend bulunamadı — standalone mod');
    }
  }

  /* ── Bridge Başlat ────────────────────────────────────── */
  function initBridge() {
    overrideExternalSave();
    overrideSaveButton();
    overrideExitButton();
    overrideBrowseButton();
    overrideSettingsToggle();
    initRecentDropdown();
    initBeforeUnload();
    overrideOpenTab();
    updateSavePathUI();
  }

  /* =========================================================
   * 1. _doExternalSave override — Her vfs.save() çağrısında
   * ========================================================= */
  function overrideExternalSave() {
    window._externalSaveEnabled = true;

    window._doExternalSave = async function (vfsInstance) {
      if (!bridgeReady) return;

      try {
        const data = await vfsInstance.toJSON();
        lastSavedPayload = {
          projectName: data.projectName,
          files: data.files,
          saveDir: currentSavePath,
          sourcePath: currentProjectPath,
        };

        const result = await api('/api/save', {
          method: 'POST',
          body: JSON.stringify(lastSavedPayload),
        });

        if (result && result.success) {
          currentProjectPath = result.projectDir;
          updateRecentDropdown(result.recent);
          // Status bar güncelle
          const sb = document.getElementById('status-persist');
          if (sb) {
            sb.textContent = '📁 ' + result.projectName;
            sb.title = result.projectDir;
          }
        }
      } catch (e) {
        console.warn('[Bridge] Kayıt hatası:', e);
      }
    };
  }

  /* =========================================================
   * 2. Kaydet butonu override (data-action="kaydet")
   * ========================================================= */
  function overrideSaveButton() {
    const btn = document.querySelector('[data-action="kaydet"]');
    if (!btn) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      manualSave();
    }, true);
  }

  async function manualSave() {
    if (!bridgeReady) {
      window.VFS.instance.save();
      window.Modals.toast('IndexedDB kaydedildi', 'success');
      return;
    }

    window.Modals.toast('Kaydediliyor...', 'info', 1500);

    try {
      const data = await window.VFS.instance.toJSON();
      lastSavedPayload = {
        projectName: data.projectName,
        files: data.files,
        saveDir: currentSavePath,
        sourcePath: currentProjectPath,
      };

      const result = await api('/api/save', {
        method: 'POST',
        body: JSON.stringify(lastSavedPayload),
      });

      if (result && result.success) {
        currentProjectPath = result.projectDir;
        updateRecentDropdown(result.recent);
        window.Modals.toast(
          '💾 ' + result.savedFiles + ' dosya kaydedildi → ' + result.projectName,
          'success'
        );

        const sb = document.getElementById('status-persist');
        if (sb) {
          sb.textContent = '📁 ' + result.projectName;
          sb.title = result.projectDir;
        }
      } else {
        window.Modals.toast('Kayıt başarısız', 'error');
      }
    } catch (e) {
      window.Modals.toast('Kayıt hatası: ' + e.message, 'error');
    }
  }

  /* =========================================================
   * 3. Çıkış butonu override — Önce kaydet, sonra kapat
   * ========================================================= */
  function overrideExitButton() {
    const btn = document.querySelector('[data-action="cikis"]');
    if (!btn) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      saveAndExit();
    }, true);
  }

  async function saveAndExit() {
    if (!bridgeReady) {
      try { window.close(); } catch (e) {}
      if (!window.closed) window.Modals.toast('Sekmeyi manuel kapatın', 'warning', 4000);
      return;
    }

    try {
      const data = await window.VFS.instance.toJSON();
      await api('/api/save', {
        method: 'POST',
        body: JSON.stringify({
          projectName: data.projectName,
          files: data.files,
          saveDir: currentSavePath,
          sourcePath: currentProjectPath,
        }),
      });
    } catch (e) {}

    try { window.close(); } catch (e) {}
    if (!window.closed) window.Modals.toast('Sekmeyi manuel kapatın', 'warning', 4000);
  }

  /* =========================================================
   * 4. Gözat butonu override — tkinter dialog
   * ========================================================= */
  function overrideBrowseButton() {
    const btn = document.getElementById('set-save-path-browse');
    if (!btn) return;

    // Butonu aktif et (mevcut kod devre dışı bırakmış olabilir)
    btn.disabled = false;
    btn.textContent = '📁 Gözat';
    btn.title = 'Python ile klasör seç';

    // Mevcut event listener'ları temizle
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async function () {
      newBtn.textContent = '⏳...';
      newBtn.disabled = true;

      const result = await api('/api/browse', { method: 'POST' });

      newBtn.textContent = '📁 Gözat';
      newBtn.disabled = false;

      if (result && result.success) {
        currentSavePath = result.path;
        await api('/api/config', {
          method: 'POST',
          body: JSON.stringify({ savePath: result.path }),
        });

        updateSavePathUI();
        window.Modals.toast('Kayıt yolu: ' + result.path, 'success');

        // Kayıt yolunu değiştirmek mevcut projenin sourcePath'ini sıfırlar
        // (yeni klasöre yeni ProjeN olarak kaydedilir)
        currentProjectPath = null;
      } else if (result && result.error) {
        window.Modals.toast('Hata: ' + result.error, 'error');
      }
    });
  }

  function updateSavePathUI() {
    const pathInput = document.getElementById('set-save-path');
    const clearBtn = document.getElementById('set-save-path-clear');
    const statusDot = document.getElementById('save-path-status');
    const noteEl = document.getElementById('save-path-note');

    if (pathInput) {
      pathInput.value = currentSavePath || 'Projeler';
      pathInput.readOnly = false;
      pathInput.style.cursor = 'text';
    }

    if (clearBtn) {
      clearBtn.style.display = currentSavePath ? '' : 'none';
      // Clear butonunu yeniden bağla
      const newClear = clearBtn.cloneNode(true);
      clearBtn.parentNode.replaceChild(newClear, clearBtn);
      newClear.addEventListener('click', async function () {
        currentSavePath = null;
        currentProjectPath = null;
        await api('/api/config', {
          method: 'POST',
          body: JSON.stringify({ savePath: '' }),
        });
        updateSavePathUI();
        window.Modals.toast('Kayıt yolu varsayılana sıfırlandı', 'info');
      });
    }

    if (statusDot) {
      statusDot.style.background = currentSavePath ? 'var(--success)' : 'var(--text-muted)';
      statusDot.title = currentSavePath ? 'Klasör bağlı: ' + currentSavePath : 'Varsayılan yol';
    }

    if (noteEl) {
      noteEl.innerHTML = bridgeReady
        ? '💡 Dosyalar Python server üzerinden kaydedilir. Yeni projeler seçilen klasörün içine <b>Proje1, Proje2...</b> olarak oluşturulur.'
        : noteEl.innerHTML;
    }
  }

  /* =========================================================
   * 5. Settings toggle override — Python aktif gösterimi
   * ========================================================= */
  function overrideSettingsToggle() {
    const toggle = document.getElementById('set-external-save');
    if (!toggle) return;

    toggle.checked = true;
    toggle.disabled = true;

    const wrap = toggle.closest('.toggle-wrap');
    if (wrap) {
      const label = wrap.querySelector('label');
      if (label) {
        label.innerHTML = 'Dosya Sistemi Kayıt<span class="hint">Python server aktif — dosyalar otomatik kaydedilir</span>';
      }
    }

    // Not: save-path section'undaki note'u da güncelle
    const noteEl = document.getElementById('save-path-note');
    if (noteEl && bridgeReady) {
      noteEl.innerHTML = '💡 Dosyalar Python server üzerinden kaydedilir. Yeni projeler seçilen klasörün içine <b>Proje1, Proje2...</b> olarak oluşturulur.';
    }
  }

  /* =========================================================
   * 6. Son Kullanılanlar Dropdown
   * ========================================================= */
  function initRecentDropdown() {
    loadAndRenderRecent();
  }

  async function loadAndRenderRecent() {
    const result = await api('/api/recent');
    if (result) updateRecentDropdown(result);
  }

  function updateRecentDropdown(recent) {
    // Mevcut son kullananlar listesini temizle veya oluştur
    let container = document.getElementById('recent-projects-list');
    const sonItem = document.querySelector('[data-action="sonkullananlar"]');

    if (!sonItem) return;

    if (!container) {
      container = document.createElement('div');
      container.id = 'recent-projects-list';
      container.style.cssText = 'max-height:220px;overflow-y:auto;border-top:1px solid var(--border);margin-top:2px;';

      // sonkullananlar item'ından sonra ekle
      sonItem.insertAdjacentElement('afterend', container);
    }

    if (!recent || !recent.length) {
      container.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:var(--text-muted);">Henüz kayıtlı proje yok</div>';
      sonItem.style.display = 'none';
      return;
    }

    sonItem.style.display = '';
    container.innerHTML = '';

    recent.forEach(function (proj) {
      const item = document.createElement('div');
      item.className = 'upload-item';
      item.style.cssText = 'flex-direction:column;align-items:stretch;gap:2px;';
      item.dataset.recentPath = proj.path;
      item.innerHTML =
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span class="icon">📂</span>' +
          '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:500;">' +
            window.Utils.escapeHtml(proj.name) +
          '</span>' +
          '<button class="recent-remove-btn" data-recent-path="' + window.Utils.escapeHtml(proj.path) + '" ' +
            'style="width:18px;height:18px;border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;border-radius:3px;flex-shrink:0;" ' +
            'title="Kaldır">✕</button>' +
        '</div>' +
        '<div style="padding-left:26px;font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
          window.Utils.escapeHtml(proj.path) +
          (proj.date ? ' · ' + window.Utils.escapeHtml(proj.date) : '') +
        '</div>';

      // Proje açma
      item.addEventListener('click', function (e) {
        if (e.target.closest('.recent-remove-btn')) return;
        e.stopPropagation();
        openRecentProject(proj);
      });

      container.appendChild(item);
    });

    // Kaldır butonları
    container.querySelectorAll('.recent-remove-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const path = btn.dataset.recentPath;
        removeRecent(path);
      });
      btn.addEventListener('mouseenter', function () { btn.style.background = 'var(--bg-tertiary)'; btn.style.color = 'var(--text-primary)'; });
      btn.addEventListener('mouseleave', function () { btn.style.background = 'none'; btn.style.color = 'var(--text-muted)'; });
    });
  }

  async function openRecentProject(proj) {
    // Dropdown'u kapat
    document.getElementById('logo-dropdown')?.classList.remove('open');
    document.getElementById('logo-wrap')?.setAttribute('aria-expanded', 'false');

    const hasOpenFiles = window.VFS.instance.list().length > 0;

    if (hasOpenFiles) {
      const result = await window.Modals.confirm(
        '"' + proj.name + '" projesi açılsın mı?\n\nMevcut dosyalar kaydedilip temizlenecek.',
        'Proje Aç',
        {
          okText: '💾 Kaydet ve Aç',
          okClass: 'primary',
          secondaryText: '🗑 Kaydetmeden Aç',
          secondaryClass: 'danger',
        }
      );

      if (result === false) return; // İptal

      if (result === true) {
        // Mevcut projeyi kaydet
        try {
          const data = await window.VFS.instance.toJSON();
          await api('/api/save', {
            method: 'POST',
            body: JSON.stringify({
              projectName: data.projectName,
              files: data.files,
              saveDir: currentSavePath,
              sourcePath: currentProjectPath,
            }),
          });
        } catch (e) {}
      }
    }

    // Projeyi yükle
    window.Modals.toast('Yükleniyor: ' + proj.name, 'info', 2000);

    const result = await api('/api/load', {
      method: 'POST',
      body: JSON.stringify({ projectPath: proj.path }),
    });

    if (!result || !result.success) {
      window.Modals.toast('Proje yüklenemedi', 'error');
      return;
    }

    // VFS'i temizle ve yükle
    window.Tabs?.closeAll();
    window.VFS.instance.files.clear();
    window.VFS.instance.projectName = result.projectName;

    for (const [path, entry] of Object.entries(result.files)) {
      let content = entry.content;
      if (entry.type === 'file' && entry.binary && content && content.__b64) {
        content = await window.VFS.b64ToBytes(content.__b64);
      }
      window.VFS.instance.files.set(path, { ...entry, content });
    }

    currentProjectPath = result.sourcePath;
    document.getElementById('project-name').value = result.projectName;

    window.VFS.instance.emit({ type: 'load' });
    window.Explorer?.render();
    window.DeLee?.updateStatusBar();

    // İlk HTML dosyasını aç
    const htmlFiles = Object.entries(result.files)
      .filter(([, e]) => e.type === 'file' && /\.html?$/i.test(path))
      .map(([p]) => p)
      .sort();

    if (htmlFiles.length) {
      window.Tabs.openFile(htmlFiles[0]);
    } else {
      const firstFile = Object.entries(result.files).find(([, e]) => e.type === 'file');
      if (firstFile) window.Tabs.openFile(firstFile[0]);
    }

    window.DeLee?.updateEntrySelect();
    window.DeLee?.runPreview();
    updateRecentDropdown(result.recent);

    window.Modals.toast('✅ ' + proj.name + ' yüklendi', 'success');
  }

  async function removeRecent(path) {
    const result = await api('/api/recent/delete', {
      method: 'POST',
      body: JSON.stringify({ projectPath: path }),
    });
    if (result) updateRecentDropdown(result.recent);
  }

  /* =========================================================
   * 7. beforeunload — Otomatik kayıt
   * ========================================================= */
  function initBeforeUnload() {
    window.addEventListener('beforeunload', function (e) {
      if (!bridgeReady || !lastSavedPayload) return;

      // fetch + keepalive ile son state'i kaydet
      // (sayfa kapatıldıktan sonra bile tamamlanır)
      try {
        fetch(API + '/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lastSavedPayload),
          keepalive: true,
        });
      } catch (e) {}

      // Tarayıcıya "sayfadan ayrılmak istediğinize emin misiniz" sorusu
      // (Sadece değişiklik varsa)
      const dirtyTab = window.Tabs?.openTabs?.find(t => t.dirty);
      if (dirtyTab) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /* =========================================================
   * 8. Yeni Sekme Önizlemesi — Python server üzerinden
   *    module/import/export sorunsuz çalışır (same-origin)
   * ========================================================= */
  function overrideOpenTab() {
    const btn = document.getElementById('btn-open-tab');
    if (!btn) return;

    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async function () {
      const entry = window.DeLee?.updateEntrySelect();
      if (!entry) {
        window.Modals.toast('Önizlenecek HTML yok', 'warning');
        return;
      }

      if (!bridgeReady || !currentProjectPath) {
        // Fallback: mevcut blob URL yaklaşımı
        try {
          const { html, ctx } = await window.Bundler.bundle(window.VFS.instance, entry);
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const w = window.open(url, '_blank');
          if (!w) { window.Modals.toast('Açılır pencere engellendi', 'error'); return; }
          const cleanup = () => { try { URL.revokeObjectURL(url); } catch (e) {} try { ctx.revokeAll(); } catch (e) {} };
          const timer = setTimeout(cleanup, 10 * 60 * 1000);
          const iv = setInterval(() => { if (w.closed) { clearInterval(iv); clearTimeout(timer); cleanup(); } }, 1500);
          window.Modals.toast('Önizleme yeni sekmede (blob)', 'success');
        } catch (err) {
          window.Modals.toast('Hata: ' + err.message, 'error');
        }
        return;
      }

      // Python server üzerinden serve — module çalışır!
      const projectName = os_path_basename(currentProjectPath);
      const previewUrl = API + '/preview/' +
        encodeURIComponent(projectName) + '/' +
        encodeURIComponent(entry);

      const w = window.open(previewUrl, '_blank');
      if (!w) {
        window.Modals.toast('Açılır pencere engellendi', 'error');
        return;
      }

      window.Modals.toast('Önizleme yeni sekmede (ES modules aktif)', 'success');
    });
  }

  /** Basit path basename (backend'e bağımlı olmayan) */
  function os_path_basename(p) {
    if (!p) return '';
    p = p.replace(/\\/g, '/');
    const i = p.lastIndexOf('/');
    return i < 0 ? p : p.slice(i + 1);
  }

  /* =========================================================
   * 9. Yeni Proje Oluşturduğunda sourcePath sıfırla
   *    (checkBeforeCreate içinde çağrılan createFn'lerden sonra
   *     vfs.save() → _doExternalSave otomatik çalışır)
   * ========================================================= */
  const origCheckBeforeCreate = window.DeLee?.checkBeforeCreate;
  if (origCheckBeforeCreate) {
    // Yeni proje oluşturulduğunda sourcePath sıfırlanmalı
    // çünkü yeni ProjeN klasörü oluşturulacak
    const origVfsSave = window.VFS.instance.save.bind(window.VFS.instance);
    let pendingCreate = false;

    // doCreateSingleFile ve doCreateProject'dan önce sourcePath sıfırla
    const origDoCreateSingle = window.IO?.setProjectName;
    // Daha temiz yaklaşım: VFS clear olayını dinle
    window.VFS.instance.on(function (ev) {
      if (ev.type === 'clear') {
        currentProjectPath = null;
        pendingCreate = true;
      }
      if (ev.type === 'create' && pendingCreate) {
        pendingCreate = false;
      }
    });
  }

  /* =========================================================
   * 10. Son Kullanılanlar item'ına dropdown'da tıklama
   *     (dropdown'un kapanmasını engelle, listeyi göster)
   * ========================================================= */
  const sonItem = document.querySelector('[data-action="sonkullananlar"]');
  if (sonItem && bridgeReady) {
    sonItem.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      // Dropdown açık kalsın, sadece listeyi güncelle
      loadAndRenderRecent();
    }, true);
  }

  /* =========================================================
   * INIT
   * ========================================================= */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkBackend);
  } else {
    checkBackend();
  }

  /* ── Expose ────────────────────────────────────────────── */
  window.DeLeeBridge = {
    isReady: () => bridgeReady,
    getSavePath: () => currentSavePath,
    getProjectPath: () => currentProjectPath,
    setProjectPath: (p) => { currentProjectPath = p; },
    manualSave,
    loadAndRenderRecent,
  };

})();
