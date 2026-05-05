/**
 * test/detect.test.js — unit tests for the file type detector
 *
 * Uses Node's built-in test runner (node:test) — no extra dependencies needed.
 * Run with:  npm test
 *
 * Note: Nuxt and Next.js detection walk the real filesystem looking for
 * config files. Those cases are covered manually via fixture files or a
 * future integration test suite that sets up a real project structure.
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
    // Even if the file contains framework imports, .html always wins
    assert.equal(
      detectFileType('/project/index.html', 'import React from "react"'),
      'html'
    )
  })
})

// ── Vue (by extension) ────────────────────────────────────────────────────────

describe('.vue files', () => {
  test('detects .vue as vue', () => {
    assert.equal(detectFileType('/project/Button.vue', ''), 'vue')
  })

  test('is case-insensitive for extension', () => {
    assert.equal(detectFileType('/project/App.VUE', ''), 'vue')
  })

  test('does not need content — extension is enough', () => {
    assert.equal(detectFileType('/project/Empty.vue', ''), 'vue')
  })

  test('ignores React content inside a .vue file — extension wins', () => {
    // A .vue file that also imports react (unusual but possible) stays vue
    assert.equal(
      detectFileType('/project/Hybrid.vue', "import React from 'react'"),
      'vue'
    )
  })
})

// ── Vue (by content heuristic) ────────────────────────────────────────────────

describe('.ts / .js files with Vue content', () => {
  test('detects ESM import from vue', () => {
    assert.equal(
      detectFileType('/project/composable.ts', "import { ref } from 'vue'"),
      'vue'
    )
  })

  test('detects named import from vue', () => {
    assert.equal(
      detectFileType('/project/store.js', "import { reactive, computed } from 'vue'"),
      'vue'
    )
  })

  test('detects CJS require("vue")', () => {
    assert.equal(
      detectFileType('/project/plugin.js', "const { createApp } = require('vue')"),
      'vue'
    )
  })

  test('detects defineComponent call', () => {
    assert.equal(
      detectFileType('/project/Widget.ts', 'export default defineComponent({ setup() {} })'),
      'vue'
    )
  })

  test('detects createApp call', () => {
    assert.equal(
      detectFileType('/project/main.js', "import { createApp } from 'vue'\ncreateApp(App).mount('#app')"),
      'vue'
    )
  })

  test('Vue check runs before React — from vue wins over JSX heuristic', () => {
    // A file with both Vue and React-like content should be treated as Vue
    const mixed = "import { ref } from 'vue'\nconst el = <MyComponent />"
    assert.equal(detectFileType('/project/mixed.ts', mixed), 'vue')
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
    // <div>, <span>, etc. appear in template strings too — not safe to flag
    assert.equal(
      detectFileType('/project/template.js', 'const html = `<div>hello</div>`'),
      'script'
    )
  })
})

// ── Script ────────────────────────────────────────────────────────────────────

describe('plain script files', () => {
  test('detects .ts with no framework content as script', () => {
    assert.equal(
      detectFileType('/project/utils.ts', 'export function add(a, b) { return a + b }'),
      'script'
    )
  })

  test('detects .js with no framework content as script', () => {
    assert.equal(
      detectFileType('/project/server.js', "import express from 'express'"),
      'script'
    )
  })

  test('detects .mjs as script', () => {
    assert.equal(detectFileType('/project/helper.mjs', ''), 'script')
  })

  test('detects .mts as script when no framework content', () => {
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
    assert.equal(detectFileType('/a/b/c/d/e/f/Component.tsx', ''), 'react')
  })

  test('handles deeply nested .vue paths', () => {
    assert.equal(detectFileType('/a/b/c/d/e/f/Button.vue', ''), 'vue')
  })

  test('handles no extension', () => {
    assert.equal(detectFileType('/project/Makefile', ''), 'script')
  })

  test('content defaults to empty string when omitted', () => {
    assert.doesNotThrow(() => detectFileType('/project/App.tsx'))
    assert.doesNotThrow(() => detectFileType('/project/Button.vue'))
  })
})
