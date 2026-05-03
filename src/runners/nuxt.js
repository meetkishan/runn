/**
 * runners/nuxt.js — Nuxt project runner
 *
 * When runn detects that the target file lives inside a Nuxt project it
 * delegates entirely to `nuxt dev`. Nuxt manages its own HMR, file-based
 * routing, SSR, and auto-imports — there is nothing runn needs to add.
 *
 * The runner's only responsibility is to:
 *   1. Find the project root (the directory that contains nuxt.config.*)
 *   2. Pick the best available command to run `nuxt dev`
 *   3. Start the process with the correct cwd and stay out of the way
 *
 * Runtime priority mirrors the Next.js runner:
 *   bun run dev  →  local nuxt binary  →  npx nuxt dev
 */

import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { hasBun } from '../utils.js'

// Mirrors the list in detect.js — kept here so this runner can locate
// the project root independently without importing the detect module
const NUXT_CONFIGS = [
  'nuxt.config.js',
  'nuxt.config.ts',
  'nuxt.config.mjs',
  'nuxt.config.cjs',
]

/**
 * Walks up the directory tree from `absPath` to find the Nuxt project root —
 * the directory containing nuxt.config.*. That directory is where `nuxt dev`
 * must be launched so Nuxt can find its config, pages, and components.
 *
 * Falls back to the file's own directory if no config is found (shouldn't
 * happen in practice since detect.js already confirmed one exists).
 *
 * @param {string} absPath
 * @returns {string}
 */
function findNuxtRoot(absPath) {
  let dir = dirname(absPath)

  while (true) {
    for (const cfg of NUXT_CONFIGS) {
      if (existsSync(join(dir, cfg))) return dir
    }

    const parent = dirname(dir)
    if (parent === dir) return dirname(absPath) // reached filesystem root
    dir = parent
  }
}

/**
 * @param {string} absPath - absolute path to any file inside the Nuxt project
 */
export async function runNuxt(absPath) {
  const projectRoot = findNuxtRoot(absPath)

  console.log(`runn: detected Nuxt project at ${projectRoot}`)
  console.log(`runn: starting nuxt dev...`)
  console.log()

  let cmd, args

  if (hasBun()) {
    // `bun run dev` reads the "dev" script from package.json, which in a
    // standard Nuxt project maps to `nuxt dev`. Respects any custom flags
    // the user may have added (e.g. --port, --host).
    cmd = 'bun'
    args = ['run', 'dev']
  } else {
    // Prefer the project-local Nuxt binary to guarantee version consistency.
    // Fall back to npx only if Nuxt isn't installed yet — this avoids
    // silently downloading a version that mismatches the project's package.json.
    const nuxtBin = join(projectRoot, 'node_modules/.bin/nuxt')
    if (existsSync(nuxtBin)) {
      cmd = nuxtBin
      args = ['dev']
    } else {
      cmd = 'npx'
      args = ['--yes', 'nuxt', 'dev']
    }
  }

  // cwd must be the project root — Nuxt resolves pages/, components/, composables/,
  // and all auto-imports relative to the working directory
  const proc = spawn(cmd, args, {
    stdio: 'inherit',
    cwd: projectRoot,
  })

  proc.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error(`runn: command not found: ${cmd}`)
    } else {
      console.error(`runn: ${err.message}`)
    }
    process.exit(1)
  })

  // Mirror Nuxt's exit code so runn is transparent in scripts and CI
  proc.on('exit', (code) => {
    if (code !== null) process.exit(code)
  })
}
