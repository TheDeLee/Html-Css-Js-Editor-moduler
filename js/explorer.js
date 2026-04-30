/* =========================================================
 * explorer.js — Dosya Ağacı Render & Etkileşim
 * - Differential render (hash karşılaştırma)
 * - RAF debounce
 * - Event delegation
 * ========================================================= */
(function () {
  'use strict';

  const V = window.VFS;
  const vfs = V.instance;
  const _subs = [];

  const state = {
    expanded: new Set(['']),
    active: null,
    renamingPath: null,
  };

  let renderPending = false;
  let lastTreeHash = '';

  function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return h;
  }

  function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
      renderPending = false;
      render();
    });
  }

  // VFS event filtreleme — 'update' (içerik değişikliği) render atlar
  _subs.push(vfs.on(ev => {
    if (ev.type === 'update') return;
    scheduleRender();
  }));

  function buildTree() {
    const tree = {};
    const all = vfs.list().sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
    all.forEach(entry => {
      const parts = entry.path.split('/');
      let node = tree;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        node.children = node.children || {};
        if (!node.children[part]) {
          node.children[part] = { name: part, path: parts.slice(0, i + 1).join('/'), type: 'folder', children: {} };
        }
        node = node.children[part];
      }
      Object.assign(node, entry, { name: V.basename(entry.path) });
    });
    return tree;
  }

  function render() {
    const allPaths = vfs.list().map(e => e.path).sort();
    const hash = simpleHash(allPaths.join(','));

    if (hash === lastTreeHash && !state.renamingPath) return;
    lastTreeHash = hash;

    const tree = buildTree();
    const root = document.getElementById('file-tree');
    if (!root) return;
    root.innerHTML = '';

    if (!tree.children || !Object.keys(tree.children).length) {
      root.innerHTML = '<div class="tree-empty">Henüz dosya yok<br><small>Yeni dosya ekle ya da yükle</small></div>';
      return;
    }

    const frag = document.createDocumentFragment();
    renderChildren(tree, frag, 0);
    root.appendChild(frag);
  }

  function renderChildren(parent, container, depth) {
    const children = parent.children || {};
    const keys = Object.keys(children).sort((a, b) => {
      const ca = children[a], cb = children[b];
      if (ca.type !== cb.type) return ca.type === 'folder' ? -1 : 1;
      return a.localeCompare(b);
    });

    keys.forEach((k, index) => {
      const node = children[k];
      const row = document.createElement('div');
      row.className = 'tree-row';
      row.style.paddingLeft = (8 + depth * 12) + 'px';
      row.dataset.path = node.path;
      row.dataset.type = node.type;
      row.setAttribute('tabindex', '-1');
      row.setAttribute('role', 'treeitem');
      if (node.type === 'folder') row.setAttribute('aria-expanded', String(state.expanded.has(node.path)));
      row.setAttribute('aria-level', String(depth + 1));
      row.setAttribute('aria-setsize', String(keys.length));
      row.setAttribute('aria-posinset', String(index + 1));
      row.setAttribute('draggable', 'true');
      if (state.active === node.path) row.classList.add('active');

      const caret = document.createElement('span');
      caret.className = 'tree-caret';
      caret.setAttribute('aria-hidden', 'true');
      if (node.type === 'folder') {
        caret.textContent = '▶';
        if (state.expanded.has(node.path)) caret.classList.add('open');
      }
      row.appendChild(caret);

      const icon = document.createElement('span');
      icon.className = 'tree-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = node.type === 'folder'
        ? (state.expanded.has(node.path) ? window.FILE_TAB_ICONS.folderOpen : window.FILE_TAB_ICONS.folder)
        : window.FileIcons.getForEntry(node);
      row.appendChild(icon);

      if (state.renamingPath === node.path) {
        const input = document.createElement('input');
        input.className = 'tree-rename';
        input.value = node.name;
        input.setAttribute('aria-label', node.name + ' — yeni ad girin');
        row.appendChild(input);
        setTimeout(() => { input.focus(); input.select(); }, 0);
      } else {
        const name = document.createElement('span');
        name.className = 'tree-name';
        name.textContent = node.name;
        row.appendChild(name);
      }

      container.appendChild(row);

      if (node.type === 'folder' && state.expanded.has(node.path)) {
        const childWrap = document.createElement('div');
        childWrap.className = 'tree-children';
        childWrap.setAttribute('role', 'group');
        renderChildren(node, childWrap, depth + 1);
        container.appendChild(childWrap);
      }
    });
  }

  /* ---------- Event Delegation ---------- */
  function initEventDelegation() {
    const root = document.getElementById('file-tree');
    if (!root) return;
    let currentDropTarget = null;

    root.addEventListener('click', function (e) {
      if (e.target.classList.contains('tree-rename')) return;
      const row = e.target.closest('.tree-row');
      if (!row) return;
      e.stopPropagation();
      const path = row.dataset.path;
      const type = row.dataset.type;

      if (type === 'folder') {
        if (state.expanded.has(path)) state.expanded.delete(path);
        else state.expanded.add(path);
        scheduleRender();
      } else {
        state.active = path;
        if (window.Tabs) window.Tabs.openFile(path);
        root.querySelectorAll('.tree-row.active').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
      }
    });

    root.addEventListener('contextmenu', function (e) {
      const row = e.target.closest('.tree-row');
      if (!row) return;
      e.preventDefault();
      const node = vfs.get(row.dataset.path);
      if (node) openCtx(e.clientX, e.clientY, node);
    });

    root.addEventListener('keydown', function (e) {
      if (e.target.classList.contains('tree-rename')) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', ' '].includes(e.key)) return;
      const currentRow = e.target.closest('.tree-row');
      if (!currentRow) return;
      e.preventDefault();

      const allVisible = Array.from(root.querySelectorAll('.tree-row')).filter(r => r.offsetParent !== null);
      const idx = allVisible.indexOf(currentRow);
      if (idx < 0) return;

      const path = currentRow.dataset.path;
      const type = currentRow.dataset.type;

      switch (e.key) {
        case 'ArrowDown':
          if (idx < allVisible.length - 1) allVisible[idx + 1].focus();
          break;
        case 'ArrowUp':
          if (idx > 0) allVisible[idx - 1].focus();
          break;
        case 'ArrowRight':
          if (type === 'folder' && !state.expanded.has(path)) {
            state.expanded.add(path);
            scheduleRender();
            requestAnimationFrame(() => {
              const firstChild = root.querySelector(`.tree-children > .tree-row[data-path^="${CSS.escape(path)}/"]`);
              if (firstChild) firstChild.focus();
            });
          } else if (type === 'folder') {
            const next = allVisible[idx + 1];
            if (next?.dataset.path.startsWith(path + '/')) next.focus();
          }
          break;
        case 'ArrowLeft':
          if (type === 'folder' && state.expanded.has(path)) {
            state.expanded.delete(path);
            scheduleRender();
            requestAnimationFrame(() => {
              const row = root.querySelector(`.tree-row[data-path="${CSS.escape(path)}"]`);
              if (row) row.focus();
            });
          } else {
            const parentPath = V.dirname(path);
            if (parentPath) {
              const parentRow = root.querySelector(`.tree-row[data-path="${CSS.escape(parentPath)}"]`);
              if (parentRow) parentRow.focus();
            }
          }
          break;
        case 'Home': allVisible[0]?.focus(); break;
        case 'End': allVisible[allVisible.length - 1]?.focus(); break;
        case 'Enter':
        case ' ':
          if (type === 'folder') {
            if (state.expanded.has(path)) state.expanded.delete(path);
            else state.expanded.add(path);
            scheduleRender();
          } else {
            state.active = path;
            if (window.Tabs) window.Tabs.openFile(path);
            root.querySelectorAll('.tree-row.active').forEach(r => r.classList.remove('active'));
            currentRow.classList.add('active');
          }
          break;
      }
    });

    root.addEventListener('focusout', function (e) {
      if (!e.target.classList.contains('tree-rename')) return;
      const row = e.target.closest('.tree-row');
      if (row) commitRename(row.dataset.path, e.target.value);
    });

    root.addEventListener('dragstart', function (e) {
      const row = e.target.closest('.tree-row');
      if (!row) return;
      e.dataTransfer.setData('text/delee-path', row.dataset.path);
      e.dataTransfer.effectAllowed = 'move';
    });

    root.addEventListener('dragover', function (e) {
      const row = e.target.closest('.tree-row');
      if (row) {
        e.preventDefault();
        if (currentDropTarget !== row) {
          if (currentDropTarget) currentDropTarget.classList.remove('drop-target');
          row.classList.add('drop-target');
          currentDropTarget = row;
        }
        root.classList.remove('drop-root');
      } else if (e.target === root || e.target.classList.contains('tree-empty')) {
        e.preventDefault();
        if (currentDropTarget) { currentDropTarget.classList.remove('drop-target'); currentDropTarget = null; }
        root.classList.add('drop-root');
      }
    });

    root.addEventListener('dragleave', function (e) {
      if (!root.contains(e.relatedTarget)) {
        if (currentDropTarget) { currentDropTarget.classList.remove('drop-target'); currentDropTarget = null; }
        root.classList.remove('drop-root');
      }
    });

    root.addEventListener('drop', function (e) {
      if (currentDropTarget) { currentDropTarget.classList.remove('drop-target'); currentDropTarget = null; }
      root.classList.remove('drop-root');
      const row = e.target.closest('.tree-row');
      const src = e.dataTransfer.getData('text/delee-path');
      if (!src) return;

      if (!row || row === root) {
        const newPath = V.basename(src);
        if (src !== newPath) {
          try { vfs.rename(src, newPath); vfs.save(); if (window.Tabs) window.Tabs.onRename(src, newPath); }
          catch (err) { window.DeLee?.toast(err.message, 'error'); }
        }
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      if (src === row.dataset.path) return;

      const targetDir = row.dataset.type === 'folder' ? row.dataset.path : V.dirname(row.dataset.path);
      if (targetDir === src || targetDir.startsWith(src + '/')) {
        window.DeLee?.toast('Klasörü kendi içine taşıyamazsınız', 'error');
        return;
      }

      const newPath = V.joinPath(targetDir, V.basename(src));
      if (newPath === src) return;
      try { vfs.rename(src, newPath); vfs.save(); if (window.Tabs) window.Tabs.onRename(src, newPath); }
      catch (err) { window.DeLee?.toast(err.message, 'error'); }
    });

    root.addEventListener('dragend', function () {
      if (currentDropTarget) { currentDropTarget.classList.remove('drop-target'); currentDropTarget = null; }
      root.classList.remove('drop-root');
    });
  }

  function commitRename(oldPath, newName) {
    newName = (newName || '').trim();
    state.renamingPath = null;
    if (!newName || newName === V.basename(oldPath)) { scheduleRender(); return; }
    const newPath = V.joinPath(V.dirname(oldPath), newName);
    try {
      vfs.rename(oldPath, newPath);
      vfs.save();
      if (window.Tabs) window.Tabs.onRename(oldPath, newPath);
      if (state.active === oldPath) state.active = newPath;
    } catch (err) {
      window.DeLee?.toast(err.message, 'error');
    }
  }

  /* ---------- Context Menu ---------- */
  let ctxTarget = null;

  function openCtx(x, y, node) {
  ctxTarget = node;
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    const bar = document.getElementById('mobile-ctx-bar');
    bar.classList.remove('open');
    const row = document.querySelector(
      '.tree-row[data-path="' + node.path.replace(/"/g, '\\"') + '"]'
    );
    if (row) {
      const r = row.getBoundingClientRect();

      bar.style.visibility = 'hidden';
      bar.style.display = 'flex';
      const barW = bar.offsetWidth;
      const barH = bar.offsetHeight;
      bar.style.display = '';
      bar.style.visibility = '';

      let left = r.right + 6;
      if (left + barW > window.innerWidth - 4) left = r.left - barW - 6;
      if (left < 4) left = 4;
      let top = r.top;
      if (top + barH > window.innerHeight - 8) top = window.innerHeight - barH - 8;
      if (top < 8) top = 8;
      bar.style.top = top + 'px';
      bar.style.left = left + 'px';
      bar.style.right = 'auto';
    } else {
      bar.style.top = y + 'px';
      bar.style.left = 'auto';
      bar.style.right = '8px';
    }
    requestAnimationFrame(() => bar.classList.add('open'));
  } else {
    const m = document.getElementById('ctx-menu');
    m.classList.add('open');
    m.style.left = '0px';
    m.style.top = '0px';
    m.offsetHeight; // forced reflow
    const rect = m.getBoundingClientRect();
    if (rect.right > window.innerWidth) m.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) m.style.top = (window.innerHeight - rect.height - 8) + 'px';
  }
}

  function closeCtx() {
    document.getElementById('ctx-menu')?.classList.remove('open');
    document.getElementById('mobile-ctx-bar')?.classList.remove('open');
    ctxTarget = null;
  }

  document.addEventListener('click', closeCtx);
  document.addEventListener('scroll', closeCtx, { passive: true, capture: true });

  document.getElementById('ctx-menu')?.addEventListener('keydown', function (e) {
    const items = Array.from(this.querySelectorAll('.ctx-item'));
    if (!items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const current = items.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown'
        ? items[(current + 1) % items.length]
        : items[(current - 1 + items.length) % items.length];
      next.focus();
    }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.activeElement.click(); }
    if (e.key === 'Escape') closeCtx();
  });

  function handleCtxAction(act, node) {
    closeCtx();
    switch (act) {
      case 'rename':
        state.renamingPath = node.path;
        scheduleRender();
        break;

      case 'duplicate': {
        // ✅ DÜZELTME: async fonksiyon düzgün çağrılıyor
        (async () => {
          let i = 1;
          let newP;
          const ext = V.extOf(node.path);
          do {
            const nm = V.basename(node.path).replace(/(\.[^.]+)?$/, '') + '-copy' + (i > 1 ? i : '') + (ext ? '.' + ext : '');
            newP = V.joinPath(V.dirname(node.path), nm);
            i++;
          } while (vfs.has(newP));

          if (node.type === 'folder') {
            const prefix = node.path + '/', newPrefix = newP + '/';
            const entries = [];
            vfs.files.forEach((v, k) => { if (k === node.path || k.startsWith(prefix)) entries.push([k, v]); });
            vfs.mkdir(newP);
            entries.forEach(([k, v]) => {
              const nk = k === node.path ? newP : newPrefix + k.slice(prefix.length);
              vfs.writeFile(nk, v.content, { binary: v.binary, mime: v.mime });
            });
          } else {
            vfs.writeFile(newP, node.content, { binary: node.binary, mime: node.mime });
          }
          vfs.save();
        })();
        break;
      }

      case 'move': {
        window.DeLee?.prompt('Hedef klasör yolu:', V.dirname(node.path), 'Taşı').then(target => {
          if (!target) return;
          const targetNorm = V.normalize(target);
          if (!vfs.has(targetNorm) || vfs.get(targetNorm).type !== 'folder') {
            window.DeLee?.toast('Hedef klasör bulunamadı', 'error');
            return;
          }
          const newPath = V.joinPath(targetNorm, V.basename(node.path));
          if (newPath === node.path) return;
          try {
            vfs.rename(node.path, newPath);
            vfs.save();
            if (window.Tabs) window.Tabs.onRename(node.path, newPath, node.type === 'folder');
          } catch (err) { window.DeLee?.toast(err.message, 'error'); }
        });
        break;
      }

      case 'newfile': {
        const base = node.type === 'folder' ? node.path : V.dirname(node.path);
        window.DeLee?.prompt('Yeni dosya adı:', 'new.js').then(name => {
          if (!name) return;
          const p = V.joinPath(base, name);
          if (vfs.has(p)) { window.DeLee?.toast('Dosya zaten var', 'error'); return; }
          vfs.writeFile(p, '');
          vfs.save();
          state.expanded.add(base);
          state.active = p;
          if (window.Tabs) window.Tabs.openFile(p);
        });
        break;
      }

      case 'newfolder': {
        const base = node.type === 'folder' ? node.path : V.dirname(node.path);
        window.DeLee?.prompt('Yeni klasör adı:', 'folder').then(name => {
          if (!name) return;
          try { vfs.mkdir(V.joinPath(base, name)); vfs.save(); state.expanded.add(V.joinPath(base, name)); }
          catch (err) { window.DeLee?.toast(err.message, 'error'); }
        });
        break;
      }

      case 'delete': {
        window.DeLee?.confirm('"' + V.basename(node.path) + '" silinsin mi?', 'Sil').then(ok => {
          if (!ok) return;
          vfs.delete(node.path);
          vfs.save();
          if (window.Tabs) window.Tabs.onDelete(node.path);
        });
        break;
      }
    }
  }

  document.getElementById('ctx-menu')?.addEventListener('click', e => {
    const act = e.target.closest('.ctx-item')?.dataset.action;
    if (act && ctxTarget) handleCtxAction(act, ctxTarget);
  });

  document.getElementById('mobile-ctx-bar')?.addEventListener('click', e => {
    const act = e.target.closest('button')?.dataset.action;
    if (act && ctxTarget) handleCtxAction(act, ctxTarget);
  });

  /* ---------- Init ---------- */
  initEventDelegation();
  render();

  /* ---------- Expose ---------- */
  window.Explorer = {
    render: scheduleRender,
    setActive(p) {
      state.active = p;
      const root = document.getElementById('file-tree');
      if (!root) return;
      const parent = V.dirname(p);
      if (parent && !state.expanded.has(parent)) {
        state.expanded.add(parent);
        scheduleRender();
      } else {
        root.querySelectorAll('.tree-row.active').forEach(r => r.classList.remove('active'));
        const row = root.querySelector(`.tree-row[data-path="${CSS.escape(p)}"]`);
        if (row) row.classList.add('active');
      }
    },
    expand(p) { state.expanded.add(p); scheduleRender(); },
    startRename(p) {
      state.renamingPath = p;
      const root = document.getElementById('file-tree');
      const row = root?.querySelector(`.tree-row[data-path="${CSS.escape(p)}"]`);
      if (!row) { scheduleRender(); return; }
      const nameSpan = row.querySelector('.tree-name');
      if (!nameSpan) { scheduleRender(); return; }
      const input = document.createElement('input');
      input.className = 'tree-rename';
      input.value = V.basename(p);
      nameSpan.replaceWith(input);
      setTimeout(() => { input.focus(); input.select(); }, 0);
    },
    collapseAll() { state.expanded.clear(); state.expanded.add(''); scheduleRender(); },
    expandAll() { vfs.list().forEach(e => { if (e.type === 'folder') state.expanded.add(e.path); }); scheduleRender(); },
    isAnyExpanded() { return vfs.list().some(e => e.type === 'folder' && state.expanded.has(e.path)); },
    cleanup() { _subs.forEach(fn => fn()); _subs.length = 0; },
  };

})();