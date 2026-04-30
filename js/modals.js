/* =========================================================
 * modals.js — Prompt/Confirm Modal, Toast
 * ========================================================= */
(function () {
  'use strict';

  /* ---------- Toast ---------- */
  function toast(msg, type = 'info', dur = 2800) {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const c = document.getElementById('toast-container');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    const _esc = (window.Utils && window.Utils.escapeHtml)
      ? window.Utils.escapeHtml
      : (s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'));
    el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span style="flex:1">${_esc(msg)}</span>`;
    el.addEventListener('click', () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); });
    c.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, dur);
  }

  /* ---------- Prompt Modal ---------- */
  function showPrompt(msg, defVal = '', title = 'Giriş') {
    return new Promise(res => {
      const m = document.getElementById('prompt-modal');
      if (!m) { res(null); return; }

      document.getElementById('prompt-title').textContent = title;
      document.getElementById('prompt-msg').textContent = msg;
      const inp = document.getElementById('prompt-input');
      inp.value = defVal;
      m.classList.add('open');
      window.Utils.setInert(true);
      const releaseTrap = window.Utils.trapFocus(m.querySelector('.modal'));

      function cleanup(val) {
        window.Utils.setInert(false);
        releaseTrap();
        m.classList.remove('open');
        m.querySelectorAll('button').forEach(btn => { btn.onclick = null; });
        inp.onkeydown = null;
        res(val);
      }

      setTimeout(() => { inp.focus(); inp.select(); }, 50);

      document.getElementById('prompt-ok').onclick = () => cleanup(inp.value.trim());
      document.getElementById('prompt-cancel').onclick = () => cleanup(null);
      document.getElementById('prompt-close').onclick = () => cleanup(null);
      inp.onkeydown = e => {
        if (e.key === 'Enter') { e.preventDefault(); cleanup(inp.value.trim()); }
        if (e.key === 'Escape') cleanup(null);
      };
    });
  }

  /* ---------- Confirm Modal (2 veya 3 seçenekli) ----------
   *
   * Return değerleri:
   *   true      → Primary buton (okText)
   *   'secondary' → İkincil buton (secondaryText)
   *   false     → İptal / Escape
   *
   * options:
   *   okText          — Primary buton metni (varsayılan: 'Tamam')
   *   okClass         — Primary buton CSS class'ı (varsayılan: 'primary')
   *   secondaryText   — İkincil buton metni (yoksa gizlenir)
   *   secondaryClass  — İkincil buton CSS class'ı (varsayılan: 'danger')
   * ──────────────────────────────────────────────────────── */
  function showConfirm(msg, title = 'Onay', options = {}) {
    return new Promise(res => {
      const m = document.getElementById('confirm-modal');
      if (!m) { res(false); return; }

      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-msg').textContent = msg;

      /* ── Primary buton ── */
      const okBtn = document.getElementById('confirm-ok');
      okBtn.textContent = options.okText || 'Tamam';
      okBtn.className = 'modal-btn ' + (options.okClass || 'primary');

      /* ── İkincil buton ── */
      const secondaryBtn = document.getElementById('confirm-secondary');
      if (options.secondaryText) {
        secondaryBtn.textContent = options.secondaryText;
        secondaryBtn.style.display = '';
        secondaryBtn.className = 'modal-btn ' + (options.secondaryClass || 'danger');
        secondaryBtn.onclick = () => cleanup('secondary');
      } else {
        secondaryBtn.style.display = 'none';
        secondaryBtn.onclick = null;
      }

      m.classList.add('open');
      window.Utils.setInert(true);
      const releaseTrap = window.Utils.trapFocus(m.querySelector('.modal'));

      let onKey;
      function cleanup(val) {
        document.removeEventListener('keydown', onKey);
        window.Utils.setInert(false);
        releaseTrap();
        m.classList.remove('open');
        m.querySelectorAll('button').forEach(btn => { btn.onclick = null; });
        res(val);
      }

      onKey = e => {
        if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
      };

      okBtn.onclick = () => cleanup(true);
      document.getElementById('confirm-cancel').onclick = () => cleanup(false);
      document.getElementById('confirm-close').onclick = () => cleanup(false);
      document.addEventListener('keydown', onKey);
    });
  }

  /* ---------- Expose ---------- */
  window.Modals = {
    toast,
    prompt: showPrompt,
    confirm: showConfirm,
  };

})();