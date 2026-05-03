/**
 * runners/html.js — static HTML file server with hot reload
 *
 * Serves the directory containing the HTML file over HTTP and automatically
 * reloads the browser whenever any file in that directory changes.
 *
 * Hot reload mechanism — Server-Sent Events (SSE)
 * ────────────────────────────────────────────────
 * We chose SSE over WebSockets because:
 *   - SSE is a plain HTTP connection — no upgrade handshake, no extra port
 *   - The browser reconnects automatically if the server restarts
 *   - One-way (server → browser) is all we need for "please reload"
 *
 * A small inline script is injected before </body> in every served HTML file.
 * It opens a persistent EventSource connection to /__runn_hmr. When a file
 * changes, the server writes a "data: reload\n\n" SSE message and every
 * connected browser tab reloads itself.
 *
 * File watching
 * ─────────────
 * We watch the entire directory (not just the single HTML file) so that edits
 * to linked CSS, JS, or image files also trigger a reload. A 80ms debounce
 * prevents a burst of events (e.g. from a formatter saving multiple files at
 * once) from causing multiple rapid reloads.
 */

import { createServer } from 'http'
import { readFile, watch } from 'fs'
import { extname, dirname, join } from 'path'
import { findFreePort, openBrowser } from '../utils.js'
import { OVERLAY_CLIENT_CODE } from '../overlay.js'

// MIME type map — covers the assets most likely to sit next to an HTML file.
// Falls back to application/octet-stream for anything not listed here.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.ts':   'application/javascript',
  '.jsx':  'application/javascript',
  '.tsx':  'application/javascript',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
}

// Injected before </body> in every HTML response.
// Loads the error overlay first, then wires up the SSE hot-reload connection.
// Both scripts use IIFEs to avoid polluting the global scope of the user's page.
// On error (server restart / port change) we wait 800ms before reloading —
// enough time for the new server to be ready to accept connections.
const HMR_SNIPPET = `
<script src="/__runn_overlay.js"></script>
<script>
(function () {
  var es = new EventSource('/__runn_hmr');
  es.onmessage = function () { location.reload(); };
  es.onerror = function () {
    es.close();
    setTimeout(function () { location.reload(); }, 800);
  };
  console.log('[runn] hot-reload + error overlay active');
})();
</script>
`

/**
 * @param {string} absPath - absolute path to the .html / .htm file to serve
 */
export async function runHtml(absPath) {
  const dir = dirname(absPath)
  const port = await findFreePort(3000)

  // Track all open SSE connections so we can broadcast reload events.
  // A Set is used so cleanup on connection close is O(1).
  const sseClients = new Set()

  function sendReload() {
    for (const res of sseClients) {
      try {
        res.write('data: reload\n\n')
      } catch {
        // Client disconnected between the watch event and the write — remove it
        sseClients.delete(res)
      }
    }
  }

  const server = createServer((req, res) => {
    // ── SSE hot-reload endpoint ──────────────────────────────────────────────
    if (req.url === '/__runn_hmr') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        // Nginx and some proxies buffer SSE responses — this header disables that
        'X-Accel-Buffering': 'no',
      })
      // Initial comment line keeps the connection alive through proxy idle timeouts
      res.write(': connected\n\n')
      sseClients.add(res)
      req.on('close', () => sseClients.delete(res))
      return
    }

    // ── Error overlay script ─────────────────────────────────────────────────
    // Served as a plain JS file so the browser can cache it and it doesn't
    // inflate the HTML response. Sets up window.__runnShowError,
    // window.__runnDismissError, window.onerror, and unhandledrejection.
    if (req.url === '/__runn_overlay.js') {
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-cache',
      })
      res.end(OVERLAY_CLIENT_CODE, 'utf8')
      return
    }

    // ── Static file serving ──────────────────────────────────────────────────
    // Strip query strings and hash fragments before resolving the file path
    const urlPath = req.url.split('?')[0].split('#')[0]

    // '/' maps to the target HTML file; everything else is relative to its dir
    const filePath = urlPath === '/' ? absPath : join(dir, urlPath)

    readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end(`404 — ${urlPath}`)
        return
      }

      const ext = extname(filePath).toLowerCase()
      const mime = MIME[ext] ?? 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': mime })

      if (ext === '.html' || ext === '.htm') {
        const html = data.toString('utf8')

        // Inject before </body> so the script runs after the DOM is parsed.
        // If there's no </body> (fragment files, etc.) we append to the end.
        const injected = html.includes('</body>')
          ? html.replace(/<\/body>/i, HMR_SNIPPET + '</body>')
          : html + HMR_SNIPPET

        res.end(injected, 'utf8')
      } else {
        res.end(data)
      }
    })
  })

  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`
    console.log(`runn: serving   ${absPath}`)
    console.log(`runn: →         ${url}`)
    console.log(`runn: watching  ${dir}`)
    console.log()
    openBrowser(url)
  })

  // ── File watcher ──────────────────────────────────────────────────────────
  let debounce

  const watcher = watch(dir, { recursive: true }, (_, filename) => {
    if (!filename) return

    // Debounce: collapse rapid successive events (formatter, bundler output,
    // multiple files saved at once) into a single reload after 80ms of quiet
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      console.log(`runn: changed — ${filename}`)
      sendReload()
    }, 80)
  })

  const cleanup = () => {
    watcher.close()
    server.close()
    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}
