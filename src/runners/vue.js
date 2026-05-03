/**
 * runners/vue.js — Vue SFC (Single File Component) runner
 *
 * Turns a bare .vue file into a running Vite dev server with HMR.
 * Identical strategy to the React runner:
 *   - Temp dir with a generated index.html + main.js entry point
 *   - Symlink to runn's node_modules so Vite resolves vue naturally
 *   - Explicit alias pins vue to runn's copy to prevent "multiple Vue" errors
 *   - resolve.modules fallback so user's own deps (Pinia, VueRouter, etc.) resolve
 *
 * Vue SFC compilation is handled by @vitejs/plugin-vue which is bundled with runn.
 * The user needs no package.json, no vite.config, no dependencies installed.
 *
 * Module resolution for Vue
 * ─────────────────────────
 * Vue 3 is split across several packages (@vue/reactivity, @vue/runtime-core,
 * @vue/runtime-dom, @vue/compiler-sfc, etc.) that are all re-exported by the
 * top-level `vue` package. Rather than aliasing every sub-package, we pin the
 * top-level `vue` to runn's copy and let Vite resolve the sub-packages from
 * the same node_modules directory via the symlink.
 */

import { mkdir, writeFile, rm, symlink } from 'fs/promises'
import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import { getPackageRoot, findProjectRoot } from '../utils.js'
import { createViteOverlayPlugin } from '../overlay.js'

/**
 * @param {string} absPath - absolute path to the .vue file
 */
export async function runVue(absPath) {
  const RUNN_ROOT = getPackageRoot()
  const userFileDir = dirname(absPath)
  const userProjectRoot = findProjectRoot(absPath)
  const fileName = basename(absPath)

  // Deterministic temp dir — same file always maps to the same dir
  const hash = createHash('md5').update(absPath).digest('hex').slice(0, 8)
  const tempDir = join(tmpdir(), `runn-vue-${hash}`)

  await mkdir(tempDir, { recursive: true })

  // Symlink runn's node_modules so Vite's default node_modules crawl finds
  // vue, @vitejs/plugin-vue and @vue/compiler-sfc without any custom config
  const nmLink = join(tempDir, 'node_modules')
  if (!existsSync(nmLink)) {
    try {
      await symlink(join(RUNN_ROOT, 'node_modules'), nmLink, 'dir')
    } catch { /* already exists or symlinks not supported — resolve.modules covers us */ }
  }

  // Minimal HTML shell — Vue mounts into #app (convention over #root)
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
  <div id="app"></div>
  <script type="module" src="./main.js"></script>
</body>
</html>
`
  )

  // Entry point — createApp mounts the user's component into #app.
  // Plain .js (not .ts) so Vite doesn't need a tsconfig to process it.
  //
  // app.config.errorHandler catches errors thrown inside component setup(),
  // lifecycle hooks, template expressions, and event handlers.
  // The overlay import additionally wires up Vite build-error events and
  // the global window.onerror handler for everything else.
  await writeFile(
    join(tempDir, 'main.js'),
    `import { createApp } from 'vue'
import App from ${JSON.stringify(absPath)}
import 'virtual:runn-overlay'

const app = createApp(App)

// Surface component errors in the runn overlay instead of the browser console
app.config.errorHandler = function (err, _instance, info) {
  window.__runnShowError({
    type:    err && err.name ? err.name : 'Vue Error',
    message: err && err.message ? err.message : String(err),
    stack:   err && err.stack  ? err.stack   : '',
    componentStack: info || '',
  })
}

// Also capture unhandled warnings in dev mode (e.g. prop type mismatches)
app.config.warnHandler = function (msg, _instance, trace) {
  console.warn('[runn vue]', msg, trace)
}

app.mount('#app')
`
  )

  console.log(`runn: starting Vue dev server for ${fileName}...`)

  // Dynamic imports — only pay the startup cost for Vue files
  const { createServer } = await import('vite')
  const { default: vue } = await import('@vitejs/plugin-vue')

  const rn = join(RUNN_ROOT, 'node_modules')

  const server = await createServer({
    configFile: false,  // runn owns the config — ignore any vite.config.* in the user's project
    root: tempDir,
    plugins: [
      vue(),
      // Serves `virtual:runn-overlay` and wires up import.meta.hot error events.
      createViteOverlayPlugin(),
    ],

    server: {
      open: true,
      host: 'localhost',
      hmr: {
        // Replace Vite's default error overlay with runn's custom one
        overlay: false,
      },
      fs: {
        strict: false,
        // Allow Vite to read files from all relevant locations:
        //   tempDir         — generated index.html and main.js
        //   userFileDir     — the .vue component and its siblings
        //   userProjectRoot — user's node_modules for extra deps
        //   RUNN_ROOT       — runn's bundled vue, vite, and plugins
        allow: [tempDir, userFileDir, userProjectRoot, RUNN_ROOT],
      },
    },

    resolve: {
      // Pin vue to runn's copy. Without this, if the user's project also has vue
      // installed, Vite might load two separate instances of Vue's reactivity
      // system and produce silent data-binding bugs.
      alias: [
        { find: 'vue', replacement: join(rn, 'vue') },
      ],
      // Fallback search path so user's own packages (Pinia, VueRouter, etc.) resolve
      modules: [rn, join(userProjectRoot, 'node_modules'), 'node_modules'],
      dedupe: ['vue'],
    },

    optimizeDeps: {
      include: ['vue'],
      esbuildOptions: {
        // esbuild has its own resolver that ignores resolve.modules —
        // nodePaths fills the same role for the pre-bundling step
        nodePaths: [rn, join(userProjectRoot, 'node_modules')],
      },
    },

    logLevel: 'info',
  })

  await server.listen()
  server.printUrls()
  console.log(`\nrunn: editing ${fileName} will hot-reload instantly.\n`)

  // Tear down gracefully on Ctrl-C — removes the temp dir to stay clean
  const cleanup = async () => {
    await server.close()
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}
