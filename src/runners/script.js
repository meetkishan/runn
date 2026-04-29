/**
 * runners/script.js — plain JS/TS script runner
 *
 * Runs a script file with watch mode so it restarts automatically on save.
 * Runtime priority:
 *
 *   1. Bun   — fastest startup, native TS support, great --watch
 *   2. tsx   — bundled with runn, handles TS on any Node 18+ install
 *   3. Node  — last resort for plain .js; also used for TS via
 *              --experimental-strip-types (Node 22.6+)
 *
 * The runner does not itself watch the file — it delegates that responsibility
 * to the underlying runtime so we don't fight with its file-descriptor usage.
 */

import { spawn } from 'child_process'
import { extname, join } from 'path'
import { existsSync } from 'fs'
import { hasBun, getPackageRoot } from '../utils.js'

/**
 * @param {string} absPath - absolute path to the script file
 */
export async function runScript(absPath) {
  const useBun = hasBun()
  const ext = extname(absPath).toLowerCase()
  const isTypescript = ext === '.ts' || ext === '.mts'

  let cmd, args, label

  if (useBun) {
    // Bun understands TypeScript natively — no transpile step needed
    cmd = 'bun'
    args = ['--watch', absPath]
    label = 'bun --watch'
  } else if (isTypescript) {
    // tsx is bundled inside runn's own node_modules so it's always available
    // even if the user has never touched TypeScript tooling before
    const tsxBin = join(getPackageRoot(), 'node_modules/.bin/tsx')

    if (existsSync(tsxBin)) {
      cmd = tsxBin
      args = ['watch', absPath]  // tsx uses a subcommand, not a flag
      label = 'tsx watch'
    } else {
      // Fallback for environments where the symlink is broken or stripped.
      // --experimental-strip-types was stabilised in Node 22.6 — it removes
      // type annotations before execution without a full transpile.
      cmd = 'node'
      args = ['--watch', '--experimental-strip-types', absPath]
      label = 'node --watch'
    }
  } else {
    // Plain JavaScript — Node's built-in --watch restarts on file changes
    cmd = 'node'
    args = ['--watch', absPath]
    label = 'node --watch'
  }

  console.log(`runn: [${label}] ${absPath}`)
  console.log()

  // stdio: 'inherit' wires the child's stdin/stdout/stderr directly to the
  // terminal so the script's output appears exactly as the user expects
  const proc = spawn(cmd, args, { stdio: 'inherit' })

  proc.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error(`runn: command not found: ${cmd}`)
      console.error(`runn: install bun (https://bun.sh) or use Node 18+`)
    } else {
      console.error(`runn: ${err.message}`)
    }
    process.exit(1)
  })

  // Mirror the child's exit code so runn is transparent in scripts and CI
  proc.on('exit', (code) => {
    if (code !== null) process.exit(code)
  })
}
