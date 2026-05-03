/**
 * runners/react.js — React component runner
 *
 * Turns a bare .tsx/.jsx file into a running Vite dev server with HMR.
 * The user needs no package.json, no index.html, no vite.config — runn
 * generates everything in a temporary directory and tears it down on exit.
 *
 * Temp directory strategy
 * ───────────────────────
 * We create a dir in the OS temp folder keyed by an MD5 of the file's
 * absolute path. The hash makes it deterministic — re-running the same file
 * reuses the same dir (skipping the symlink step on subsequent runs) and
 * avoids collisions between different files.
 *
 * Module resolution strategy
 * ──────────────────────────
 * Vite needs to find React, react-dom, and @vitejs/plugin-react. These live
 * in runn's own node_modules. We use two complementary mechanisms:
 *
 *   1. Symlink — link runn's node_modules into the temp dir so Vite's default
 *      node_modules crawl finds them without any special config.
 *
 *   2. Explicit aliases — pin every React subpath (jsx-runtime, client, etc.)
 *      to runn's copies. This prevents "multiple React instances" errors in
 *      cases where the user's project also has React installed — without the
 *      alias, Vite might find two different React copies and crash.
 *
 *   3. resolve.modules — also searches the user's own node_modules so that
 *      third-party packages (MUI, Radix, Zustand, etc.) resolve correctly.
 */

import { mkdir, writeFile, rm, symlink } from 'fs/promises'
import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import { getPackageRoot, findProjectRoot } from '../utils.js'
import { createViteOverlayPlugin } from '../overlay.js'

/**
 * @param {string} absPath - absolute path to the component file
 * @param {string} content - file contents (used to detect export style)
 */
export async function runReact(absPath, content) {
  const RUNN_ROOT = getPackageRoot()
  const userFileDir = dirname(absPath)
  const userProjectRoot = findProjectRoot(absPath)
  const fileName = basename(absPath)

  // Deterministic temp dir name — same file always gets the same dir
  const hash = createHash('md5').update(absPath).digest('hex').slice(0, 8)
  const tempDir = join(tmpdir(), `runn-${hash}`)

  await mkdir(tempDir, { recursive: true })

  // Symlink runn's node_modules so Vite can find react, vite, and the plugin
  // without any custom resolver config. The try/catch handles the case where
  // the link already exists on a second run, or where the OS disallows it
  // (rare, but possible on some CI environments).
  const nmLink = join(tempDir, 'node_modules')
  if (!existsSync(nmLink)) {
    try {
      await symlink(join(RUNN_ROOT, 'node_modules'), nmLink, 'dir')
    } catch { /* already exists or symlinks not supported — aliases cover us */ }
  }

  // Detect how the component is exported so we can import it correctly.
  // We prefer default exports; fall back to the first named capital export
  // (e.g. `export function Counter`). If neither is found we try default
  // anyway and let Vite surface a helpful error.
  const hasDefault = /export\s+default/.test(content)
  const namedMatch = content.match(/export\s+(?:function|const|class)\s+([A-Z][A-Za-z0-9]*)/)

  let importLine
  if (hasDefault) {
    importLine = `import App from ${JSON.stringify(absPath)}`
  } else if (namedMatch) {
    importLine = `import { ${namedMatch[1]} as App } from ${JSON.stringify(absPath)}`
  } else {
    importLine = `import App from ${JSON.stringify(absPath)}`
  }

  // Minimal HTML shell — just enough for React to mount into #root
  await writeFile(
    join(tempDir, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>runn — ${fileName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.jsx"></script>
</body>
</html>
`
  )

  // Entry point that mounts the user's component — generated fresh each run
  // so changes to the import line (e.g. named → default export) take effect.
  //
  // The overlay import wires up Vite build-error events and the global
  // window.onerror handler. The ErrorBoundary catches component render errors
  // that React re-throws before they can reach window.onerror.
  await writeFile(
    join(tempDir, 'main.jsx'),
    `${importLine}
import { createRoot } from 'react-dom/client'
import { StrictMode, Component } from 'react'
import 'virtual:runn-overlay'

// Catches errors thrown during render / in lifecycle methods.
// Errors from event handlers, async code, and setTimeout are caught
// separately by the window.onerror listener installed by the overlay.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    window.__runnShowError({
      type:           error.name || 'React Error',
      message:        error.message,
      stack:          error.stack,
      componentStack: info && info.componentStack,
    })
  }

  render() {
    // When there's an error the overlay is showing — render nothing beneath it.
    // When the error is fixed, HMR replaces this module and the boundary resets.
    if (this.state.hasError) return null
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
`
  )

  console.log(`runn: starting React dev server for ${fileName}...`)

  // Dynamic imports so we don't pay the Vite startup cost for non-React files
  const { createServer } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')

  // Shorthand for runn's own node_modules — used throughout the Vite config
  const rn = join(RUNN_ROOT, 'node_modules')

  const server = await createServer({
    configFile: false,  // we own the config entirely — don't look for vite.config.*
    root: tempDir,
    plugins: [
      react(),
      // Serves `virtual:runn-overlay` and wires up import.meta.hot error events.
      // Must come after react() so JSX is already transformed when the virtual
      // module's HMR listeners fire.
      createViteOverlayPlugin(),
    ],

    server: {
      open: true,   // open the browser automatically on first start
      host: 'localhost',
      hmr: {
        // Disable Vite's built-in error overlay — runn's overlay replaces it
        // with a richer, on-brand experience that also catches React render errors.
        overlay: false,
      },
      fs: {
        strict: false,
        // Allow Vite to serve files from all relevant directories:
        //   tempDir       — generated index.html and main.jsx
        //   userFileDir   — the component itself and its siblings
        //   userProjectRoot — user's node_modules and other project files
        //   RUNN_ROOT     — runn's bundled react, vite, etc.
        allow: [tempDir, userFileDir, userProjectRoot, RUNN_ROOT],
      },
    },

    resolve: {
      // Pin every React subpath to runn's copies. Without this, if the user's
      // project also has React installed, Vite might load two separate React
      // instances and throw "Hooks can only be called inside a function component".
      alias: [
        { find: 'react/jsx-dev-runtime', replacement: join(rn, 'react/jsx-dev-runtime.js') },
        { find: 'react/jsx-runtime',     replacement: join(rn, 'react/jsx-runtime.js') },
        { find: 'react-dom/client',      replacement: join(rn, 'react-dom/client.js') },
        { find: 'react-dom/server',      replacement: join(rn, 'react-dom/server.js') },
        { find: 'react-dom',             replacement: join(rn, 'react-dom/index.js') },
        { find: 'react',                 replacement: join(rn, 'react/index.js') },
      ],
      // Search runn's node_modules first, then the user's. This ordering means
      // runn's React is always preferred, while the user's other packages (MUI,
      // Radix, Zustand, etc.) are still resolvable from their own project.
      modules: [rn, join(userProjectRoot, 'node_modules'), 'node_modules'],
      dedupe: ['react', 'react-dom'],
    },

    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client'],
      esbuildOptions: {
        // esbuild (used for pre-bundling) has its own module resolver that
        // doesn't read Vite's resolve.modules — nodePaths fills the same role
        nodePaths: [rn, join(userProjectRoot, 'node_modules')],
      },
    },

    logLevel: 'info',
  })

  await server.listen()
  server.printUrls()
  console.log(`\nrunn: editing ${fileName} will hot-reload instantly.\n`)

  // Clean up the Vite server and temp dir when the user exits with Ctrl-C
  const cleanup = async () => {
    await server.close()
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}
