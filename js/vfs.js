
/* =========================================================
 * vfs.js — Virtual File System + IndexedDB Persistence
 * ========================================================= */
(function () {
  'use strict';

  const DB_NAME = 'DeLeePad_VFS';
  const STORE = 'project';
  const KEY = 'current';
  const MAX_BINARY_SIZE = 5 * 1024 * 1024; // 5MB

  /* ---------- IndexedDB Helpers ---------- */
  function openDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  async function idbGet(key) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(key);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }

  async function idbSet(key, val) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  /* ---------- Path Utils ---------- */
  function normalize(p) {
    if (!p) return '';
    let s = String(p).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
    const parts = [];
    for (const seg of s.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    return parts.join('/');
  }

  function dirname(p) {
    p = normalize(p);
    const i = p.lastIndexOf('/');
    return i < 0 ? '' : p.slice(0, i);
  }

  function basename(p) {
    p = normalize(p);
    const i = p.lastIndexOf('/');
    return i < 0 ? p : p.slice(i + 1);
  }

  function joinPath(a, b) {
    return normalize((a ? a + '/' : '') + b);
  }

  function extOf(name) {
    const m = /\.([^./\\]+)$/.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  function resolveRef(baseFile, ref) {
    if (!ref) return null;
    if (/^(?:https?:)?\/\//i.test(ref)) return null;
    if (/^(?:data|blob|mailto|tel|javascript):/i.test(ref)) return null;
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) return null;
    return clean.startsWith('/')
      ? normalize(clean)
      : joinPath(dirname(baseFile), clean);
  }

  /* ---------- MIME Types ---------- */
  const MIME = {
    html: 'text/html', htm: 'text/html',
    css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
    json: 'application/json', svg: 'image/svg+xml',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
    mp3: 'audio/mpeg', mp4: 'video/mp4', webm: 'video/webm',
    txt: 'text/plain', md: 'text/markdown', xml: 'application/xml',
  };

  const TEXT_EXTS = new Set([
    'html', 'htm', 'css', 'js', 'mjs', 'json', 'svg', 'txt', 'md', 'xml',
    'vue', 'ts', 'jsx', 'tsx', 'yml', 'yaml'
  ]);

  function mimeOf(name) { return MIME[extOf(name)] || 'application/octet-stream'; }
  function isTextExt(name) { const ext = extOf(name); return !ext || TEXT_EXTS.has(ext); }

  /* ---------- Base64 Helpers ---------- */
  async function bytesToB64(bytes) {
    const blob = new Blob([bytes]);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result ? reader.result.split(',')[1] : null);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function b64ToBytes(b64) {
    const resp = await fetch('data:application/octet-stream;base64,' + b64);
    return new Uint8Array(await resp.arrayBuffer());
  }

  /* ---------- VFS Class ---------- */
  class VFS {
    constructor() {
      this.files = new Map();
      this.listeners = new Set();
      this.projectName = 'untitled';
    }

    on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit(ev) { this.listeners.forEach(fn => { try { fn(ev); } catch (e) { console.error(e); } }); }

    list() { return Array.from(this.files.values()); }
    has(p) { return this.files.has(normalize(p)); }
    get(p) { return this.files.get(normalize(p)); }

    _ensureParents(p) {
      const parts = normalize(p).split('/');
      parts.pop();
      let acc = '';
      for (const seg of parts) {
        acc = acc ? acc + '/' + seg : seg;
        if (!this.files.has(acc)) {
          this.files.set(acc, { path: acc, type: 'folder', content: null, binary: false, mime: '', mtime: Date.now() });
        }
      }
    }

    mkdir(p) {
      p = normalize(p);
      if (!p) return;
      if (this.files.has(p)) {
        const e = this.files.get(p);
        if (e.type !== 'folder') throw new Error('Dosya zaten var: ' + p);
        return e;
      }
      this._ensureParents(p);
      const e = { path: p, type: 'folder', content: null, binary: false, mime: '', mtime: Date.now() };
      this.files.set(p, e);
      this.emit({ type: 'create', path: p, entry: e });
      return e;
    }

    writeFile(p, content, opts = {}) {
      p = normalize(p);
      if (!p) throw new Error('Geçersiz yol');
      this._ensureParents(p);
      const binary = opts.binary ?? (content instanceof Uint8Array);
      const mime = opts.mime || mimeOf(p);
      const existed = this.files.has(p);
      const entry = { path: p, type: 'file', content, binary: !!binary, mime, mtime: Date.now() };
      this.files.set(p, entry);
      this.emit({ type: existed ? 'update' : 'create', path: p, entry });
      return entry;
    }

    delete(p) {
      p = normalize(p);
      if (!this.files.has(p)) return false;
      if (this.files.get(p).type === 'folder') {
        const prefix = p + '/';
        const toDelete = [p];
        this.files.forEach((_, k) => { if (k.startsWith(prefix)) toDelete.push(k); });
        toDelete.forEach(k => this.files.delete(k));
      } else {
        this.files.delete(p);
      }
      this.emit({ type: 'delete', path: p });
      return true;
    }

    rename(oldP, newP) {
      oldP = normalize(oldP); newP = normalize(newP);
      if (!this.files.has(oldP)) throw new Error('Bulunamadı: ' + oldP);
      if (this.files.has(newP)) throw new Error('Hedef zaten var: ' + newP);
      const entry = this.files.get(oldP);

      if (entry.type === 'folder') {
        const prefix = oldP + '/', newPrefix = newP + '/';
        const entries = [];
        this.files.forEach((v, k) => { if (k === oldP || k.startsWith(prefix)) entries.push([k, v]); });
        entries.forEach(([k]) => this.files.delete(k));
        entries.forEach(([k, v]) => {
          const nk = k === oldP ? newP : newPrefix + k.slice(prefix.length);
          this._ensureParents(nk);
          this.files.set(nk, { ...v, path: nk });
        });
      } else {
        this.files.delete(oldP);
        this._ensureParents(newP);
        this.files.set(newP, { ...entry, path: newP, mime: mimeOf(newP) });
      }
      this.emit({ type: 'rename', from: oldP, to: newP });
      return true;
    }

    clear() {
      this.files.clear();
      this.projectName = 'untitled';
      this.emit({ type: 'clear' });
    }

    async toJSON() {
      const files = {};
      for (const [k, v] of this.files) {
        let content = v.content;
        if (v.type === 'file' && v.binary && content instanceof Uint8Array) {
          if (content.length <= MAX_BINARY_SIZE) {
            content = { __b64: await bytesToB64(content) };
          } else {
            console.warn('[VFS] Binary atla (çok büyük): ' + k);
            content = null;
          }
        }
        files[k] = { ...v, content };
      }
      return { projectName: this.projectName, files };
    }

    async fromJSON(obj) {
      this.files.clear();
      this.projectName = obj.projectName || 'untitled';
      for (const [k, v] of Object.entries(obj.files || {})) {
        let content = v.content;
        if (v.type === 'file' && v.binary && content?.__b64) {
          content = await b64ToBytes(content.__b64);
        }
        this.files.set(k, { ...v, content });
      }
      this.emit({ type: 'load' });
    }

    async save() {
      try { await idbSet(KEY, await this.toJSON()); } catch (e) { console.warn('VFS save failed', e); }
      // Dışa kayıt hook — app.js tarafından ayarlanır
      if (typeof window._doExternalSave === 'function') window._doExternalSave(this);
    }
    async load() {
      try { const data = await idbGet(KEY); if (data?.files) await this.fromJSON(data); return !!data; }
      catch (e) { console.warn('VFS load failed', e); return false; }
    }
  }


  /* ---------- Directory Handle Storage (File System Access API) ---------- */
  const _DIR_DB = 'DeLeePad_DirHandle';
  const _DIR_STORE = 'handle';

  async function _openDirDB() {
    return new Promise(function (res, rej) {
      var req = indexedDB.open(_DIR_DB, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(_DIR_STORE)) req.result.createObjectStore(_DIR_STORE);
      };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }

  async function getDirHandle() {
    try {
      var db = await _openDirDB();
      return new Promise(function (res, rej) {
        var tx = db.transaction(_DIR_STORE, 'readonly');
        var rq = tx.objectStore(_DIR_STORE).get('dir');
        rq.onsuccess = function () { res(rq.result || null); };
        rq.onerror = function () { rej(rq.error); };
      });
    } catch (e) { return null; }
  }

  async function setDirHandle(handle) {
    var db = await _openDirDB();
    return new Promise(function (res, rej) {
      var tx = db.transaction(_DIR_STORE, 'readwrite');
      tx.objectStore(_DIR_STORE).put(handle, 'dir');
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error); };
    });
  }

  async function clearDirHandle() {
    try {
      var db = await _openDirDB();
      return new Promise(function (res, rej) {
        var tx = db.transaction(_DIR_STORE, 'readwrite');
        tx.objectStore(_DIR_STORE).delete('dir');
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    } catch (e) {}
  }

  async function verifyDirPermission(handle) {
    if (!handle) return false;
    try {
      var perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') return true;
      if (perm === 'prompt') {
        var req = await handle.requestPermission({ mode: 'readwrite' });
        return req === 'granted';
      }
      return false;
    } catch (e) { return false; }
  }

  async function saveFilesToDir(dirHandle, files, projectName) {
    if (!dirHandle || !files || !files.length) return false;
    try {
      var base = dirHandle;
      if (projectName) {
        try { base = await dirHandle.getDirectoryHandle(projectName, { create: true }); }
        catch (e) { base = dirHandle; }
      }
      for (var i = 0; i < files.length; i++) {
        var entry = files[i];
        if (entry.type !== 'file') continue;
        var parts = entry.path.split('/');
        var cur = base;
        for (var j = 0; j < parts.length - 1; j++) {
          cur = await cur.getDirectoryHandle(parts[j], { create: true });
        }
        var fh = await cur.getFileHandle(parts[parts.length - 1], { create: true });
        var w = await fh.createWritable();
        if (entry.binary && entry.content instanceof Uint8Array) {
          await w.write(entry.content);
        } else {
          await w.write(String(entry.content || ''));
        }
        await w.close();
      }
      return true;
    } catch (e) {
      console.warn('[VFS] Dışa kayıt hatası:', e);
      return false;
    }
  }

  async function getDirName(handle) {
    if (!handle) return null;
    try { return handle.name || null; } catch (e) { return null; }
  }


  /* ---------- Expose ---------- */
    window.VFS = {
    instance: new VFS(),
    normalize, dirname, basename, joinPath, resolveRef, extOf,
    mimeOf, isTextExt, MAX_BINARY_SIZE, bytesToB64, b64ToBytes,
    getDirHandle, setDirHandle, clearDirHandle, verifyDirPermission, saveFilesToDir, getDirName,
  };

})();