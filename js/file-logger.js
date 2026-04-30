/* =========================================================
 * file-logger.js — Dosya İşlemleri Log Sistemi
 * Save, Rename, Delete, Create işlemleri kaydeder
 * ========================================================= */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────
   * FileLogger Sınıfı
   * ───────────────────────────────────────────── */
  class FileLogger {
    constructor() {
      this.dbName = 'DeLeeFileLogger';
      this.dbVersion = 1;
      this.db = null;
      this.storeName = 'fileLogs';
      this.recentStoreName = 'recentProjects';
    }

    /* ─────────────────────────────────────────────
     * IndexedDB Başlatma
     * ───────────────────────────────────────────── */
    async init() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onerror = () => {
          console.error('[FileLogger] DB açılmadı:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          this.db = request.result;
          console.log('[FileLogger] Veritabanı hazır');
          resolve(this.db);
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          // File Logs Store
          if (!db.objectStoreNames.contains(this.storeName)) {
            const logStore = db.createObjectStore(this.storeName, {
              keyPath: 'id',
              autoIncrement: true
            });
            logStore.createIndex('timestamp', 'timestamp', { unique: false });
            logStore.createIndex('action', 'action', { unique: false });
            logStore.createIndex('filePath', 'filePath', { unique: false });
            logStore.createIndex('projectName', 'projectName', { unique: false });
          }

          // Recent Projects Store
          if (!db.objectStoreNames.contains(this.recentStoreName)) {
            const recentStore = db.createObjectStore(this.recentStoreName, {
              keyPath: 'projectName'
            });
            recentStore.createIndex('lastAccessTime', 'lastAccessTime', {
              unique: false
            });
          }
        };
      });
    }

    /* ─────────────────────────────────────────────
     * Log Kaydı (Genel)
     * ───────────────────────────────────────────── */
    async log(action, filePath, metadata = {}) {
      if (!this.db) {
        console.warn('[FileLogger] DB hazır değil');
        return false;
      }

      try {
        const projectName = window.VFS?.instance?.projectName || 'untitled';
        const timestamp = Date.now();

        const logEntry = {
          action,           // 'create', 'update', 'delete', 'rename', 'write', 'mkdir'
          filePath,
          projectName,
          timestamp,
          ...metadata
        };

        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        await store.add(logEntry);

        // Son proje erişim zamanını güncelle
        await this.updateRecentProject(projectName, filePath);

        console.log(`[FileLogger] Kaydedildi: ${action} - ${filePath}`);
        return true;
      } catch (err) {
        console.error('[FileLogger] Log başarısız:', err);
        return false;
      }
    }

    /* ─────────────────────────────────────────────
     * Dosya Oluşturma Logu
     * ───────────────────────────────────────────── */
    async logCreate(filePath) {
      return this.log('create', filePath, {
        description: 'Dosya oluşturuldu'
      });
    }

    /* ─────────────────────────────────────────────
     * Dosya Güncellemesi Logu
     * ───────────────────────────────────────────── */
    async logUpdate(filePath, content) {
      return this.log('update', filePath, {
        description: 'Dosya güncellendi',
        size: typeof content === 'string' ? content.length : content?.byteLength || 0
      });
    }

    /* ─────────────────────────────────────────────
     * Dosya Silme Logu
     * ───────────────────────────────────────────── */
    async logDelete(filePath) {
      return this.log('delete', filePath, {
        description: 'Dosya silindi'
      });
    }

    /* ─────────────────────────────────────────────
     * Dosya Yeniden Adlandırma Logu
     * ───────────────────────────────────────────── */
    async logRename(oldPath, newPath) {
      return this.log('rename', newPath, {
        description: 'Dosya yeniden adlandırıldı',
        oldPath,
        newPath
      });
    }

    /* ─────────────────────────────────────────────
     * Klasör Oluşturma Logu
     * ───────────────────────────────────────────── */
    async logMkdir(dirPath) {
      return this.log('mkdir', dirPath, {
        description: 'Klasör oluşturuldu'
      });
    }

    /* ─────────────────────────────────────────────
     * Son Proje Erişim Zamanını Güncelle
     * ───────────────────────────────────────────── */
    async updateRecentProject(projectName, filePath = null) {
      if (!this.db) return false;

      try {
        const vfs = window.VFS?.instance;
        const fileCount = vfs?.list().filter(e => e.type === 'file').length || 0;

        const transaction = this.db.transaction(
          [this.recentStoreName],
          'readwrite'
        );
        const store = transaction.objectStore(this.recentStoreName);

        const entry = {
          projectName,
          lastAccessTime: Date.now(),
          fileCount,
          lastFile: filePath || null
        };

        const request = store.put(entry);

        return new Promise((resolve) => {
          request.onsuccess = () => resolve(true);
          request.onerror = () => resolve(false);
        });
      } catch (err) {
        console.error('[FileLogger] Son proje güncellemesi başarısız:', err);
        return false;
      }
    }

    /* ─────────────────────────────────────────────
     * Son N Projeyi Getir
     * ───────────────────────────────────────────── */
    async getRecentProjects(limit = 5) {
      if (!this.db) return [];

      try {
        const transaction = this.db.transaction([this.recentStoreName], 'readonly');
        const store = transaction.objectStore(this.recentStoreName);
        const index = store.index('lastAccessTime');

        return new Promise((resolve) => {
          const request = index.openCursor(null, 'prev');
          const results = [];

          request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor && results.length < limit) {
              results.push(cursor.value);
              cursor.continue();
            } else {
              resolve(results);
            }
          };

          request.onerror = () => resolve([]);
        });
      } catch (err) {
        console.error('[FileLogger] Son projeler alınamadı:', err);
        return [];
      }
    }

    /* ─────────────────────────────────────────────
     * Proje Loglarını Getir
     * ───────────────────────────────────────────── */
    async getProjectLogs(projectName, limit = 100) {
      if (!this.db) return [];

      try {
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('projectName');

        return new Promise((resolve) => {
          const request = index.getAll(projectName);

          request.onsuccess = () => {
            const results = request.result
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, limit);
            resolve(results);
          };

          request.onerror = () => resolve([]);
        });
      } catch (err) {
        console.error('[FileLogger] Proje logları alınamadı:', err);
        return [];
      }
    }

    /* ─────────────────────────────────────────────
     * Dosya Loglarını Getir
     * ───────────────────────────────────────────── */
    async getFileLogs(filePath, limit = 50) {
      if (!this.db) return [];

      try {
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('filePath');

        return new Promise((resolve) => {
          const request = index.getAll(filePath);

          request.onsuccess = () => {
            const results = request.result
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, limit);
            resolve(results);
          };

          request.onerror = () => resolve([]);
        });
      } catch (err) {
        console.error('[FileLogger] Dosya logları alınamadı:', err);
        return [];
      }
    }

    /* ─────────────────────────────────────────────
     * Belirli Proje Loglarını Sil
     * ───────────────────────────────────────────── */
    async deleteProjectLogs(projectName) {
      if (!this.db) return false;

      try {
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('projectName');

        return new Promise((resolve) => {
          const request = index.openCursor(projectName);

          request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            } else {
              resolve(true);
            }
          };

          request.onerror = () => resolve(false);
        });
      } catch (err) {
        console.error('[FileLogger] Proje logları silinemedi:', err);
        return false;
      }
    }

    /* ─────────────────────────────────────────────
     * Tüm Son Projeleri Temizle
     * ───────────────────────────────────────────── */
    async clearRecentProjects() {
      if (!this.db) return false;

      try {
        const transaction = this.db.transaction(
          [this.recentStoreName],
          'readwrite'
        );
        const store = transaction.objectStore(this.recentStoreName);

        return new Promise((resolve) => {
          const request = store.clear();
          request.onsuccess = () => resolve(true);
          request.onerror = () => resolve(false);
        });
      } catch (err) {
        console.error('[FileLogger] Son projeler temizlenemedi:', err);
        return false;
      }
    }

    /* ─────────────────────────────────────────────
     * Tüm Logları Temizle
     * ───────────────────────────────────────────── */
    async clearAllLogs() {
      if (!this.db) return false;

      try {
        const transaction = this.db.transaction(
          [this.storeName, this.recentStoreName],
          'readwrite'
        );

        return new Promise((resolve) => {
          const logStore = transaction.objectStore(this.storeName);
          const recentStore = transaction.objectStore(this.recentStoreName);

          const req1 = logStore.clear();
          const req2 = recentStore.clear();

          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => resolve(false);
        });
      } catch (err) {
        console.error('[FileLogger] Loglar temizlenemedi:', err);
        return false;
      }
    }

    /* ─────────────────────────────────────────────
     * İstatistikler
     * ───────────────────────────────────────────── */
    async getStats(projectName) {
      const logs = await this.getProjectLogs(projectName);

      const stats = {
        totalLogs: logs.length,
        actions: {},
        fileCount: 0,
        firstLog: null,
        lastLog: null
      };

      logs.forEach((log) => {
        stats.actions[log.action] = (stats.actions[log.action] || 0) + 1;
        if (!stats.firstLog || log.timestamp < stats.firstLog.timestamp) {
          stats.firstLog = log;
        }
        if (!stats.lastLog || log.timestamp > stats.lastLog.timestamp) {
          stats.lastLog = log;
        }
      });

      // Benzer dosya sayısı
      stats.fileCount = new Set(logs.map(l => l.filePath)).size;

      return stats;
    }

    /* ─────────────────────────────────────────────
     * Log Dışa Aktar (JSON)
     * ───────────────────────────────────────────── */
    async exportLogs(projectName) {
      const logs = await this.getProjectLogs(projectName, Infinity);
      const stats = await this.getStats(projectName);

      return {
        projectName,
        exportDate: new Date().toISOString(),
        stats,
        logs
      };
    }
  }

  /* ─────────────────────────────────────────────
   * Global Instance Oluştur ve Başlat
   * ───────────────────────────────────────────── */
  window.FileLogger = new FileLogger();

  // Başlatma
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      await window.FileLogger.init();
    });
  } else {
    window.FileLogger.init();
  }

})();
