/* =========================================================
 * io.js — Upload, Download ZIP, Prettier Format
 * ========================================================= */
(function () {
  'use strict';

  const V = window.VFS;
  const vfs = V.instance;

  /* ---------- FileReader Helpers ---------- */
  function readFileAsText(f) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsText(f, 'UTF-8');
    });
  }

  function readFileAsBytes(f) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(new Uint8Array(r.result));
      r.onerror = rej;
      r.readAsArrayBuffer(f);
    });
  }

  async function addFileToVFS(relPath, file) {
    const path = V.normalize(relPath);
    if (V.isTextExt(file.name)) {
      vfs.writeFile(path, await readFileAsText(file), { binary: false });
    } else {
      vfs.writeFile(path, await readFileAsBytes(file), { binary: true, mime: V.mimeOf(file.name) });
    }
  }

  /* ---------- Dosya Yükleme ---------- */
  async function handleFiles(fileList, opts = {}) {
    const files = Array.from(fileList);
    if (!files.length) return;

    const topFolder = (function () {
      const rels = files.map(f => f.webkitRelativePath || '').filter(Boolean);
      if (!rels.length) return null;
      const tops = new Set(rels.map(r => r.split('/')[0]));
      return tops.size === 1 ? [...tops][0] : null;
    })();

    let added = 0;
    for (const f of files) {
      let rp = f.webkitRelativePath || f.name;
      if (opts.stripTop) {
        const parts = rp.split('/');
        if (parts.length > 1) rp = parts.slice(1).join('/');
      }
      try { await addFileToVFS(rp, f); added++; }
      catch (err) { console.error(err); }
    }

    if (topFolder && opts.stripTop) setProjectName(topFolder);
    else if (!opts.stripTop && files.length === 1) setProjectName(files[0].name.replace(/\.[^.]+$/, ''));

    await vfs.save();
    window.DeLee?.toast(`${added} dosya eklendi`, 'success');

    if (!window.Tabs.activePath) {
      const entry = window.DeLee.updateEntrySelect();
      if (entry) window.Tabs.openFile(entry);
    }
    window.DeLee.updateStatusBar();
    window.DeLee.runPreview();
  }

  /* ---------- ZIP Yükleme ---------- */
  async function handleZip(file) {
    const jz = await JSZip.loadAsync(file);
    let added = 0;
    const topFolders = new Set();
    jz.forEach((rel, zf) => { if (!zf.dir) topFolders.add(rel.split('/')[0]); });
    const stripTop = topFolders.size === 1;
    const prefix = stripTop ? [...topFolders][0] + '/' : '';

    const entries = [];
    jz.forEach((rel, zf) => { if (!zf.dir) entries.push({ rel, zf }); });

    for (const { rel, zf } of entries) {
      let path = rel;
      if (prefix && path.startsWith(prefix)) path = path.slice(prefix.length);
      if (!path) continue;
      try {
        if (V.isTextExt(path)) vfs.writeFile(path, await zf.async('string'), { binary: false });
        else vfs.writeFile(path, await zf.async('uint8array'), { binary: true, mime: V.mimeOf(path) });
        added++;
      } catch (err) { console.warn('zip entry failed', rel, err); }
    }

    setProjectName(stripTop ? [...topFolders][0] : file.name.replace(/\.zip$/i, ''));
    await vfs.save();
    window.DeLee?.toast(`ZIP'ten ${added} dosya çıkarıldı`, 'success');

    if (!window.Tabs.activePath) {
      const entry = window.DeLee.updateEntrySelect();
      if (entry) window.Tabs.openFile(entry);
    }
    window.DeLee.updateStatusBar();
    window.DeLee.runPreview();
  }

  /* ---------- ZIP İndirme ---------- */
  async function downloadZip() {
    if (!vfs.list().filter(e => e.type === 'file').length) {
      window.DeLee?.toast('Proje boş', 'warning');
      return;
    }
    const zip = new JSZip();
    vfs.list().forEach(e => { if (e.type === 'file') zip.file(e.path, e.binary ? e.content : String(e.content || '')); });
    const name = (document.getElementById('project-name').value || vfs.projectName || 'project').trim() + '.zip';
    const blob = await zip.generateAsync({ type: 'blob' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1500);
    window.DeLee?.toast('İndiriliyor: ' + name, 'success');
  }

  /* ---------- Proje Adı ---------- */
  function setProjectName(name) {
    if (!name) return;
    const clean = String(name).trim().replace(/[\/]/g, '-');
    if (!clean) return;
    vfs.projectName = clean;
    const inp = document.getElementById('project-name');
    if (inp) inp.value = clean;
  }

  /* ---------- Prettier Formatlama ---------- */
  async function formatActiveFile() {
    const path = window.Tabs.activePath;
    if (!path) { window.DeLee?.toast('Açık dosya yok', 'warning'); return; }

    const entry = vfs.get(path);
    if (!entry || entry.type !== 'file' || entry.binary) {
      window.DeLee?.toast('Bu dosya formatlanamaz', 'warning');
      return;
    }

    if (typeof window.prettier === 'undefined' || !window.prettier.format) {
      window.DeLee?.toast('Prettier yüklenemedi', 'error');
      return;
    }

    if (!window.prettierPlugins || typeof window.prettierPlugins !== 'object') {
      window.DeLee?.toast('Prettier plugin\'leri yüklenemedi. Sayfayı yenileyin.', 'error');
      return;
    }

    const ext = V.extOf(path);
    const parserMap = {
      html: 'html', htm: 'html', svg: 'html', xml: 'html',
      css: 'css', scss: 'css', less: 'css',
      js: 'babel', mjs: 'babel', jsx: 'babel', cjs: 'babel',
      ts: 'typescript', tsx: 'typescript',
      json: 'json', md: 'markdown', markdown: 'markdown',
    };
    const parser = parserMap[ext];
    if (!parser) { window.DeLee?.toast('Bu dosya tipi desteklenmiyor: .' + ext, 'warning'); return; }

    const pluginKey = { html: 'html', css: 'css', babel: 'babel', typescript: 'typescript', json: 'json', markdown: 'markdown' }[parser];
    if (!pluginKey || !window.prettierPlugins[pluginKey]) {
      window.DeLee?.toast('Prettier ' + parser + ' parser\'ı yüklenemedi.', 'error');
      return;
    }

    const tab = window.Tabs.openTabs.find(t => t.path === path);
    const code = (tab?.cm) ? String(tab.cm.getValue()) : String(entry.content || '');
    if (!code.trim()) { window.DeLee?.toast('Dosya boş', 'info'); return; }

    let formatted;
    try {
      const opts = { parser, plugins: window.prettierPlugins, tabWidth: 2, singleQuote: true, semi: true, printWidth: 80 };
      if (parser === 'html') opts.htmlWhitespaceSensitivity = 'css';
      formatted = String(await Promise.resolve(window.prettier.format(code, opts)));
      if (!formatted) throw new Error('Prettier sonuç boş döndü');
    } catch (err) {
      let msg = 'Format hatası';
      try {
        msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err)?.substring(0, 300) || String(err));
        msg = String(msg).substring(0, 300);
      } catch (_) { msg = 'Format hatası (detay alınamadı)'; }
      window.DeLee?.toast(msg, 'error', 4000);
      return;
    }

    if (formatted === code) { window.DeLee?.toast('Dosya zaten formatlı', 'info'); return; }

    // Önizleme modalı
    const approved = await showFormatPreview({ path, parser, original: code, formatted });
    if (!approved) { window.DeLee?.toast('Formatlama iptal edildi', 'info'); return; }

    // Uygula
    if (tab?.cm) {
      const scroll = tab.cm.getScrollInfo();
      tab.cm.operation(() => tab.cm.setValue(formatted));
      tab.cm.scrollTo(scroll.left, scroll.top);
    } else {
      entry.content = formatted;
      entry.mtime = Date.now();
      vfs.save();
    }
    window.DeLee?.toast('Formatlandı', 'success');
  }

  /* ---------- Format Önizleme Modalı ---------- */
  function showFormatPreview({ path, parser, original, formatted }) {
    return new Promise(function (res) {
      const modal = document.getElementById('format-modal');
      const titleEl = document.getElementById('format-title');
      const infoEl = document.getElementById('format-info');
      const previewEl = document.getElementById('format-preview');
      const applyBtn = document.getElementById('format-apply');
      const cancelBtn = document.getElementById('format-cancel');
      const closeBtn = document.getElementById('format-close');

      if (!modal) { res(false); return; }

      const origLines = original.split('\n').length;
      const newLines = formatted.split('\n').length;
      const diffChars = formatted.length - original.length;

      titleEl.textContent = 'Format Önizlemesi — ' + path;
      infoEl.innerHTML = `<b>Parser:</b> ${window.Utils.escapeHtml(parser)} &nbsp;&middot;&nbsp; <b>Satır:</b> ${origLines} → ${newLines} &nbsp;&middot;&nbsp; <b>Karakter farkı:</b> ${diffChars > 0 ? '+' : ''}${diffChars}<br><span style="opacity:.8">Onaylarsanız kod değiştirilir. İptal ederseniz mevcut kod korunur.</span>`;
      previewEl.textContent = formatted;
      previewEl.scrollTop = 0;

      modal.classList.add('open');
      window.Utils.setInert(true);
      const releaseTrap = window.Utils.trapFocus(modal.querySelector('.modal'));

      let onKey;
      function cleanup(val) {
        document.removeEventListener('keydown', onKey);
        window.Utils.setInert(false);
        releaseTrap();
        modal.classList.remove('open');
        modal.querySelectorAll('button').forEach(btn => { btn.onclick = null; });
        res(val);
      }

      onKey = e => {
        if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); cleanup(true); }
      };

      applyBtn.onclick = () => cleanup(true);
      cancelBtn.onclick = () => cleanup(false);
      closeBtn.onclick = () => cleanup(false);
      document.addEventListener('keydown', onKey);
    });
  }

  /* ---------- Expose ---------- */
  window.IO = {
    handleFiles,
    handleZip,
    downloadZip,
    formatActiveFile,
    setProjectName,
  };

})();