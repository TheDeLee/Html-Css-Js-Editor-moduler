/* =========================================================
 * mobile-filesystem.js — Capacitor Dosya Sistemi Entegrasyonu
 * Android/iOS APK'da Dosya İşlemleri
 * ========================================================= */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────────
   * Capacitor Filesystem Wrapper
   * ───────────────────────────────────────────────── */
  class MobileFileSystem {
    constructor() {
      this.hasCapacitor = typeof window.Capacitor !== 'undefined';
      this.Filesystem = this.hasCapacitor ? window.Capacitor.Plugins.Filesystem : null;
      this.Directory = this.hasCapacitor ? window.Capacitor.Plugins.Directory : null;
      this.ready = false;
    }

    async init() {
      if (!this.hasCapacitor) {
        console.log('[MobileFS] Capacitor bulunamadı. Web-only modu.');
        return false;
      }

      try {
        // Temel klasörleri kontrol et
        const { Filesystem } = window.Capacitor.Plugins;
        const { Directory } = window.Capacitor.Plugins;

        if (Filesystem && Directory) {
          this.Filesystem = Filesystem;
          this.Directory = Directory;
          this.ready = true;
          console.log('[MobileFS] Capacitor Filesystem hazır');
          return true;
        }
      } catch (e) {
        console.warn('[MobileFS] Capacitor başlatılamadı:', e);
      }

      return false;
    }

    /* ─────────────────────────────────────────────
     * Dosya Okuma
     * ───────────────────────────────────────────── */
    async readFile(path, encoding = 'utf8') {
      if (!this.ready) return null;

      try {
        const result = await this.Filesystem.readFile({
          path: path,
          directory: this.Directory.Documents,
          encoding: encoding === 'binary' ? undefined : encoding
        });

        return encoding === 'binary' ? result.data : result.data;
      } catch (err) {
        console.error('[MobileFS] Dosya okunamadı:', path, err);
        return null;
      }
    }

    /* ─────────────────────────────────────────────
     * Dosya Yazma / Güncelleme
     * ───────────────────────────────────────────── */
    async writeFile(path, data, encoding = 'utf8') {
      if (!this.ready) return false;

      try {
        // Klasör oluştur
        const dir = path.substring(0, path.lastIndexOf('/'));
        if (dir) {
          await this.mkdir(dir);
        }

        // Dosya yaz
        await this.Filesystem.writeFile({
          path: path,
          data: data,
          directory: this.Directory.Documents,
          encoding: encoding === 'binary' ? undefined : encoding,
          recursive: true
        });

        console.log('[MobileFS] Dosya yazıldı:', path);

        // Log
        if (window.FileLogger) {
          window.FileLogger.log('write', path, {
            size: typeof data === 'string' ? data.length : data.byteLength
          });
        }

        return true;
      } catch (err) {
        console.error('[MobileFS] Dosya yazılamadı:', path, err);
        return false;
      }
    }

    /* ─────────────────────────────────────────────
     * Dosya Silme
     * ───────────────────────────────────────────── */
    async deleteFile(path) {
      if (!this.ready) return false;

      try {
        await this.Filesystem.deleteFile({
          path: path,
          directory: this.Directory.Documents
        });

        console.log('[MobileFS] Dosya silindi:', path);

        if (window.FileLogger) {
          window.FileLogger.log('delete', path);
        }

        return true;
      } catch (err) {
        console.error('[MobileFS] Dosya silinemedi:', path, err);
        return false;
      }
    }

    /* ─────────────────────────────────────────────
     * Klasör İşlemleri
     * ───────────────────────────────────────────── */
    async mkdir(path) {
      if (!this.ready) return false;

      try {
        await this.Filesystem.mkdir({
          path: path,
          directory: this.Directory.Documents,
          recursive: true
        });

        if (window.FileLogger) {
          window.FileLogger.log('mkdir', path);
        }

        return true;
      } catch (err) {
        // Zaten var hatası göz ardı et
        if (!err.message?.includes('exists')) {
          console.error('[MobileFS] Klasör oluşturulamadı:', path, err);
        }
        return false;
      }
    }

    /* ─────────────────────────────────────────────
     * Klasör Silme (Recursive)
     * ───────────────────────────────────────────── */
    async rmdir(path) {
      if (!this.ready) return false;

      try {
        await this.Filesystem.rmdir({
          path: path,
          directory: this.Directory.Documents,
          recursive: true
        });

        console.log('[MobileFS] Klasör silindi:', path);

        if (window.FileLogger) {
          window.FileLogger.log('rmdir', path);
        }

        return true;
      } catch (err) {
        console.error('[MobileFS] Klasör silinemedi:', path, err);
        return false;
      }
    }

    /* ─────────────────────────────────────────────
     * Dosya Yeniden Adlandırma
     * ───────────────────────────────────────────── */
    async rename(oldPath, newPath) {
      if (!this.ready) {
        // Web'de yapamayız, false döndür
        return false;
      }

      try {
        // Capacitor SDK'da rename yok, copy+delete ile yap
        const content = await this.readFile(oldPath);
        if (content === null) return false;

        const success = await this.writeFile(newPath, content);
        if (!success) return false;

        await this.deleteFile(oldPath);

        if (window.FileLogger) {
          window.FileLogger.log('rename', newPath, {
            oldPath: oldPath,
            newPath: newPath
          });
        }

        return true;
      } catch (err) {
        console.error('[MobileFS] Dosya yeniden adlandırılamadı:', oldPath, newPath, err);
        return false;
      }
    }

    /* ─────────────────────────────────────────────
     * Klasör Listeleme
     * ───────────────────────────────────────────── */
    async listFiles(path = '') {
      if (!this.ready) return [];

      try {
        const result = await this.Filesystem.readdir({
          path: path,
          directory: this.Directory.Documents
        });

        return result.files || [];
      } catch (err) {
        console.error('[MobileFS] Klasör okunamadı:', path, err);
        return [];
      }
    }

    /* ─────────────────────────────────────────────
     * Dosya/Klasör Getir Yolu
     * ───────────────────────────────────────────── */
    async getProjectPath(projectName = 'DeLeeProject') {
      if (!this.ready) return null;

      try {
        const uri = await this.Filesystem.getUri({
          directory: this.Directory.Documents,
          path: projectName
        });

        return uri.uri;
      } catch (err) {
        console.error('[MobileFS] Yol alınamadı:', err);
        return null;
      }
    }

    /* ─────────────────────────────────────────────
     * VFS'i Mobil Dosya Sistemine Senkronize Et
     * ───────────────────────────────────────────── */
    async syncVfsToMobile(vfs, projectName = 'DeLeeProject') {
      if (!this.ready) {
        console.log('[MobileFS] Mobil senkronizasyon atlanıyor (web modunda)');
        return false;
      }

      try {
        const projectPath = projectName;
        
        // Proje klasörünü oluştur
        await this.mkdir(projectPath);

        // Tüm dosyaları yaz
        const files = vfs.list().filter(e => e.type === 'file');
        for (const file of files) {
          const relativePath = file.path;
          const fullPath = projectPath + '/' + relativePath;
          
          const isText = !file.binary;
          const data = isText ? file.content : file.content;
          
          await this.writeFile(fullPath, data, isText ? 'utf8' : 'binary');
        }

        console.log(`[MobileFS] VFS senkronize edildi: ${projectName} (${files.length} dosya)`);
        window.DeLee?.toast(`${files.length} dosya mobil sisteme kaydedildi`, 'success');

        return true;
      } catch (err) {
        console.error('[MobileFS] Senkronizasyon başarısız:', err);
        window.DeLee?.toast('Mobil senkronizasyon başarısız: ' + err.message, 'error');
        return false;
      }
    }

    /* ─────────────────────────────────────────────
     * Mobil Dosya Sisteminden VFS'e Yükle
     * ───────────────────────────────────────────── */
    async loadMobileFilesToVfs(vfs, projectName = 'DeLeeProject') {
      if (!this.ready) {
        console.log('[MobileFS] Mobil yükleme atlanıyor (web modunda)');
        return false;
      }

      try {
        const files = await this._recursiveListFiles(projectName);
        
        for (const file of files) {
          const relativePath = file.path.replace(projectName + '/', '');
          const content = await this.readFile(file.path);
          
          if (content !== null) {
            vfs.writeFile(relativePath, content, { binary: file.binary });
          }
        }

        await vfs.save();
        console.log(`[MobileFS] ${files.length} dosya VFS'e yüklendi`);
        window.DeLee?.toast(`${files.length} dosya yüklendi`, 'success');

        return true;
      } catch (err) {
        console.error('[MobileFS] Yükleme başarısız:', err);
        return false;
      }
    }

    async _recursiveListFiles(path = '', result = []) {
      if (!this.ready) return result;

      try {
        const files = await this.listFiles(path);
        
        for (const file of files) {
          const fullPath = path ? `${path}/${file.name}` : file.name;
          
          if (file.type === 'directory') {
            await this._recursiveListFiles(fullPath, result);
          } else {
            result.push({ path: fullPath, binary: false });
          }
        }
      } catch (err) {
        console.error('[MobileFS] Recursive list hatası:', err);
      }

      return result;
    }

    /* ─────────────────────────────────────────────
     * Durum Kontrolü
     * ───────────────────────────────────────────── */
    isReady() {
      return this.ready;
    }

    isPlatform() {
      return this.hasCapacitor;
    }
  }

  /* ─────────────────────────────────────────────
   * Expose
   * ───────────────────────────────────────────── */
  window.MobileFS = new MobileFileSystem();

  // Başlatma
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      await window.MobileFS.init();
    });
  } else {
    window.MobileFS.init();
  }

})();
