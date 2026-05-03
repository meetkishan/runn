/**
 * overlay.js — runn dev error overlay
 *
 * Two exports:
 *
 *   OVERLAY_CLIENT_CODE  — the full browser-side IIFE as a string.
 *                          Injected into Vite virtual modules and HTML responses.
 *                          Self-contained: no bundler, no imports required.
 *
 *   createViteOverlayPlugin(code)  — a minimal Vite plugin that serves the
 *                          overlay as the virtual module `virtual:runn-overlay`,
 *                          plus wires up import.meta.hot listeners for build errors.
 *
 * Runtime errors are surfaced via three channels:
 *
 *   1. import.meta.hot  — Vite's `vite:error` event for compile / transform errors.
 *                         Auto-dismissed on `vite:beforeUpdate` (i.e. when you fix it).
 *
 *   2. React ErrorBoundary — catches errors during component render.
 *                         Wired up in the generated main.jsx by the React runner.
 *
 *   3. Vue app.config.errorHandler — catches errors from Vue component lifecycle
 *                         hooks and setup(). Wired in generated main.js by Vue runner.
 *
 *   4. window.onerror / unhandledrejection — catches everything else (event handlers,
 *                         async callbacks, plain script errors) for all three runners.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Browser-side IIFE — runs as-is in any browser context, no bundler needed.
// Keep this self-contained: no ES imports, no require().
// ─────────────────────────────────────────────────────────────────────────────

export const OVERLAY_CLIENT_CODE = /* js */`
(function () {
  'use strict';

  // Guard: only install once even if this script is injected multiple times
  if (window.__runnOverlayInstalled) return;
  window.__runnOverlayInstalled = true;

  /* ── Styles ──────────────────────────────────────────────────────────── */

  var css = \`
    #runn-overlay-root {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    .runn-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(3px);
      -webkit-backdrop-filter: blur(3px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      opacity: 0;
      transition: opacity 0.18s ease;
    }
    .runn-backdrop.runn-in { opacity: 1; }

    .runn-card {
      background: #0c0c0c;
      border: 1px solid #252525;
      border-radius: 14px;
      padding: 28px 30px 24px;
      max-width: 740px;
      width: 100%;
      max-height: 82vh;
      overflow-y: auto;
      box-shadow: 0 32px 90px rgba(0, 0, 0, 0.7);
      transform: translateY(-10px);
      transition: transform 0.18s ease;
    }
    .runn-backdrop.runn-in .runn-card { transform: translateY(0); }

    /* scrollbar */
    .runn-card::-webkit-scrollbar { width: 6px; }
    .runn-card::-webkit-scrollbar-track { background: transparent; }
    .runn-card::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }

    .runn-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }

    .runn-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: #ff5f5f;
      background: rgba(255, 80, 80, 0.1);
      border: 1px solid rgba(255, 80, 80, 0.22);
      border-radius: 5px;
      padding: 3px 9px;
      white-space: nowrap;
    }

    .runn-plugin-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: #42b883;
      background: rgba(66, 184, 131, 0.1);
      border: 1px solid rgba(66, 184, 131, 0.22);
      border-radius: 5px;
      padding: 3px 9px;
      white-space: nowrap;
    }

    .runn-close-btn {
      margin-left: auto;
      flex-shrink: 0;
      background: transparent;
      border: 1px solid #2e2e2e;
      color: #555;
      font-size: 13px;
      width: 28px;
      height: 28px;
      border-radius: 7px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.12s, color 0.12s;
      line-height: 1;
    }
    .runn-close-btn:hover { border-color: #484848; color: #bbb; }

    .runn-message {
      font-size: 17px;
      font-weight: 600;
      color: #f0f0f0;
      line-height: 1.55;
      margin-bottom: 22px;
      word-break: break-word;
    }

    .runn-section-label {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #444;
      margin-bottom: 8px;
      margin-top: 22px;
    }

    .runn-frames {
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #1c1c1c;
    }

    .runn-frame {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: baseline;
      padding: 9px 14px;
      background: #101010;
      border-bottom: 1px solid #1a1a1a;
    }
    .runn-frame:last-child { border-bottom: none; }

    .runn-frame-top {
      background: #141414;
      border-left: 3px solid #42b883;
      padding-left: 11px;
    }

    .runn-frame-fn {
      font-family: "SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace;
      font-size: 12.5px;
      color: #999;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .runn-frame-top .runn-frame-fn { color: #e8e8e8; }

    .runn-frame-loc {
      font-family: "SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace;
      font-size: 11.5px;
      color: #42b883;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: right;
      opacity: 0.8;
    }

    .runn-comp-stack {
      font-family: "SF Mono", "Fira Code", Consolas, monospace;
      font-size: 12px;
      color: #666;
      background: #0f0f0f;
      border: 1px solid #1c1c1c;
      border-radius: 8px;
      padding: 14px;
      white-space: pre;
      overflow-x: auto;
      line-height: 1.7;
    }
    .runn-comp-stack::-webkit-scrollbar { height: 4px; }
    .runn-comp-stack::-webkit-scrollbar-thumb { background: #252525; }

    .runn-footer {
      margin-top: 20px;
      font-size: 11.5px;
      color: #353535;
      text-align: center;
    }
    .runn-footer kbd {
      font-size: 10px;
      font-family: inherit;
      background: #161616;
      border: 1px solid #2e2e2e;
      border-radius: 4px;
      padding: 1px 6px;
      color: #484848;
    }
  \`;

  var styleEl = document.createElement('style');
  styleEl.id = 'runn-overlay-styles';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── Helpers ─────────────────────────────────────────────────────────── */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Parse a stack trace string into [{fn, loc}] frames.
   * Handles V8 ("at fn (file:line:col)") and Firefox ("fn@file:line:col") formats.
   */
  function parseStack(stack) {
    if (!stack || typeof stack !== 'string') return [];
    return stack.split('\\n').reduce(function (acc, raw) {
      var line = raw.trim();
      // V8: "at FunctionName (file:line:col)"
      var m = line.match(/^at (.+?) \\((.+)\\)$/);
      if (m) { acc.push({ fn: m[1], loc: m[2] }); return acc; }
      // V8: "at file:line:col" (no function name)
      m = line.match(/^at ()(.+)$/);
      if (m) { acc.push({ fn: '', loc: m[2] }); return acc; }
      // Firefox: "fn@file:line:col"
      m = line.match(/^(.+?)@(.+)$/);
      if (m) { acc.push({ fn: m[1], loc: m[2] }); return acc; }
      return acc;
    }, []);
  }

  /** Strip runn-internal and browser-internal frames from the bottom of the stack. */
  function filterFrames(frames) {
    // Keep at least 1 frame no matter what
    var stop = frames.length;
    for (var i = frames.length - 1; i >= 1; i--) {
      var loc = frames[i].loc || '';
      if (
        loc.indexOf('node_modules') !== -1 ||
        loc.indexOf('/@fs/') !== -1 ||
        loc.indexOf('/runn-') !== -1 ||
        loc.startsWith('native')
      ) {
        stop = i;
      } else {
        break;
      }
    }
    return frames.slice(0, Math.max(stop, 3));
  }

  function framesHtml(frames) {
    if (!frames.length) return '';
    var rows = frames.map(function (f, i) {
      var cls = i === 0 ? 'runn-frame runn-frame-top' : 'runn-frame';
      return '<div class="' + cls + '">' +
        '<span class="runn-frame-fn">' + esc(f.fn || '(anonymous)') + '</span>' +
        '<span class="runn-frame-loc">' + esc(f.loc) + '</span>' +
        '</div>';
    });
    return '<div class="runn-section-label">Call Stack</div>' +
           '<div class="runn-frames">' + rows.join('') + '</div>';
  }

  /* ── Overlay DOM ─────────────────────────────────────────────────────── */

  var root = null;

  /**
   * Show the error overlay.
   * Accepts an Error object, a plain string, or a descriptor object:
   *   { error, type, message, stack, componentStack, plugin }
   */
  window.__runnShowError = function (opts) {
    // Always replace any existing overlay
    window.__runnDismissError();

    var type    = 'Runtime Error';
    var message = 'An unknown error occurred.';
    var stack   = '';
    var compStack = '';
    var plugin  = '';

    if (opts instanceof Error) {
      type    = opts.name || 'Error';
      message = opts.message || message;
      stack   = opts.stack  || '';
    } else if (typeof opts === 'string') {
      message = opts;
    } else if (opts && typeof opts === 'object') {
      var err = opts.error || opts.err || null;
      if (err instanceof Error) {
        type    = err.name    || type;
        message = err.message || message;
        stack   = err.stack   || '';
      } else if (typeof err === 'string') {
        message = err;
      }
      // Allow callers to override individual fields
      if (opts.type)    type    = opts.type;
      if (opts.message) message = opts.message;
      if (opts.stack)   stack   = opts.stack;
      compStack = opts.componentStack || '';
      plugin    = opts.plugin || '';
    }

    // Remove the error name prefix that V8 prepends to stack strings
    // so we don't show "TypeError: ..." twice.
    if (stack) {
      var prefix = type + ': ' + message;
      if (stack.startsWith(prefix)) stack = stack.slice(prefix.length).trimStart();
      else if (stack.startsWith(type + ':')) stack = stack.slice(stack.indexOf('\\n') + 1);
    }

    var frames    = filterFrames(parseStack(stack));
    var pluginTag = plugin ? '<span class="runn-plugin-badge">' + esc(plugin) + '</span>' : '';
    var compHtml  = compStack
      ? '<div class="runn-section-label">Component Stack</div>' +
        '<pre class="runn-comp-stack">' + esc(compStack.trim()) + '</pre>'
      : '';

    var html = [
      '<div class="runn-backdrop" id="runn-bd">',
        '<div class="runn-card" role="dialog" aria-modal="true" aria-label="Error">',
          '<div class="runn-header">',
            '<span class="runn-badge">' + esc(type) + '</span>',
            pluginTag,
            '<button class="runn-close-btn" id="runn-x" title="Dismiss (Esc)">&#x2715;</button>',
          '</div>',
          '<div class="runn-message">' + esc(message) + '</div>',
          framesHtml(frames),
          compHtml,
          '<div class="runn-footer">Press <kbd>Esc</kbd> to dismiss &nbsp;&bull;&nbsp; fix the error to auto-dismiss</div>',
        '</div>',
      '</div>',
    ].join('');

    root = document.createElement('div');
    root.id = 'runn-overlay-root';
    root.innerHTML = html;
    document.body.appendChild(root);

    // Trigger CSS transition on next frame
    requestAnimationFrame(function () {
      var bd = root.querySelector('#runn-bd');
      if (bd) bd.classList.add('runn-in');
    });

    root.querySelector('#runn-x').addEventListener('click', window.__runnDismissError);
    root.querySelector('#runn-bd').addEventListener('click', function (e) {
      if (e.target === this) window.__runnDismissError();
    });
  };

  window.__runnDismissError = function () {
    if (root) { root.remove(); root = null; }
  };

  /* ── Global listeners ────────────────────────────────────────────────── */

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.__runnDismissError();
  });

  // Uncaught errors from event handlers, setTimeout callbacks, etc.
  // React ErrorBoundary / Vue errorHandler catch *component* errors;
  // this mops up everything else.
  var _catching = false;
  window.addEventListener('error', function (e) {
    if (_catching) return;
    _catching = true;
    window.__runnShowError({
      type:    (e.error && e.error.name)    || 'Uncaught Error',
      message: (e.error && e.error.message) || e.message || String(e),
      stack:   (e.error && e.error.stack)   || '',
    });
    setTimeout(function () { _catching = false; }, 0);
  });

  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    window.__runnShowError({
      type:    reason instanceof Error ? (reason.name || 'Error') : 'Unhandled Rejection',
      message: reason instanceof Error ? reason.message : String(reason),
      stack:   reason instanceof Error ? reason.stack   : '',
    });
  });

})();
`

