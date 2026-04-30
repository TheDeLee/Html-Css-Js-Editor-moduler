/* =========================================================
 * tabs.js — Çoklu Sekme & CodeMirror Yönetimi
 * ========================================================= */
(function () {
  'use strict';

  const V = window.VFS;
  const vfs = V.instance;

  const state = {
    openTabs: [],
    activePath: null,
  };

  let saveTimer = null;

  function modeForPath(p) {
    return window.MODE_MAP[V.extOf(p)] || 'null';
  }

  function updateTabDirtyState(path, dirty) {
    const tab = document.querySelector(`.tab[data-path="${CSS.escape(path)}"]`);
    if (tab) tab.classList.toggle('dirty', dirty);
  }

  function updateStatusSaved(saved) {
    const el = document.getElementById('status-saved');
    if (!el) return;
    el.textContent = saved ? '✓' : '●';
    el.style.color = saved ? 'var(--success)' : 'var(--warning)';
  }

  function openFile(path) {
    path = V.normalize(path);
    const entry = vfs.get(path);
    if (!entry || entry.type !== 'file') return;

    document.getElementById('empty-state')?.style && (document.getElementById('empty-state').style.display = 'none');

    let tab = state.openTabs.find(t => t.path === path);
    if (!tab) {
      tab = createTab(path, entry);
      state.openTabs.push(tab);
    }
    activate(path);
  }

  /* ✅ DÜZELTME: Duplicate binary bloğu kaldırıldı */
  function createTab(path, entry) {
    path = V.normalize(path);

    const pane = document.createElement('div');
    pane.className = 'editor-pane';
    pane.dataset.path = path;

    const tabState = { path, cm: null, pane, dirty: false };
    let cm = null;

    if (entry.binary) {
      // Binary dosya önizleme
      const wrap = document.createElement('div');
      wrap.className = 'binary-preview';
      const ext = V.extOf(path);
      const hasContent = entry.content instanceof Uint8Array;
      const sizeText = hasContent ? (entry.content.length / 1024).toFixed(1) + ' KB' : 'boyut bilinmiyor';

      if (hasContent && /^(png|jpg|jpeg|gif|webp|bmp|ico|svg)$/i.test(ext)) {
        const url = URL.createObjectURL(new Blob([entry.content], { type: entry.mime }));
        const img = document.createElement('img');
        img.src = url;
        wrap.appendChild(img);
        pane._blobUrl = url;
      } else {
        const ic = document.createElement('div');
        ic.style.cssText = 'font-size:64px;opacity:.5';
        ic.textContent = '📦';
        wrap.appendChild(ic);
      }

      const info = document.createElement('div');
      info.className = 'info';
      info.innerHTML = !hasContent
        ? `<strong>${window.Utils.escapeHtml(path)}</strong><br>${window.Utils.escapeHtml(entry.mime)}<br><span style="color:var(--warning)">⚠ Dosya çok büyük veya içeriği yüklenemedi.</span><br><small>Binary — düzenlenemez</small>`
        : `<strong>${window.Utils.escapeHtml(path)}</strong><br>${window.Utils.escapeHtml(entry.mime)} · ${sizeText}<br><small>Binary — düzenlenemez</small>`;
      wrap.appendChild(info);
      pane.appendChild(wrap);
    } else {
      // Metin dosyası — CodeMirror
      const ta = document.createElement('textarea');
      pane.appendChild(ta);

      cm = CodeMirror.fromTextArea(ta, {
        mode: modeForPath(path),
        ...window.Settings.getCMOptions(),
        extraKeys: {
          'Ctrl-Enter': () => window.DeLee?.runPreview(),
          'Cmd-Enter': () => window.DeLee?.runPreview(),
          'Ctrl-S': () => window.DeLee?.runPreview(),
          'Cmd-S': () => window.DeLee?.runPreview(),
          'Ctrl-/': 'toggleComment',
          'Cmd-/': 'toggleComment',
          'Ctrl-Space': 'autocomplete',
          'Ctrl-G': 'jumpToLine',
          'Ctrl-F': () => window.SearchPanel?.open(),
          'Cmd-F': () => window.SearchPanel?.open(),
          'F11': 'toggleFullscreen',
          Tab: function (_cm) {
            if (_cm.somethingSelected()) _cm.indentSelection('add');
            else _cm.replaceSelection('  ');
          },
        },
      });

      cm.setValue(String(entry.content || ''));

      const wrapper = cm.getWrapperElement();
      if (wrapper) {
        wrapper.style.fontFamily = window.Settings.getFontCSS();
        wrapper.style.fontSize = window.Settings.getFontsize() + 'px';
      }

      cm.on('change', function () {
        const val = cm.getValue();
        const e = vfs.get(tabState.path);
        if (e && e.content !== val) {
          e.content = val;
          e.mtime = Date.now();
          if (!tabState.dirty) {
            tabState.dirty = true;
            updateTabDirtyState(tabState.path, true);
          }
          debounceSave();
          if (window.Settings.isLivePreview()) window.DeLee?.scheduleRun();
        }
        updateStatusSaved(false);
      });

      cm.on('cursorActivity', function () { updateStatus(cm, tabState.path); });
      tabState.cm = cm;
    }

    if (!pane.parentNode) document.getElementById('editors-container')?.appendChild(pane);
    return tabState;
  }

  function activate(path) {
    state.activePath = path;
    document.querySelectorAll('#editors-container .editor-pane').forEach(p => {
      p.classList.toggle('active', p.dataset.path === path);
    });
    renderTabsBar();

    const tab = state.openTabs.find(t => t.path === path);
    if (tab?.cm) {
      setTimeout(() => {
        if (tab.cm && state.activePath === path) {
          tab.cm.refresh();
          tab.cm.focus();
          updateStatus(tab.cm, path);
        }
      }, 20);
    } else {
      document.getElementById('status-cursor').textContent = '—';
      document.getElementById('status-file').textContent = path;
    }

    document.querySelectorAll('#tabs-bar .tab').forEach(t => {
      const isActive = t.dataset.path === path;
      t.setAttribute('aria-selected', String(isActive));
      t.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    window.Explorer?.setActive(path);
  }

  function closeTab(path) {
    const idx = state.openTabs.findIndex(t => t.path === path);
    if (idx < 0) return;
    const tab = state.openTabs[idx];

    if (tab.cm) {
      try {
        tab.cm.getAllMarks().forEach(m => m.clear());
        tab.cm.toTextArea();
      } catch (e) { console.warn('[closeTab] CodeMirror teardown hata:', e); }
      tab.cm = null;
    }

    if (tab.pane) {
      if (tab.pane._blobUrl) { try { URL.revokeObjectURL(tab.pane._blobUrl); } catch (e) {} }
      tab.pane.remove();
    }

    state.openTabs.splice(idx, 1);
    if (state.activePath === path) {
      const next = state.openTabs[idx] || state.openTabs[idx - 1];
      if (next) activate(next.path);
      else {
        state.activePath = null;
        document.getElementById('status-file').textContent = '—';
        const empty = document.getElementById('empty-state');
        if (empty) empty.style.display = '';
      }
    }
    renderTabsBar();
  }

  function renderTabsBar() {
    const bar = document.getElementById('tabs-bar');
    if (!bar) return;
    bar.querySelectorAll('.tab').forEach(t => t.remove());
    if (!state.openTabs.length) return;

    state.openTabs.forEach(tab => {
      const btn = document.createElement('div');
      btn.className = 'tab';
      btn.dataset.path = tab.path;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(tab.path === state.activePath));
      btn.setAttribute('tabindex', tab.path === state.activePath ? '0' : '-1');
      btn.id = 'tab-' + tab.path.replace(/[^a-z0-9]/gi, '-');
      if (tab.path === state.activePath) btn.classList.add('active');
      if (tab.dirty) btn.classList.add('dirty');

      const ic = document.createElement('span');
      ic.className = 'tab-icon';
      ic.textContent = window.FileIcons.getForPath(tab.path);
      btn.appendChild(ic);

      const nm = document.createElement('span');
      nm.className = 'tab-name';
      nm.textContent = V.basename(tab.path);
      nm.title = tab.path;
      btn.appendChild(nm);

      const dot = document.createElement('span');
      dot.className = 'tab-dot';
      btn.appendChild(dot);

      const cls = document.createElement('button');
      cls.className = 'tab-close';
      cls.textContent = '✕';
      cls.title = 'Kapat';
      cls.setAttribute('aria-label', V.basename(tab.path) + ' sekmesini kapat');
      cls.addEventListener('click', e => { e.stopPropagation(); closeTab(tab.path); });
      btn.appendChild(cls);

      btn.addEventListener('click', () => activate(tab.path));
      btn.addEventListener('mousedown', e => { if (e.button === 1) { e.preventDefault(); closeTab(tab.path); } });
      bar.appendChild(btn);
    });
  }

  function updateStatus(cm, path) {
    const c = cm.getCursor();
    document.getElementById('status-cursor').textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`;
    document.getElementById('status-file').textContent = path;
  }

    function debounceSave() {
    clearTimeout(saveTimer);
    if (!window.Settings.isAutosaveEnabled()) return;  // ← YENİ EKLENDİ
    saveTimer = setTimeout(() => {
      vfs.save();
      const tab = state.openTabs.find(t => t.path === state.activePath);
      if (tab?.dirty) {
        tab.dirty = false;
        updateTabDirtyState(tab.path, false);
      }
      updateStatusSaved(true);
    }, window.Settings.getAutosaveInterval());
  }

  function onRename(oldPath, newPath, isFolder = false) {
    const tab = state.openTabs.find(t => t.path === oldPath);
    if (tab) {
      tab.path = newPath;
      tab.pane.dataset.path = newPath;
      if (state.activePath === oldPath) state.activePath = newPath;
    }
    if (isFolder) {
      const prefix = oldPath + '/', newPrefix = newPath + '/';
      state.openTabs.forEach(t => {
        if (t.path.startsWith(prefix)) {
          t.path = newPrefix + t.path.slice(prefix.length);
          t.pane.dataset.path = t.path;
        }
      });
    }
    renderTabsBar();
  }

  function onDelete(path) {
    const prefix = path + '/';
    [...state.openTabs].forEach(t => {
      if (t.path === path || t.path.startsWith(prefix)) closeTab(t.path);
    });
  }

  function closeAll() {
    [...state.openTabs].forEach(t => closeTab(t.path));
  }

  /* ---------- Expose ---------- */
  window.Tabs = {
    openFile,
    closeTab,
    onRename,
    onDelete,
    closeAll,
    renderTabsBar,
    get activePath() { return state.activePath; },
    get openTabs() { return state.openTabs; },
    openAtLine(path, line, col) {
      path = V.normalize(path);
      if (!vfs.has(path)) return;
      openFile(path);
      const tab = state.openTabs.find(t => t.path === path);
      if (!tab?.cm) return;
      const l = Math.max(0, (line | 0) - 1);
      const c = Math.max(0, ((col | 0) - 1) || 0);
      setTimeout(() => {
        try {
          tab.cm.focus();
          tab.cm.setCursor({ line: l, ch: c });
          const t = tab.cm.charCoords({ line: l, ch: 0 }, 'local').top;
          const h = tab.cm.getScrollInfo().clientHeight;
          tab.cm.scrollTo(null, Math.max(0, t - h / 2));
          const info = tab.cm.addLineClass(l, 'background', 'cm-jump-flash');
          setTimeout(() => tab.cm.removeLineClass(l, 'background', 'cm-jump-flash'), 1200);
        } catch (e) {}
      }, 50);
    },
    refreshActive() {
      const tab = state.openTabs.find(t => t.path === state.activePath);
      if (tab?.cm) {
        const entry = vfs.get(tab.path);
        if (entry) tab.cm.setValue(String(entry.content || ''));
      }
    },
  };

})();