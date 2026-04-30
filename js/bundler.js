/* =========================================================
 * bundler.js — HTML/CSS/JS Bundle Sistemi
 * - CSS inline (blob URL cross-tab erişim sorunu çözümü)
 * - @import zinciri recursive inline
 * - JS module rewrite (import/export)
 * - Console capture with source-map
 * ========================================================= */
(function () {
  'use strict';

  const V = window.VFS;

  /* ---------- Bundle Context ---------- */
  class BundleCtx {
    constructor(vfs) {
      this.vfs = vfs;
      this.urls = new Map();
      this.jsModuleCache = new Map();
      this.urlToPath = new Map();
      this.warnings = [];
    }

    _register(path, url) { this.urlToPath.set(url, path); }

    revokeAll() {
      this.urls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
      this.urls.clear();
      this.jsModuleCache.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
      this.jsModuleCache.clear();
      this.urlToPath.clear();
    }

    getAssetURL(path) {
      path = V.normalize(path);
      if (this.urls.has(path)) return this.urls.get(path);
      const entry = this.vfs.get(path);
      if (!entry || entry.type !== 'file') return null;

      let blob;
      if (entry.binary && entry.content instanceof Uint8Array) {
        blob = new Blob([entry.content], { type: entry.mime });
      } else {
        blob = new Blob([String(entry.content ?? '')], {
          type: entry.mime || (V.extOf(path) === 'js' ? 'text/javascript' : 'text/plain')
        });
      }
      const url = URL.createObjectURL(blob);
      this.urls.set(path, url);
      this._register(path, url);
      return url;
    }

    /* =========================================================
     * CSS Inline — @import zinciri recursive çözüm
     * blob URL cross-tab erişim sorununu tamamen çözer
     * ========================================================= */
    inlineCss(path, visited) {
      path = V.normalize(path);
      if (!visited) visited = new Set();
      if (visited.has(path)) return '/* circular: ' + path + ' */\n';
      visited.add(path);

      const entry = this.vfs.get(path);
      if (!entry || entry.type !== 'file' || entry.binary) return '';

      let css = String(entry.content || '');

      /* @import → recursive inline */
      css = css.replace(/@import\s+(?:url\(\s*)?(['"])([^'")]+)\1\s*\)?\s*;/gi, (m, q, ref) => {
        const target = V.resolveRef(path, ref);
        if (target && this.vfs.has(target)) {
          const inlined = this.inlineCss(target, visited);
          return '/* @import ' + ref + ' → inlined */\n' + inlined;
        }
        this.warnings.push('CSS @import missing → ' + ref + ' (from ' + path + ')');
        return m;
      });

      /* url() → blob URL (resim, font vb.) */
      css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, ref) => {
        if (/^(https?:|data:|blob:|#)/i.test(ref)) return m;
        const target = V.resolveRef(path, ref);
        if (target && this.vfs.has(target)) return 'url("' + this.getAssetURL(target) + '")';
        this.warnings.push('CSS missing asset → ' + ref + ' (from ' + path + ')');
        return m;
      });

      return css;
    }

    getJsModuleURL(path, visited = new Set()) {
      path = V.normalize(path);
      if (this.jsModuleCache.has(path)) return this.jsModuleCache.get(path);
      if (visited.has(path)) {
        const empty = URL.createObjectURL(new Blob(['/* circular */'], { type: 'text/javascript' }));
        this.jsModuleCache.set(path, empty);
        this._register(path, empty);
        return empty;
      }
      visited.add(path);

      const entry = this.vfs.get(path);
      if (!entry || entry.type !== 'file') {
        const url = URL.createObjectURL(new Blob(['console.warn("[bundler] missing module: ' + path + '")'], { type: 'text/javascript' }));
        this.jsModuleCache.set(path, url);
        this._register(path, url);
        return url;
      }

      let src = String(entry.content || '');
      const rewrite = (m, kw, q, ref) => {
        const resolved = this._resolveJsRef(path, ref);
        return resolved ? kw + ' ' + q + this.getJsModuleURL(resolved, visited) + q : m;
      };

      src = src.replace(/((?:^|[\s;])(?:import(?:\s+[^'";]+?from)?|export\s+[^'";]*\bfrom))\s*(['"])([^'"]+)\2/g, rewrite);
      src = src.replace(/((?:^|[\s;])import)\s*(['"])([^'"]+)\2/g, rewrite);
      src = src.replace(/\bimport\(\s*(['"])([^'"]+)\1\s*\)/g, (m, q, ref) => {
        const resolved = this._resolveJsRef(path, ref);
        return resolved ? 'import("' + this.getJsModuleURL(resolved, visited) + '")' : m;
      });

      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      this.jsModuleCache.set(path, url);
      this._register(path, url);
      return url;
    }

    _resolveJsRef(baseFile, ref) {
      if (/^(https?:|data|blob):/i.test(ref) || !/^[./]/.test(ref)) return null;
      const target = V.resolveRef(baseFile, ref);
      if (!target) return null;
      const candidates = [target, target + '.js', target + '.mjs', target + '/index.js', target + '/index.mjs'].map(V.normalize);
      const found = candidates.find(c => this.vfs.has(c));
      if (!found) this.warnings.push('JS resolve failed → ' + ref);
      return found || null;
    }
  }

  /* ---------- Console Capture Script ---------- */
  function consoleCaptureScript(urlMap, entryPath) {
    return '<script>\n(function(){\ntry{\n' +
      'var URL_MAP=' + JSON.stringify(urlMap) + ',ENTRY=' + JSON.stringify(entryPath) + ',' +
      'CAPTURE_START=__CAPTURE_START__,CAPTURE_LINES=__CAPTURE_LINES__,' +
      'groupDepth=0,timers={},counters={},' +
      'origLog=console.log,origWarn=console.warn,origErr=console.error,' +
      'origInfo=console.info,origDebug=console.debug,origTrace=console.trace,' +
      'origTable=console.table,origAssert=console.assert,origCount=console.count,' +
      'origTime=console.time,origTimeEnd=console.timeEnd,origClear=console.clear,' +
      'origGroup=console.group,origGroupC=console.groupCollapsed,origGroupE=console.groupEnd,' +
      'origDir=console.dir;' +
      'function mapSrcdocLine(L){if(!L||L<1)return{line:L,internal:false};if(L<CAPTURE_START)return{line:L+1,internal:false};if(L>=CAPTURE_START+CAPTURE_LINES)return{line:L-CAPTURE_LINES+1,internal:false};return{line:null,internal:true};}' +
      'function parseStack(stack){if(!stack)return null;var lines=String(stack).split("\\n");for(var i=0;i<lines.length;i++){var line=lines[i];if(/__delee_shim|consoleCaptureScript|(?:Object|console)\\.(log|warn|error|info|debug|trace|table|assert|count|time|timeEnd|clear|group|dir|success|fatal|network|security)/.test(line))continue;var m=line.match(/(blob:[^)\\s]+):(\\d+):(\\d+)/);if(m)return{url:m[1],line:+m[2],col:+m[3]};var m2=line.match(/(about:srcdoc|<anonymous>):(\\d+):(\\d+)/);if(m2)return{url:m2[1],line:+m2[2],col:+m2[3]};}return null;}' +
      'function toSource(info){if(!info)return null;if(URL_MAP[info.url])return{file:URL_MAP[info.url],line:info.line,col:info.col,inline:false};if(info.url==="about:srcdoc"||info.url==="<anonymous>"){var mapped=mapSrcdocLine(info.line);if(mapped.internal)return{file:ENTRY,line:null,col:info.col,inline:true,internal:true};return{file:ENTRY,line:mapped.line,col:info.col,inline:true};}return null;}' +
      'function fmt(a){try{if(a instanceof Error)return a.stack||(a.name+": "+a.message);if(typeof a==="object"&&a!==null){if(a instanceof HTMLElement)return a.outerHTML||String(a);try{return JSON.stringify(a,null,2);}catch(e){}}return String(a);}catch(e){return String(a);}}' +
      'function escH(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}' +
      'function fmtTable(data){if(!data||typeof data!=="object")return escH(String(data));var arr=Array.isArray(data)?data:Object.keys(data).map(function(k){var o={};o["(key)"]=k;var v=data[k];if(typeof v==="object"&&v!==null)Object.assign(o,v);else o["(value)"]=v;return o;});if(!arr.length)return"(empty table)";var keys=[];arr.forEach(function(r){Object.keys(r).forEach(function(k){if(keys.indexOf(k)===-1)keys.push(k);});});var h="<table class=\\"console-table\\"><thead><tr>";keys.forEach(function(k){h+="<th>"+escH(k)+"</th>";});h+="</tr></thead><tbody>";arr.forEach(function(r){h+="<tr>";keys.forEach(function(k){h+="<td>"+escH(String(r[k]!=null?r[k]:""))+"</td>";});h+="</tr>";});h+="</tbody></table>";return h;}' +
      'function __delee_shim(level,args,isHtml){var info=null;for(var i=0;i<args.length;i++){if(args[i] instanceof Error&&args[i].stack){info=parseStack(args[i].stack);if(info)break;}}if(!info){var err=new Error();info=parseStack(err.stack);}var src=toSource(info);var msg=Array.prototype.map.call(args,fmt).join(" ");try{parent.postMessage({__delee:true,type:"console",level:level,msg:msg,src:src,depth:groupDepth,html:!!isHtml},"*");}catch(e){}}' +
      'console.log=function(){__delee_shim("log",arguments);origLog.apply(console,arguments);};' +
      'console.warn=function(){__delee_shim("warn",arguments);origWarn.apply(console,arguments);};' +
      'console.error=function(){__delee_shim("error",arguments);origErr.apply(console,arguments);};' +
      'console.info=function(){__delee_shim("info",arguments);origInfo.apply(console,arguments);};' +
      'console.debug=function(){__delee_shim("debug",arguments);origDebug.apply(console,arguments);};' +
      'console.trace=function(){__delee_shim("trace",arguments);origTrace.apply(console,arguments);};' +
      'console.dir=function(){__delee_shim("log",arguments);origDir.apply(console,arguments);};' +
      'console.table=function(data){__delee_shim("table",[fmtTable(data)],true);origTable.apply(console,arguments);};' +
      'console.assert=function(cond){if(!cond){var args=Array.prototype.slice.call(arguments,1);if(!args.length)args=["Assertion failed"];__delee_shim("assert",args);}try{origAssert.apply(console,arguments);}catch(_){}};' +
      'console.count=function(label){label=label||"default";counters[label]=(counters[label]||0)+1;__delee_shim("log",[label+": "+counters[label]]);origCount.apply(console,arguments);};' +
      'console.time=function(label){timers[label||"default"]=Date.now();origTime.apply(console,arguments);};' +
      'console.timeEnd=function(label){label=label||"default";if(timers[label]!=null){var ms=Date.now()-timers[label];__delee_shim("performance",[label+": "+ms.toFixed(2)+"ms"]);delete timers[label];}origTimeEnd.apply(console,arguments);};' +
      'console.clear=function(){try{parent.postMessage({__delee:true,type:"console-clear"},"*");}catch(e){}origClear.apply(console,arguments);};' +
      'console.group=function(){groupDepth++;__delee_shim("group",arguments);origGroup.apply(console,arguments);};' +
      'console.groupCollapsed=function(){groupDepth++;__delee_shim("group",arguments);origGroupC.apply(console,arguments);};' +
      'console.groupEnd=function(){groupDepth=Math.max(0,groupDepth-1);__delee_shim("group-end",[]);origGroupE.apply(console,arguments);};' +
      'console.success=function(){__delee_shim("success",arguments);origLog.apply(console,arguments);};' +
      'console.fatal=function(){__delee_shim("fatal",arguments);origErr.apply(console,arguments);};' +
      'console.network=function(){__delee_shim("network",arguments);origLog.apply(console,arguments);};' +
      'console.security=function(){__delee_shim("security",arguments);origWarn.apply(console,arguments);};' +
      'window.addEventListener("error",function(e){var src=null;if(e.filename){if(URL_MAP[e.filename])src={file:URL_MAP[e.filename],line:e.lineno,col:e.colno,inline:false};else if(e.filename==="about:srcdoc"||e.filename===""||e.filename==="<anonymous>"){var mapped=mapSrcdocLine(e.lineno);if(mapped.internal)src={file:ENTRY,line:null,col:e.colno,inline:true,internal:true};else src={file:ENTRY,line:mapped.line,col:e.colno,inline:true};}}try{parent.postMessage({__delee:true,type:"console",level:"error",msg:(e.message||"Error")+(e.error&&e.error.stack?"\\n"+e.error.stack:""),src:src,depth:groupDepth},"*");}catch(_){}});' +
      'window.addEventListener("unhandledrejection",function(e){var src=null;if(e.reason&&e.reason.stack){var info=parseStack(e.reason.stack);src=toSource(info);}try{parent.postMessage({__delee:true,type:"console",level:"error",msg:"Unhandled rejection: "+(e.reason&&e.reason.stack?e.reason.stack:String(e.reason)),src:src,depth:groupDepth},"*");}catch(_){}});' +
      '}catch(e){}\n})();\n<\/script>';
  }

  /* ---------- Attr Helpers ---------- */
  function _escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function matchAttr(attrs, name) {
    var m = attrs.match(new RegExp('\\b' + _escRegex(name) + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
    return m ? (m[1] || m[2] || m[3]) : null;
  }
  function replaceAttr(tag, name, value) {
    var re = new RegExp('(\\b' + _escRegex(name) + '\\s*=\\s*)(?:"[^"]*"|\'[^\']*\'|[^\\s>]+)', 'i');
    return tag.match(re) ? tag.replace(re, '$1"' + value + '"') : tag.replace(/\/?>$/, ' ' + name + '="' + value + '">$&');
  }
  function replaceAttrStr(attrs, name, value) {
    var re = new RegExp('(\\b' + _escRegex(name) + '\\s*=\\s*)(?:"[^"]*"|\'[^\']*\'|[^\\s>]+)', 'i');
    return re.test(attrs) ? attrs.replace(re, '$1"' + value + '"') : attrs + ' ' + name + '="' + value + '"';
  }

  /* ---------- Inline Module Rewrite ---------- */
  function rewriteInlineModule(ctx, entryPath, src) {
    var r = function (m, kw, q, ref) {
      if (!/^[./]/.test(ref)) return m;
      var target = V.resolveRef(entryPath, ref);
      if (!target) return m;
      var found = [target, target + '.js', target + '/index.js'].map(V.normalize).find(function (x) { return ctx.vfs.has(x); });
      return found ? kw + ' ' + q + ctx.getJsModuleURL(found) + q : m;
    };
    return src.replace(/((?:^|[\s;])import(?:.*from)?|export\s+.*from)\s*(['"])([^'"]+)\2/g, r);
  }

  /* ---------- MAIN BUNDLE ---------- */
  async function bundle(vfs, entryPath) {
    var ctx = new BundleCtx(vfs);
    entryPath = V.normalize(entryPath);

    var entry = vfs.get(entryPath);
    if (!entry || entry.type !== 'file') {
      return { html: '<h1>Entry not found</h1>', ctx: ctx };
    }

    var html = String(entry.content || '');

    if (!/<html/i.test(html)) {
      html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>' + html + '</body></html>';
    }
    if (!/<head[\s>]/i.test(html)) {
      html = html.replace(/<html[^>]*>/i, function (m) { return m + '<head></head>'; });
    }

    /* =========================================================
     * LINK — CSS inline, diğerleri blob URL
     * ========================================================= */
    html = html.replace(/<link\b([^>]*?)>/gi, function (tag, attrs) {
      var href = matchAttr(attrs, 'href');
      if (!href) return tag;
      var target = V.resolveRef(entryPath, href);
      if (!target || !vfs.has(target)) return tag;

      var rel = (matchAttr(attrs, 'rel') || '').toLowerCase();
      var type = (matchAttr(attrs, 'type') || '').toLowerCase();
      var isCSS = rel === 'stylesheet' || type === 'text/css' || V.extOf(target) === 'css';

      if (isCSS) {
        var cssEntry = vfs.get(target);
        if (cssEntry && !cssEntry.binary) {
          var cssContent = ctx.inlineCss(target);
          return '<style>/* ' + target + ' */\n' + cssContent + '\n</style>';
        }
      }

      return replaceAttr(tag, 'href', ctx.getAssetURL(target));
    });

    /* SCRIPT */
    html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, function (tag, attrs, body) {
      var src = matchAttr(attrs, 'src');
      var type = (matchAttr(attrs, 'type') || '').toLowerCase();

      if (src) {
        var target = V.resolveRef(entryPath, src);
        if (target && vfs.has(target)) {
          var url = type === 'module' ? ctx.getJsModuleURL(target) : ctx.getAssetURL(target);
          return '<script ' + replaceAttrStr(attrs, 'src', url) + '><\/script>';
        }
        return tag;
      }

      if (type === 'module' && body) {
        return '<script' + (attrs ? ' ' + attrs.trim() : '') + '>' + rewriteInlineModule(ctx, entryPath, body) + '<\/script>';
      }
      return tag;
    });

    /* IMG / MEDIA */
    html = html.replace(/<(img|source|video|audio|iframe|embed)\b([^>]*)>/gi, function (tag, el, attrs) {
      var src = matchAttr(attrs, 'src');
      if (!src) return tag;
      var target = V.resolveRef(entryPath, src);
      return target && vfs.has(target) ? '<' + el + ' ' + replaceAttrStr(attrs, 'src', ctx.getAssetURL(target)) + '>' : tag;
    });

    /* Inject console capture */
    var urlMap = {};
    ctx.urlToPath.forEach(function (p, u) { urlMap[u] = p; });

    var captureRaw = consoleCaptureScript(urlMap, entryPath);
    var captureStart = 1;
    var headMatch = html.match(/<head[^>]*>/i);
    if (headMatch) {
      captureStart = (html.slice(0, headMatch.index + headMatch[0].length).match(/\n/g) || []).length + 1;
    }
    var captureLines = captureRaw.split('\n').length;
    var finalCapture = captureRaw.replace('__CAPTURE_START__', captureStart).replace('__CAPTURE_LINES__', captureLines);
    html = html.replace(/<head[^>]*>/i, function (m) { return m + finalCapture; });

    return { html: html, ctx: ctx };
  }

  /* ---------- Expose ---------- */
  window.Bundler = { bundle };

})();