/**
 * test/utils.test.js — unit tests for shared utilities
 *
 * Uses Node's built-in test runner (node:test) — no extra dependencies needed.
 * Run with:  npm test
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { getPackageRoot, findProjectRoot, findFreePort } from '../src/utils.js'

const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))

// ── getPackageRoot ────────────────────────────────────────────────────────────

describe('getPackageRoot()', () => {
  test('returns a non-empty string', () => {
    const root = getPackageRoot()
    assert.equal(typeof root, 'string')
    assert.ok(root.length > 0)
  })

  test('points to a directory that contains package.json', () => {
    const root = getPackageRoot()
    assert.ok(
      existsSync(join(root, 'package.json')),
      `Expected package.json in ${root}`
    )
  })

  test('points to a directory that contains node_modules', () => {
    const root = getPackageRoot()
    assert.ok(
      existsSync(join(root, 'node_modules')),
      `Expected node_modules in ${root}`
    )
  })

  test('bundled react is present inside node_modules', () => {
    const root = getPackageRoot()
    assert.ok(
      existsSync(join(root, 'node_modules', 'react', 'index.js')),
      'react/index.js should be bundled'
    )
  })

  test('bundled vite is present inside node_modules', () => {
    const root = getPackageRoot()
    assert.ok(
      existsSync(join(root, 'node_modules', 'vite')),
      'vite should be bundled'
    )
  })
})

// ── findProjectRoot ───────────────────────────────────────────────────────────

describe('findProjectRoot()', () => {
  test('finds package.json in the same directory', () => {
    // src/utils.js is directly inside the runn package, which has package.json
    const utilsPath = join(PACKAGE_ROOT, 'src', 'utils.js')
    const root = findProjectRoot(utilsPath)
    assert.ok(
      existsSync(join(root, 'package.json')),
      `Expected package.json in found root: ${root}`
    )
  })

  test('finds package.json when starting from a nested file', () => {
    // test/utils.test.js is one level deep — root should still be found
    const root = findProjectRoot(fileURLToPath(import.meta.url))
    assert.ok(existsSync(join(root, 'package.json')))
  })

  test('the found root is the runn package root', () => {
    const root = findProjectRoot(fileURLToPath(import.meta.url))
    // Read package.json directly — avoids dynamic import and require
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    assert.equal(pkg.name, 'getrun')
  })

  test('returns a directory path, not a file path', () => {
    const root = findProjectRoot(fileURLToPath(import.meta.url))
    // Should be the directory, not the package.json file itself
    assert.ok(!root.endsWith('package.json'))
  })

  test('returns a string for a path with no package.json ancestors', () => {
    // /tmp typically has no package.json — should fall back gracefully
    const result = findProjectRoot('/tmp/some-random-file.ts')
    assert.equal(typeof result, 'string')
    assert.ok(result.length > 0)
  })
})

// ── findFreePort ──────────────────────────────────────────────────────────────

describe('findFreePort()', () => {
  test('returns a number', async () => {
    const port = await findFreePort()
    assert.equal(typeof port, 'number')
  })

  test('returns a port in a valid range', async () => {
    const port = await findFreePort()
    assert.ok(port >= 1024, `Port ${port} should be >= 1024`)
    assert.ok(port <= 65535, `Port ${port} should be <= 65535`)
  })

  test('returns a port that is actually free', async () => {
    const { createServer } = await import('net')
    const port = await findFreePort(3000)

    // Try to bind to that port — should succeed since findFreePort said it's free
    await new Promise((resolve, reject) => {
      const server = createServer()
      server.listen(port, '127.0.0.1', () => {
        server.close(resolve)
      })
      server.on('error', reject)
    })
  })

  test('skips occupied ports', async () => {
    const { createServer } = await import('net')

    // Occupy port 4444
    const blocker = createServer()
    await new Promise((r) => blocker.listen(4444, '127.0.0.1', r))

    try {
      const port = await findFreePort(4444)
      // Should have moved past 4444 to the next free port
      assert.notEqual(port, 4444)
      assert.ok(port > 4444)
    } finally {
      await new Promise((r) => blocker.close(r))
    }
  })

  test('respects the start parameter', async () => {
    const port = await findFreePort(5000)
    assert.ok(port >= 5000)
  })
})
