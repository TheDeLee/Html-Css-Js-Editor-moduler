/* =========================================================
 * search.js — Arama & Değiştirme Paneli
 * - Ctrl+F ile aç, Esc ile kapat
 * - Enter/Shift+Enter: Sonraki/Önceki
 * - Sürükle-bırak destekli
 * ========================================================= */
(function () {
  'use strict';

  const searchState = {
    matches: [],
    currentIndex: -1,
    allMarks: [],
    currentMark: null,
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    dragged: false,
  };

  const els = {};

  function collectEls() {
    const map = {
      'search-panel':      'panel',
      'search-input':      'input',
      'search-count':      'count',
      'search-next':       'next',
      'search-prev':       'prev',
      'search-close':      'close',
      'search-case':       'caseBtn',
      'search-word':       'wordBtn',
      'search-regex':      'regexBtn',
      'replace-input':     'replaceInput',
      'replace-one':       'replaceOne',
      'replace-all':       'replaceAll',
      'search-drag-handle':'dragHandle',
      'btn-search':        'searchBtn',
      'editor-area':       'editorArea',
    };
    Object.entries(map).forEach(([id, key]) => {
      els[key] = document.getElementById(id);
    });
  }

  function getActiveEditor() {
    const tabs = window.Tabs;
    if (!tabs?.activePath) return null;
    const tab = tabs.openTabs.find(t => t.path === tabs.activePath);
    return tab?.cm || null;
  }

  function toast(msg, type, dur) { window.DeLee?.toast(msg, type || 'info', dur || 2500); }

  /* ---------- Panel Kontrol ---------- */
  function openSearchPanel() {
    if (!els.panel) return;
    els.panel.classList.add('open');
    els.panel.setAttribute('aria-hidden', 'false');
    const cm = getActiveEditor();
    if (cm) {
      const sel = cm.getSelection();
      if (sel && sel.length < 200 && !sel.includes('\n')) {
        els.input.value = sel;
      }
    }
    els.input.focus();
    els.input.select();
    updateSearch();
  }

  function closeSearchPanel() {
    if (!els.panel) return;
    els.panel.classList.remove('open');
    els.panel.setAttribute('aria-hidden', 'true');
    clearSearchMarks();
    searchState.matches = [];
    searchState.currentIndex = -1;
    els.count.textContent = '—';
    els.count.className = 'search-count';
    els.input.classList.remove('no-match');
    getActiveEditor()?.focus();
  }

  function toggleSearchPanel() {
    if (!els.panel) return;
    els.panel.classList.contains('open') ? closeSearchPanel() : openSearchPanel();
  }

  /* ---------- Sorgu Oluştur ---------- */
  function buildSearchQuery() {
    const raw = els.input.value;
    if (!raw) return null;
    if (raw.length > window.MAX_PATTERN_LEN) {
      els.input.classList.add('no-match');
      els.count.textContent = 'Pattern çok uzun';
      els.count.className = 'search-count no-match';
      return null;
    }

    let flags = 'g';
    if (!searchState.caseSensitive) flags += 'i';

    try {
      let pattern = searchState.useRegex ? raw : raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!searchState.useRegex && searchState.wholeWord) pattern = '\\b' + pattern + '\\b';
      return new RegExp(pattern, flags);
    } catch (e) {
      return null;
    }
  }

  function clearSearchMarks() {
    searchState.allMarks.forEach(m => { try { m.clear(); } catch (e) {} });
    searchState.allMarks = [];
    if (searchState.currentMark) { try { searchState.currentMark.clear(); } catch (e) {} searchState.currentMark = null; }
  }

  /* ---------- Arama Güncelle ---------- */
  function updateSearch() {
    clearSearchMarks();
    searchState.matches = [];
    searchState.currentIndex = -1;

    const cm = getActiveEditor();
    if (!cm) {
      els.count.textContent = '—';
      els.count.className = 'search-count';
      updateSearchButtons();
      return;
    }

    const query = buildSearchQuery();
    if (!query) {
      els.count.textContent = '—';
      els.count.className = 'search-count';
      els.input.classList.remove('no-match');
      updateSearchButtons();
      return;
    }

    const content = cm.getValue();
    let match, timedOut = false;
    const MAX_MATCHES = 10000, MAX_SEARCH_MS = 300;
    query.lastIndex = 0;
    const searchStart = performance.now();

    while ((match = query.exec(content)) !== null) {
      searchState.matches.push({ from: cm.posFromIndex(match.index), to: cm.posFromIndex(match.index + match[0].length) });
      if (match[0].length === 0) query.lastIndex++;
      if (searchState.matches.length >= MAX_MATCHES) break;
      if (performance.now() - searchStart > MAX_SEARCH_MS) { timedOut = true; break; }
    }

    const total = searchState.matches.length;
    if (total === 0) {
      els.input.classList.add('no-match');
      els.count.textContent = 'Bulunamadı';
      els.count.className = 'search-count no-match';
      updateSearchButtons();
      return;
    }

    if (timedOut) { els.count.textContent = '⚠ Zaman aşımı'; els.count.className = 'search-count no-match'; }
    else if (total >= MAX_MATCHES) { els.count.textContent = MAX_MATCHES + '+'; els.count.className = 'search-count has-match'; }
    else { els.count.className = 'search-count'; }

    els.input.classList.remove('no-match');
    searchState.allMarks = searchState.matches.map(m => cm.markText(m.from, m.to, { className: 'cm-searching' }));

    const cursor = cm.getCursor();
    let nearest = 0;
    for (let i = 0; i < searchState.matches.length; i++) {
      if (searchState.matches[i].from.line > cursor.line || (searchState.matches[i].from.line === cursor.line && searchState.matches[i].from.ch >= cursor.ch)) {
        nearest = i;
        break;
      }
      nearest = i;
    }
    goToMatch(nearest, total);
  }

  function goToMatch(idx, total) {
    if (!searchState.matches.length) return;
    total = total || searchState.matches.length;
    idx = ((idx % total) + total) % total;
    searchState.currentIndex = idx;

    const cm = getActiveEditor();
    if (!cm) return;
    const m = searchState.matches[idx];

    if (searchState.currentMark) { try { searchState.currentMark.clear(); } catch (e) {} searchState.currentMark = null; }
    searchState.currentMark = cm.markText(m.from, m.to, { className: 'search-highlight-current' });
    cm.scrollIntoView({ from: m.from, to: m.to }, 80);
    cm.setSelection(m.from, m.to);
    els.count.textContent = `${idx + 1} / ${total}`;
    els.count.className = 'search-count has-match';
    updateSearchButtons();
  }

  function searchNext() { searchState.matches.length ? goToMatch((searchState.currentIndex + 1) % searchState.matches.length) : updateSearch(); }
  function searchPrev() { searchState.matches.length ? goToMatch((searchState.currentIndex - 1 + searchState.matches.length) % searchState.matches.length) : updateSearch(); }

  function updateSearchButtons() {
    const has = searchState.matches.length > 0;
    els.prev.disabled = !has;
    els.next.disabled = !has;
    els.replaceOne.disabled = !has;
    els.replaceAll.disabled = !has;
  }

  /* ---------- Değiştir ---------- */
  function replaceOne() {
    const cm = getActiveEditor();
    if (!cm || !searchState.matches.length) return;
    const idx = searchState.currentIndex;
    if (idx < 0) { goToMatch(0); return; }
    const m = searchState.matches[idx];
    cm.replaceRange(els.replaceInput.value, { line: m.from.line, ch: m.from.ch }, { line: m.to.line, ch: m.to.ch });
    updateSearch();
    toast('✏ 1 eşleşme değiştirildi', 'success', 2000);
  }

  function replaceAll() {
    const cm = getActiveEditor();
    if (!cm || !searchState.matches.length) return;
    const replaceText = els.replaceInput.value;
    const count = searchState.matches.length;
    cm.operation(() => {
      [...searchState.matches].reverse().forEach(m => cm.replaceRange(replaceText, m.from, m.to));
    });
    updateSearch();
    toast(`✏ ${count} eşleşme değiştirildi`, 'success', 2500);
  }

  /* ---------- Sürükle-Bırak ---------- */
  function enableDrag() {
    const handle = els.dragHandle, panel = els.panel, area = els.editorArea;
    if (!handle || !panel || !area) return;

    let dragging = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;

    function onStart(cx, cy) {
      dragging = true;
      panel.classList.add('dragging');
      const areaRect = area.getBoundingClientRect(), panelRect = panel.getBoundingClientRect();
      origLeft = panelRect.left - areaRect.left;
      origTop = panelRect.top - areaRect.top;
      panel.style.left = origLeft + 'px';
      panel.style.top = origTop + 'px';
      panel.style.right = 'auto';
      startX = cx;
      startY = cy;
    }

    function onMove(cx, cy) {
      if (!dragging) return;
      const dx = cx - startX, dy = cy - startY;
      const areaRect = area.getBoundingClientRect(), panelRect = panel.getBoundingClientRect();
      panel.style.left = Math.max(0, Math.min(areaRect.width - panelRect.width, origLeft + dx)) + 'px';
      panel.style.top = Math.max(0, Math.min(areaRect.height - panelRect.height, origTop + dy)) + 'px';
      searchState.dragged = true;
    }

    function onEnd() { if (dragging) { dragging = false; panel.classList.remove('dragging'); } }

    handle.addEventListener('mousedown', e => { if (e.button === 0) { e.preventDefault(); onStart(e.clientX, e.clientY); } });
    window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onEnd);
    handle.addEventListener('touchstart', e => { if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    window.addEventListener('touchmove', e => { if (dragging) { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
  }

  /* ---------- Init ---------- */
  function initSearchPanel() {
    collectEls();
    if (!els.panel) return;

    let searchDebounce;
    els.input.addEventListener('input', () => { clearTimeout(searchDebounce); searchDebounce = setTimeout(updateSearch, 150); });
    els.input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? searchPrev() : searchNext(); }
      if (e.key === 'Escape') { e.preventDefault(); closeSearchPanel(); }
    });
    els.replaceInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); replaceOne(); }
      if (e.key === 'Escape') { e.preventDefault(); closeSearchPanel(); }
    });

    els.next.addEventListener('click', searchNext);
    els.prev.addEventListener('click', searchPrev);
    els.close.addEventListener('click', closeSearchPanel);

    /* Toggle butonları */
    [['caseBtn', 'caseSensitive'], ['wordBtn', 'wholeWord'], ['regexBtn', 'useRegex']].forEach(([elKey, prop]) => {
      els[elKey].addEventListener('click', () => {
        searchState[prop] = !searchState[prop];
        els[elKey].classList.toggle('active', searchState[prop]);
        els[elKey].setAttribute('aria-pressed', String(searchState[prop]));
        updateSearch();
      });
    });

    els.replaceOne.addEventListener('click', replaceOne);
    els.replaceAll.addEventListener('click', replaceAll);

    /* ✅ DÜZELTME: Artık doğru ID'yi referans ediyor */
    els.searchBtn?.addEventListener('click', toggleSearchPanel);

    /* Global keydown — tek bir listener */
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        openSearchPanel();
        return;
      }
      if (e.key === 'F3' && els.panel.classList.contains('open')) {
        e.preventDefault();
        e.shiftKey ? searchPrev() : searchNext();
        return;
      }
      if (e.key === 'Escape' && els.panel.classList.contains('open') && !document.querySelector('.modal-overlay.open')) {
        e.preventDefault();
        closeSearchPanel();
      }
    });

    enableDrag();
    updateSearchButtons();
  }

  /* ---------- Expose ---------- */
  window.SearchPanel = { open: openSearchPanel, close: closeSearchPanel, toggle: toggleSearchPanel, update: updateSearch };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSearchPanel);
  else initSearchPanel();

})();