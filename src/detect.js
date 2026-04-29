/**
 * detect.js — file type router
 *
 * Inspects the file path and its content to decide which runner should handle
 * it. The priority order matters:
 *   1. HTML  — extension is unambiguous, check first
 *   2. Next.js — must come before the .tsx/.jsx check because a Next.js page
 *      is also a React file, but it needs `next dev`, not a bare Vite server
 *   3. React — .tsx/.jsx extensions, or .ts/.js files that look like components
 *   4. Script — everything else (plain Node/Bun scripts, utilities, etc.)
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

/**
 * Returns one of: 'html' | 'nextjs' | 'react' | 'script'
 *
 * @param {string} absPath  - absolute path to the file
 * @param {string} content  - file contents (used for React heuristics on .ts/.js)
 */
export function detectFileType(absPath, content = '') {
  const ext = extname(absPath).toLowerCase()

  if (ext === '.html' || ext === '.htm') return 'html'

  // Walk up the tree before checking extensions — a Next.js .tsx page should
  // never be opened with the standalone Vite React runner
  if (isNextjsProject(absPath)) return 'nextjs'

  // JSX/TSX extensions are an unambiguous signal — no content scan needed
  if (ext === '.tsx' || ext === '.jsx') return 'react'

  // For plain .ts/.js files we need a content heuristic because these
  // extensions are used for both React components and plain scripts
  if (ext === '.ts' || ext === '.js' || ext === '.mjs' || ext === '.mts') {
    if (looksLikeReactComponent(content)) return 'react'
    return 'script'
  }

  return 'script'
}

/**
 * Walks up the directory tree from the given file looking for a Next.js config.
 * We walk up (rather than just checking the file's directory) so that a file
 * deep inside a project — e.g. app/dashboard/components/Chart.tsx — is still
 * correctly identified as part of a Next.js project.
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

    // dirname('/') === '/' — we've reached the filesystem root with no match
    if (parent === dir) break

    dir = parent
  }

  return false
}

/**
 * Cheap heuristic to tell if a .ts/.js file is a React component.
 * We intentionally keep this fast and slightly loose — a false positive sends
 * a script to the React runner, which will fail gracefully with a Vite error.
 * A false negative sends a component to the script runner, which is worse UX.
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
