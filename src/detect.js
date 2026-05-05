/**
 * detect.js — file type router
 *
 * Inspects the file path and its content to decide which runner should handle
 * it. The priority order matters — it is intentional:
 *
 *   1. HTML    — extension is unambiguous, check first
 *   2. Nuxt    — must come before .vue, because a .vue file inside a Nuxt
 *                project needs `nuxt dev`, not a standalone Vite server
 *   3. Next.js — must come before .tsx/.jsx for the same reason
 *   4. Vue     — .vue extension, or .ts/.js files that import from 'vue'
 *   5. React   — .tsx/.jsx extensions, or .ts/.js files that look like components
 *   6. Script  — everything else (plain Node/Bun scripts, utilities, etc.)
 */

import { existsSync } from 'fs'
import { extname, dirname, join } from 'path'

// All filenames that signal a Next.js project root
const NEXT_CONFIGS = [
  'next.config.js',
  'next.config.ts',
  'next.config.mjs',
  'next.config.cjs',
]

// All filenames that signal a Nuxt project root
const NUXT_CONFIGS = [
  'nuxt.config.js',
  'nuxt.config.ts',
  'nuxt.config.mjs',
  'nuxt.config.cjs',
]

/**
 * Returns one of: 'html' | 'nuxt' | 'nextjs' | 'vue' | 'react' | 'script'
 *
 * @param {string} absPath  - absolute path to the file
 * @param {string} content  - file contents (used for Vue/React heuristics on .ts/.js)
 */
export function detectFileType(absPath, content = '') {
  const ext = extname(absPath).toLowerCase()

  if (ext === '.html' || ext === '.htm') return 'html'

  // Framework project checks must run before extension checks — a .vue file
  // inside a Nuxt project and a .tsx inside a Next.js project both need the
  // framework's own dev server, not runn's standalone Vite scaffold
  if (isNuxtProject(absPath))   return 'nuxt'
  if (isNextjsProject(absPath)) return 'nextjs'

  // .vue is an unambiguous signal — no content scan needed
  if (ext === '.vue') return 'vue'

  // .tsx/.jsx are unambiguous React signals — no content scan needed
  if (ext === '.tsx' || ext === '.jsx') return 'react'

  // For plain .ts/.js we inspect content because these extensions are shared
  // between Vue components, React components, and plain scripts.
  // Vue check comes first — `from 'vue'` is more specific than JSX heuristics.
  if (ext === '.ts' || ext === '.js' || ext === '.mjs' || ext === '.mts') {
    if (looksLikeVueComponent(content))   return 'vue'
    if (looksLikeReactComponent(content)) return 'react'
    return 'script'
  }

  return 'script'
}

/**
 * Walks up the directory tree looking for a Nuxt config file.
 * Walking up lets us detect Nuxt from any file deep inside the project —
 * e.g. components/ui/Button.vue — not just files at the project root.
 *
 * @param {string} absPath
 * @returns {boolean}
 */
function isNuxtProject(absPath) {
  let dir = dirname(absPath)

  while (true) {
    for (const cfg of NUXT_CONFIGS) {
      if (existsSync(join(dir, cfg))) return true
    }

    const parent = dirname(dir)
    if (parent === dir) break // reached filesystem root
    dir = parent
  }

  return false
}

/**
 * Walks up the directory tree looking for a Next.js config file.
 * Same walk-up logic as isNuxtProject — handles deeply nested files.
 *
 * @param {string} absPath
 * @returns {boolean}
 */
function isNextjsProject(absPath) {
  let dir = dirname(absPath)

  while (true) {
    for (const cfg of NEXT_CONFIGS) {
      if (existsSync(join(dir, cfg))) return true
    }

    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return false
}

/**
 * Heuristic: does a .ts/.js file look like a Vue component?
 * Checks for ESM/CJS imports from 'vue' and Vue's defineComponent API.
 * Vue SFCs (.vue files) are detected by extension and never reach this check.
 *
 * @param {string} content
 * @returns {boolean}
 */
function looksLikeVueComponent(content) {
  return (
    /from\s+['"]vue['"]/.test(content) ||
    /require\(\s*['"]vue['"]\s*\)/.test(content) ||
    /defineComponent\s*\(/.test(content) ||
    /createApp\s*\(/.test(content)
  )
}

/**
 * Heuristic: does a .ts/.js file look like a React component?
 * Runs only after the Vue check — `from 'react'` is checked after `from 'vue'`.
 *
 * Three signals we look for:
 *   - ESM import from 'react'
 *   - CommonJS require('react')
 *   - JSX with a capital-letter component tag (e.g. <MyComponent />)
 *
 * @param {string} content
 * @returns {boolean}
 */
function looksLikeReactComponent(content) {
  return (
    /from\s+['"]react['"]/.test(content) ||
    /require\(\s*['"]react['"]\s*\)/.test(content) ||
    /<[A-Z][A-Za-z0-9]*[\s\/>]/.test(content)
  )
}
