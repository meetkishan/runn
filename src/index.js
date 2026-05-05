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

const args = process.argv.slice(2)

// Show help and exit cleanly when no file is provided or help is requested
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
  runn — run anything, zero config

  Usage:
    runn <file>

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
    runn Button.vue
    runn pages/index.tsx     (Next.js)
    runn pages/index.vue     (Nuxt)
    runn index.html
  `)
  process.exit(0)
}

const filePath = args[0]

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
    await runHtml(absPath)
    break
  case 'react':
    await runReact(absPath, content)
    break
  case 'vue':
    await runVue(absPath)
    break
  case 'nextjs':
    await runNextjs(absPath)
    break
  case 'nuxt':
    await runNuxt(absPath)
    break
  default:
    await runScript(absPath)
}
