/**
 * utils.js — shared helpers used across runners
 *
 * Kept intentionally small. Each function has a single job and no side effects,
 * which makes them easy to test and safe to call from any runner.
 */

import { execSync, spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'net'
import { networkInterfaces } from 'os'

/**
 * Returns true if Bun is installed and callable on this machine.
 * We prefer Bun over Node everywhere because it starts faster, handles
 * TypeScript natively, and its --watch mode is more reliable.
 *
 * stdio: 'ignore' suppresses the version string so it doesn't pollute output.
 */
export function hasBun() {
  try {
    execSync('bun --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Returns the absolute path to the root of the runn package itself (i.e. the
 * directory that contains package.json and node_modules).
 *
 * Used by runners that need to reference bundled dependencies — for example,
 * the React runner imports Vite and @vitejs/plugin-react from here rather than
 * expecting the user to have them installed.
 *
 * import.meta.url is the URL of this file (src/utils.js), so '../' resolves
 * to the package root.
 */
export function getPackageRoot() {
  return fileURLToPath(new URL('../', import.meta.url))
}

/**
 * Walks up the directory tree from a file until it finds a package.json,
 * which we treat as the project root. Falls back to the file's own directory
 * if no package.json is found (e.g. the user is running a lone script).
 *
 * This is used by the React runner to locate the user's own node_modules so
 * that third-party packages (MUI, Zustand, etc.) can be resolved even when
 * they aren't in runn's own node_modules.
 *
 * @param {string} filePath - absolute path to the target file
 * @returns {string} absolute path to the project root directory
 */
export function findProjectRoot(filePath) {
  let dir = dirname(filePath)

  while (true) {
    if (existsSync(join(dir, 'package.json'))) return dir

    const parent = dirname(dir)

    // Reached the filesystem root — give up and use the file's own directory
    if (parent === dir) return dirname(filePath)

    dir = parent
  }
}

/**
 * Finds an available TCP port starting at `start`, incrementing by 1 until
 * a free one is found. Binding to 127.0.0.1 (not 0.0.0.0) keeps the probe
 * local so it doesn't briefly appear on the network.
 *
 * @param {number} start - first port to try (default 3000)
 * @returns {Promise<number>}
 */
export async function findFreePort(start = 3000) {
  return new Promise((resolve, reject) => {
    const server = createServer()

    server.listen(start, '127.0.0.1', () => {
      const { port } = server.address()
      // Close immediately — we just needed to know if the port was free
      server.close(() => resolve(port))
    })

    // Port in use — try the next one
    server.on('error', () =>
      findFreePort(start + 1).then(resolve).catch(reject)
    )
  })
}

/**
 * Returns the first non-loopback IPv4 address on the machine — used to print
 * the network URL when the server is bound to 0.0.0.0.
 *
 * Returns null if no suitable interface is found (headless CI, containers, etc.)
 *
 * @returns {string|null}
 */
export function getLocalIP() {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return null
}

/**
 * Opens a URL in the user's default browser in a platform-appropriate way.
 * The child process is detached and unreferenced so it doesn't keep the
 * Node event loop alive if runn itself exits.
 *
 * @param {string} url
 */
export function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? 'open' :   // macOS
    process.platform === 'win32'  ? 'cmd'  :   // Windows
                                    'xdg-open'  // Linux (freedesktop standard)

  const args =
    process.platform === 'win32' ? ['/c', 'start', '', url] : [url]

  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref()
}
