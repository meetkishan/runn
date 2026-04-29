# Contributing to runn

> **runn** = **run** + **n** — where *n* is anything. Endless possibilities.

First off — thank you. Every bug report, idea, and pull request makes runn better for everyone who uses it.

The vision behind runn is a single command that runs whatever you throw at it. The *n* in the name is a variable — not a fixed list of file types, but an open-ended promise. Every contribution that makes runn handle one more thing is a contribution to that vision.

The package is published as `getrun` on npm so users can install it easily. The command they use every day is `runn`. Keep both in mind when updating docs or examples.

This document is a practical guide, not a wall of rules. Read what's relevant to what you want to do and skip the rest.

---

## Table of contents

- [Contributing to runn](#contributing-to-runn)
  - [Table of contents](#table-of-contents)
  - [Ways to contribute](#ways-to-contribute)
  - [Getting started](#getting-started)
  - [Project structure](#project-structure)
  - [Making a change](#making-a-change)
  - [Adding a new runner](#adding-a-new-runner)
  - [Reporting a bug](#reporting-a-bug)
  - [Suggesting a feature](#suggesting-a-feature)
  - [Code style](#code-style)
  - [Commit messages](#commit-messages)
  - [Opening a pull request](#opening-a-pull-request)
  - [License](#license)

---

## Ways to contribute

You don't need to write code to contribute. Here are all the ways that genuinely help:

- **Report a bug** — if runn fails on a file, that's a bug worth reporting
- **Share an edge case** — unusual file structures, monorepos, Windows paths, etc.
- **Improve the docs** — clearer wording, better examples, missing scenarios
- **Answer a discussion** — help someone who posted a question in Issues
- **Write a test case** — a file that runn should handle but doesn't
- **Open a PR** — fix something, add something, improve something

All of these matter equally.

---

## Getting started

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR_USERNAME/runn.git
cd runn

# Install dependencies
npm install

# Link it globally so you can use runn as a command while developing
npm link

# Confirm it works
runn --help
```

> `npm link` registers the local repo as the `getrun` package and exposes the `runn` CLI command globally. After this, `runn` in your terminal points to your local copy — edits take effect immediately, no reinstall needed.

That's it. No build step. No compilation. The source is what runs.

---

## Project structure

```
runn/                         ← repo name
├── bin/
│   └── runn.js               # CLI entry point (shebang → src/index.js)
├── src/
│   ├── index.js              # Parses args, reads file, routes to a runner
│   ├── detect.js             # Figures out what kind of file it is
│   ├── utils.js              # Shared helpers (hasBun, findProjectRoot, etc.)
│   └── runners/
│       ├── script.js         # .js / .ts — runs with Bun or Node --watch
│       ├── react.js          # .tsx / .jsx — scaffolds Vite dev server
│       ├── nextjs.js         # detects next.config.* → next dev
│       └── html.js           # .html / .htm — static server + SSE hot reload
├── package.json              # published as "getrun", bin command is "runn"
├── LICENSE
├── README.md
└── CONTRIBUTING.md           # you are here
```

The flow for every invocation is:

```
bin/runn.js
  → src/index.js          (resolve file path, read content)
  → src/detect.js         (decide: html / react / nextjs / script)
  → src/runners/<type>.js (do the actual work)
```

If you understand that flow, you understand the whole codebase.

---

## Making a change

```bash
# Create a branch named after what you're doing
git checkout -b fix/html-watch-on-windows
git checkout -b feat/vue-support
git checkout -b docs/better-nextjs-example

# Make your changes
# Test manually — create a sample file and run it through runn
runn /path/to/your/test-file.tsx

# Commit and push
git add .
git commit -m "fix: handle Windows paths in html runner"
git push origin fix/html-watch-on-windows
```

Then open a pull request from your fork.

---

## Adding a new runner

Want to add support for a new file type (Vue, Svelte, plain CSS, etc.)? Here's the pattern:

**1. Add detection in `src/detect.js`:**
```js
if (ext === '.vue') return 'vue'
```

**2. Create `src/runners/vue.js`:**
```js
export async function runVue(absPath) {
  // your implementation
}
```

**3. Wire it up in `src/index.js`:**
```js
case 'vue':
  await runVue(absPath)
  break
```

**4. Open a PR with a description of:**
- What file types it handles
- What it does (which tool it uses under the hood)
- A sample file someone can test with

This is exactly how `n` grows.

---

## Reporting a bug

Open an issue and include:

1. **The file you ran** — paste the content or a minimal reproduction
2. **The command you ran** — `runn MyComponent.tsx`, etc.
3. **What you expected** — "should open a browser and show the component"
4. **What happened instead** — paste the full terminal output
5. **Your environment:**
   ```bash
   node --version
   bun --version   # if installed
   npm --version
   uname -a        # or "Windows 11" etc.
   ```

A minimal reproduction (the smallest file that triggers the bug) is worth more than a long description. If you can share it, please do.

---

## Suggesting a feature

Open an issue with the label `idea` or `enhancement`. Describe:

- **What you want to do** — "I want to run a Svelte component with `runn`"
- **Why** — what problem it solves or what workflow it fits into
- **What you'd expect to happen** — the ideal behaviour

You don't need to have a solution in mind. A well-described problem is already a valuable contribution.

For large features (new runtimes, breaking changes to detection logic), open a discussion issue first before writing code. It saves everyone time if we align on the approach before implementation.

---

## Code style

- **ESM throughout** — `import`/`export`, no `require()`
- **No transpilation** — the code runs directly in Node 18+ and Bun. Keep it that way.
- **No unnecessary abstraction** — if something is used once, inline it. Three similar lines is better than a premature helper.
- **No comments explaining what the code does** — name things clearly instead. Comments are for *why*, not *what*.
- **Error messages should be actionable** — tell the user what to do, not just what went wrong.

  Bad:  `runn: ENOENT`
  Good: `runn: file not found: App.tsx`

- **No `console.log` left in** — use it while developing, remove it before committing.
- **Docs and examples always use `getrun` for install, `runn` for usage** — keep that distinction consistent everywhere.

Formatting is not enforced by a linter right now. Just match the style of the file you're editing.

---

## Commit messages

Use the conventional commits format — it makes the history readable and helps with changelogs:

```
<type>: <short description in present tense>

type:
  fix      — bug fix
  feat     — new feature or behaviour
  docs     — documentation only
  refactor — code change with no behaviour change
  chore    — dependency updates, tooling, config
```

Examples:
```
fix: handle spaces in file paths on Windows
feat: detect Svelte components and start vite-plugin-svelte
docs: add monorepo example to README
refactor: extract port-finding logic into utils
chore: update vite to 6.1.0
```

One line is enough for most changes. Add a body if the *why* needs explaining.

---

## Opening a pull request

- **One thing per PR.** A focused PR is reviewed faster and merged faster.
- **Describe what changed and why** — not a list of files touched, but the reasoning.
- **Test your change manually** before opening. Create a sample file and run it through runn.
- **Keep the diff small** — avoid unrelated formatting changes, file moves, or refactors in the same PR.

PR title format: same as commit messages — `fix: ...`, `feat: ...`, etc.

If your PR is a work in progress and not ready for review, open it as a **Draft**.

---

## License

By contributing to runn, you agree that your contributions will be licensed under the [MIT License](./LICENSE). You keep the copyright to your own work — the MIT license just ensures it stays open and usable by everyone.

There is no CLA to sign. No legal paperwork. Just the MIT license that already covers the project.

---

If you have any questions that aren't covered here, open an issue and ask. We'll answer and then improve this document so the next person doesn't have to ask.

Happy running.