/* =========================================================
 * recent-projects.js — Son Projeleri Menüde Göster
 * ========================================================= */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────
   * Son Projeleri Menü Öğesi Oluştur
   * ───────────────────────────────────────────── */
  async function createRecentProjectsMenu() {
    const menuItem = document.querySelector('[data-action="sonkullananlar"]');
    if (!menuItem) return;

    // Menu container oluştur
    const recentContainer = document.createElement('div');
    recentContainer.id = 'recent-projects-container';
    recentContainer.style.cssText = `
      position: relative;
      display: inline-block;
      width: 100%;
    `;

    // Dropdown menu
    const dropdown = document.createElement('div');
    dropdown.id = 'recent-projects-dropdown';
    dropdown.className = 'recent-dropdown';
    dropdown.style.cssText = `
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      max-height: 300px;
      overflow-y: auto;
      z-index: 10000;
      margin-top: 4px;
    `;

    menuItem.appendChild(recentContainer);
    recentContainer.appendChild(dropdown);

    // Menü açıldığında son projeleri yükle
    menuItem.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
        return;
      }

      // Yükle
      await populateRecentProjects(dropdown);
      dropdown.style.display = 'block';
    });

    // Dokümanda başka yere tıklanırsa kapat
    document.addEventListener('click', (e) => {
      if (!menuItem.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  /* ─────────────────────────────────────────────
   * Son Projeleri Doldur
   * ───────────────────────────────────────────── */
  async function populateRecentProjects(container) {
    container.innerHTML = '';

    if (!window.FileLogger || !window.FileLogger.db) {
      container.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:12px;">Log yükleniyor...</div>';
      return;
    }

    try {
      const projects = await window.FileLogger.getRecentProjects(5);

      if (!projects || projects.length === 0) {
        container.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:12px;">Henüz proje açılmadı</div>';
        return;
      }

      // Projeleri listele
      projects.forEach((project) => {
        const item = document.createElement('div');
        item.className = 'recent-project-item';
        item.style.cssText = `
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          cursor: pointer;
          transition: background 0.2s;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        `;

        // Tarih formatla
        const date = new Date(project.lastAccessTime);
        const timeStr = formatTime(date);

        // İçerik
        item.innerHTML = `
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(project.projectName)}
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              ${project.fileCount || 0} dosya • ${timeStr}
            </div>
          </div>
          <div style="font-size: 16px; flex-shrink: 0;">📂</div>
        `;

        // Hover efekti
        item.addEventListener('mouseenter', () => {
          item.style.background = 'var(--bg-hover)';
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = 'transparent';
        });

        // Tıkla
        item.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await loadRecentProject(project);
        });

        container.appendChild(item);
      });

      // Temizle butonu
      const clearBtn = document.createElement('div');
      clearBtn.style.cssText = `
        padding: 8px 12px;
        border-top: 1px solid var(--border);
        font-size: 11px;
        color: var(--text-muted);
        cursor: pointer;
        text-align: center;
        transition: background 0.2s;
      `;
      clearBtn.textContent = '🗑 Logu Temizle';

      clearBtn.addEventListener('mouseenter', () => {
        clearBtn.style.background = 'rgba(255,59,48,0.1)';
      });
      clearBtn.addEventListener('mouseleave', () => {
        clearBtn.style.background = 'transparent';
      });

      clearBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const ok = await window.Modals.confirm(
          'Son projeleri tutma logu temizle?',
          'Logu Temizle'
        );

        if (ok) {
          await window.FileLogger.clearRecentProjects();
          await populateRecentProjects(container);
          window.DeLee?.toast('Log temizlendi', 'success');
        }
      });

      container.appendChild(clearBtn);

    } catch (err) {
      console.error('[RecentProjects] Hata:', err);
      container.innerHTML = '<div style="padding:10px;color:var(--error);font-size:12px;">Hata: ' + err.message + '</div>';
    }
  }

  /* ─────────────────────────────────────────────
   * Projeyi Yükle
   * ───────────────────────────────────────────── */
  async function loadRecentProject(project) {
    const vfs = window.VFS?.instance;
    if (!vfs) {
      window.DeLee?.toast('VFS hazır değil', 'error');
      return;
    }

    try {
      window.DeLee?.toast(`${project.projectName} yükleniyor...`, 'info');

      // Proje verisini IndexedDB'den yükle
      // (VFS zaten tüm projeleri IndexedDB'de tutuyor)
      
      // Proje adını ayarla
      vfs.projectName = project.projectName;
      const inp = document.getElementById('project-name');
      if (inp) inp.value = project.projectName;

      // Projeyi yenile
      if (window.Explorer) {
        window.Explorer.render();
      }

      if (window.DeLee) {
        window.DeLee.updateStatusBar();
        window.DeLee.updateEntrySelect();
        window.DeLee.runPreview();
      }

      // Log'u güncelle
      await window.FileLogger.updateRecentProject(project.projectName);

      window.DeLee?.toast(`${project.projectName} açıldı`, 'success');

    } catch (err) {
      console.error('[RecentProjects] Yükleme hatası:', err);
      window.DeLee?.toast('Proje yüklenemedi: ' + err.message, 'error');
    }
  }

  /* ─────────────────────────────────────────────
   * Yardımcı Fonksiyonlar
   * ───────────────────────────────────────────── */
  function formatTime(date) {
    const now = new Date();
    const diff = now - date;

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return 'az önce';
    if (diff < hour) return Math.floor(diff / minute) + ' dakika önce';
    if (diff < day) return Math.floor(diff / hour) + ' saat önce';
    
    if (diff < 7 * day) {
      const days = Math.floor(diff / day);
      return days + ' gün önce';
    }

    // Tarih formatı
    const options = { month: 'short', day: 'numeric' };
    return date.toLocaleDateString('tr-TR', options);
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, c => map[c]);
  }

  /* ─────────────────────────────────────────────
   * Başlatma
   * ───────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createRecentProjectsMenu);
  } else {
    createRecentProjectsMenu();
  }

  /* ─────────────────────────────────────────────
   * CSS Ekle
   * ───────────────────────────────────────────── */
  if (!document.getElementById('recent-projects-style')) {
    const style = document.createElement('style');
    style.id = 'recent-projects-style';
    style.textContent = `
      .recent-dropdown {
        animation: slideDown 0.2s ease-out;
      }

      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .recent-project-item {
        border-bottom-color: var(--border);
      }

      .recent-project-item:last-child {
        border-bottom: none;
      }

      /* Scrollbar */
      .recent-dropdown::-webkit-scrollbar {
        width: 6px;
      }

      .recent-dropdown::-webkit-scrollbar-track {
        background: transparent;
      }

      .recent-dropdown::-webkit-scrollbar-thumb {
        background: var(--text-muted);
        border-radius: 3px;
      }

      .recent-dropdown::-webkit-scrollbar-thumb:hover {
        background: var(--text-secondary);
      }
    `;
    document.head.appendChild(style);
  }

  /* ─────────────────────────────────────────────
   * Expose
   * ───────────────────────────────────────────── */
  window.RecentProjects = {
    populate: populateRecentProjects,
    load: loadRecentProject
  };

})();
