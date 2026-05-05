/**
 * runners/nextjs.js — Next.js project runner
 *
 * When runn detects that the target file lives inside a Next.js project it
 * hands off to `next dev` rather than trying to preview the file in isolation.
 * Next.js manages its own HMR, routing, and compilation — there is nothing
 * runn needs to add.
 *
 * The runner's only job is to:
 *   1. Find the project root (where next.config.* lives)
 *   2. Pick the best available way to run `next dev`
 *   3. Start the process and stay out of its way
 */

import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { hasBun } from '../utils.js'

// Mirrors the list in detect.js — kept here too so this runner can locate
// the root independently without importing the detect module
const NEXT_CONFIGS = [
  'next.config.js',
  'next.config.ts',
  'next.config.mjs',
  'next.config.cjs',
]

/**
 * Walks up the directory tree from `absPath` until it finds the directory
 * containing a Next.js config file. That directory is the project root and
 * is where `next dev` must be launched from.
 *
 * Falls back to the file's own directory if no config is found — this
 * shouldn't happen in practice because detect.js already confirmed one exists.
 *
 * @param {string} absPath
 * @returns {string}
 */
function findNextRoot(absPath) {
  let dir = dirname(absPath)

  while (true) {
    for (const cfg of NEXT_CONFIGS) {
      if (existsSync(join(dir, cfg))) return dir
    }

    const parent = dirname(dir)

    if (parent === dir) return dirname(absPath) // reached filesystem root
    dir = parent
  }
}

/**
 * @param {string} absPath - absolute path to the file inside the Next.js project
 * @param {{ port?: number|null, host?: boolean }} [opts]
 */
export async function runNextjs(absPath, opts = {}) {
  const projectRoot = findNextRoot(absPath)

  console.log(`runn: detected Next.js project at ${projectRoot}`)
  console.log(`runn: starting next dev...`)
  console.log()

  let cmd, args

  if (hasBun()) {
    // `bun run dev` invokes the package.json "dev" script.
    // Pass port/host via environment variables — Next.js reads PORT and
    // HOSTNAME automatically, so flags aren't needed here.
    cmd = 'bun'
    args = ['run', 'dev']
  } else {
    // Prefer the locally installed Next.js binary so the version matches the
    // project's package.json. Fall back to npx only if it isn't installed.
    const nextBin = join(projectRoot, 'node_modules/.bin/next')
    if (existsSync(nextBin)) {
      cmd = nextBin
      args = ['dev']
    } else {
      cmd = 'npx'
      args = ['--yes', 'next', 'dev']
    }
    // next dev accepts --port and --hostname flags directly
    if (opts.port != null) args.push('--port', String(opts.port))
    if (opts.host)         args.push('--hostname', '0.0.0.0')
  }

  // Build the environment, forwarding port/host even for `bun run dev` via
  // the env vars that Next.js checks before its own defaults.
  const env = { ...process.env }
  if (opts.port != null) env.PORT     = String(opts.port)
  if (opts.host)         env.HOSTNAME = '0.0.0.0'

  // cwd must be the project root — Next.js resolves pages, app dir, and config
  // relative to the working directory, not the binary location
  const proc = spawn(cmd, args, {
    stdio: 'inherit',
    cwd: projectRoot,
    env,
  })

  proc.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error(`runn: command not found: ${cmd}`)
    } else {
      console.error(`runn: ${err.message}`)
    }
    process.exit(1)
  })

  proc.on('exit', (code) => {
    if (code !== null) process.exit(code)
  })
}
