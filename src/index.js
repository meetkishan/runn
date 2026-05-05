/**
 * index.js — CLI entry point
 *
 * Reads the target file, runs it through the type detector, and delegates to
 * the appropriate runner. Each runner owns its own lifecycle (dev server,
 * child process, file watcher) and is responsible for keeping the process
 * alive until the user hits Ctrl-C.
 *
 * The file is read here (not inside the runner) so that detect.js can inspect
 * the content for heuristics without each runner needing to re-read it.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { detectFileType } from './detect.js'
import { runScript } from './runners/script.js'
import { runReact } from './runners/react.js'
import { runVue } from './runners/vue.js'
import { runNextjs } from './runners/nextjs.js'
import { runNuxt } from './runners/nuxt.js'
import { runHtml } from './runners/html.js'

const rawArgs = process.argv.slice(2)

// Show help and exit cleanly when no file is provided or help is requested
if (rawArgs.length === 0 || rawArgs[0] === '--help' || rawArgs[0] === '-h') {
  console.log(`
  runn — run anything, zero config

  Usage:
    runn <file> [options]

  Options:
    --port, -p <n>   port to listen on (default: 3000, auto-increments if busy)
    --host           expose on 0.0.0.0 so other devices on the network can connect
    --help, -h       show this help message

  Supported:
    .js  .ts        plain script   →  run with bun (or node --watch)
    .jsx .tsx       React component →  Vite dev server + hot reload
    .vue            Vue component   →  Vite dev server + hot reload
    .html .htm      static file    →  dev server + hot reload
    Next.js file    auto-detected  →  next dev
    Nuxt file       auto-detected  →  nuxt dev

  Examples:
    runn server.ts
    runn App.tsx
    runn App.tsx --port 4000
    runn App.tsx --host
    runn Button.vue --port 5173 --host
    runn pages/index.tsx     (Next.js)
    runn pages/index.vue     (Nuxt)
    runn index.html --port 8080 --host
  `)
  process.exit(0)
}

// ── Parse flags ───────────────────────────────────────────────────────────────
// Flags can appear anywhere in the argument list, before or after the filename.
// The file is the first positional argument (not starting with '-').

/** @type {{ port: number|null, host: boolean }} */
const opts = { port: null, host: false }
const positional = []

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i]

  if (arg === '--port' || arg === '-p') {
    const raw = rawArgs[++i]
    const n = parseInt(raw, 10)
    if (!raw || !Number.isInteger(n) || n < 1 || n > 65535) {
      console.error(`runn: invalid port value: ${raw ?? '(missing)'}`)
      process.exit(1)
    }
    opts.port = n
  } else if (arg === '--host') {
    opts.host = true
  } else if (!arg.startsWith('-')) {
    positional.push(arg)
  } else {
    console.error(`runn: unknown flag: ${arg}`)
    process.exit(1)
  }
}

const filePath = positional[0]

if (!filePath) {
  console.error('runn: no file specified. Run runn --help for usage.')
  process.exit(1)
}

// resolve() turns a relative path like './App.vue' into an absolute one.
// All runners expect an absolute path so they can safely construct temp dirs,
// symlinks, and Vite configs without ambiguity.
const absPath = resolve(filePath)

if (!existsSync(absPath)) {
  console.error(`runn: file not found: ${filePath}`)
  process.exit(1)
}

// Read the file upfront so detect.js can inspect content for heuristics.
// The try/catch handles binary files and permission errors gracefully —
// the detector falls back to extension-only logic when content is empty.
let content = ''
try {
  content = readFileSync(absPath, 'utf8')
} catch { /* binary or unreadable — fall through with empty string */ }

const type = detectFileType(absPath, content)

switch (type) {
  case 'html':
    await runHtml(absPath, opts)
    break
  case 'react':
    await runReact(absPath, content, opts)
    break
  case 'vue':
    await runVue(absPath, opts)
    break
  case 'nextjs':
    await runNextjs(absPath, opts)
    break
  case 'nuxt':
    await runNuxt(absPath, opts)
    break
  default:
    await runScript(absPath)
}
