/**
 * test/detect.test.js — unit tests for the file type detector
 *
 * Uses Node's built-in test runner (node:test) — no extra dependencies needed.
 * Run with:  npm test
 *
 * We can't test Next.js detection here because isNextjsProject() walks the
 * real filesystem looking for next.config.* files. Those cases are covered
 * manually or in a future integration test suite.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { detectFileType } from '../src/detect.js'

// ── HTML ─────────────────────────────────────────────────────────────────────

describe('HTML files', () => {
  test('detects .html extension', () => {
    assert.equal(detectFileType('/project/index.html', ''), 'html')
  })

  test('detects .htm extension', () => {
    assert.equal(detectFileType('/project/page.htm', ''), 'html')
  })

  test('is case-insensitive for extension', () => {
    assert.equal(detectFileType('/project/INDEX.HTML', ''), 'html')
  })

  test('ignores content — extension alone decides', () => {
    // Even if the file contains React-like content, .html wins
    assert.equal(
      detectFileType('/project/index.html', 'import React from "react"'),
      'html'
    )
  })
})

// ── React (by extension) ──────────────────────────────────────────────────────

describe('.tsx / .jsx files', () => {
  test('detects .tsx as react', () => {
    assert.equal(detectFileType('/project/App.tsx', ''), 'react')
  })

  test('detects .jsx as react', () => {
    assert.equal(detectFileType('/project/Button.jsx', ''), 'react')
  })

  test('does not need content — extension is enough', () => {
    assert.equal(detectFileType('/project/Empty.tsx', ''), 'react')
  })

  test('is case-insensitive for extension', () => {
    assert.equal(detectFileType('/project/App.TSX', ''), 'react')
  })
})

// ── React (by content heuristic) ─────────────────────────────────────────────

describe('.ts / .js files with React content', () => {
  test('detects ESM import from react', () => {
    assert.equal(
      detectFileType('/project/Widget.ts', "import { useState } from 'react'"),
      'react'
    )
  })

  test('detects default import from react', () => {
    assert.equal(
      detectFileType('/project/Widget.ts', 'import React from "react"'),
      'react'
    )
  })

  test('detects CJS require("react")', () => {
    assert.equal(
      detectFileType('/project/Widget.js', "const React = require('react')"),
      'react'
    )
  })

  test('detects JSX with capital component tag', () => {
    assert.equal(
      detectFileType('/project/Widget.js', 'return <MyComponent />'),
      'react'
    )
  })

  test('detects JSX with props', () => {
    assert.equal(
      detectFileType('/project/Widget.js', 'return <Button onClick={fn}>'),
      'react'
    )
  })

  test('does NOT flag lowercase JSX tags — not a React signal', () => {
    // <div>, <span>, etc. could be in any template string — not a safe signal
    assert.equal(
      detectFileType('/project/template.js', 'const html = `<div>hello</div>`'),
      'script'
    )
  })
})

// ── Script ────────────────────────────────────────────────────────────────────

describe('plain script files', () => {
  test('detects .ts with no React content as script', () => {
    assert.equal(
      detectFileType('/project/utils.ts', 'export function add(a, b) { return a + b }'),
      'script'
    )
  })

  test('detects .js with no React content as script', () => {
    assert.equal(
      detectFileType('/project/server.js', "import express from 'express'"),
      'script'
    )
  })

  test('detects .mjs as script', () => {
    assert.equal(detectFileType('/project/helper.mjs', ''), 'script')
  })

  test('detects .mts as script when no React content', () => {
    assert.equal(detectFileType('/project/types.mts', 'export type ID = string'), 'script')
  })

  test('unknown extensions fall through to script', () => {
    assert.equal(detectFileType('/project/script.py', ''), 'script')
  })

  test('empty content defaults to script for .ts', () => {
    assert.equal(detectFileType('/project/empty.ts', ''), 'script')
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  test('handles paths with spaces', () => {
    assert.equal(detectFileType('/my project/App.tsx', ''), 'react')
  })

  test('handles deeply nested paths', () => {
    assert.equal(
      detectFileType('/a/b/c/d/e/f/Component.tsx', ''),
      'react'
    )
  })

  test('handles no extension', () => {
    assert.equal(detectFileType('/project/Makefile', ''), 'script')
  })

  test('content defaults to empty string when omitted', () => {
    // Should not throw when called with one argument
    assert.doesNotThrow(() => detectFileType('/project/App.tsx'))
  })
})