// ─────────────────────────────────────────────────────────────────────────────
// Vite plugin — serves the overlay as a virtual module and wires up HMR events
// ─────────────────────────────────────────────────────────────────────────────

const VIRTUAL_ID  = 'virtual:runn-overlay'
const RESOLVED_ID = '\0' + VIRTUAL_ID

/**
 * Create a Vite plugin that:
 *   - Resolves `import 'virtual:runn-overlay'` to an inline virtual module
 *   - That module injects the overlay IIFE and subscribes to Vite HMR error events
 *   - Build errors auto-dismiss when the file is saved with a fix
 *
 * @returns {import('vite').Plugin}
 */
export function createViteOverlayPlugin() {
  // The virtual module wraps the overlay IIFE and adds HMR event listeners.
  // We embed the overlay code inline so no extra file read is needed at runtime.
  const moduleCode = OVERLAY_CLIENT_CODE + `
;(function () {
  if (typeof import_meta_hot === 'undefined') return;
  import_meta_hot.on('vite:error', function (payload) {
    var err = payload.err || {};
    window.__runnShowError({
      type:    err.plugin ? 'Build Error' : (err.name || 'Error'),
      message: err.message || 'Build failed.',
      stack:   err.stack   || '',
      plugin:  err.plugin  || '',
    });
  });
  import_meta_hot.on('vite:beforeUpdate', function () {
    window.__runnDismissError();
  });
})();
`

  // Vite replaces import.meta.hot but we can't write that directly inside a
  // template literal that's not processed by Vite. Use a side-channel approach:
  // inject the listeners as actual source that Vite WILL process.
  const viteModule = OVERLAY_CLIENT_CODE + `
;if (import.meta.hot) {
  import.meta.hot.on('vite:error', function (payload) {
    var err = payload.err || {};
    window.__runnShowError({
      type:    err.plugin ? 'Build Error' : (err.name || 'Error'),
      message: err.message || 'Build failed.',
      stack:   err.stack   || '',
      plugin:  err.plugin  || '',
    });
  });
  import.meta.hot.on('vite:beforeUpdate', function () {
    window.__runnDismissError();
  });
}
`

  return {
    name: 'runn-overlay',

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },

    load(id) {
      if (id === RESOLVED_ID) return viteModule
    },
  }
}
