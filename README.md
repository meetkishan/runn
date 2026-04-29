# runn

> **run *n*** — where *n* is anything. Endless possibilities.

**Run any JavaScript, TypeScript, React, or HTML file with one command. No config. No setup. Just run.**

```bash
npx getrun App.tsx
npx getrun server.ts
npx getrun index.html
```

Hot reload included. Browser opens automatically. Works with Bun or Node.

---

## What it does

| File | What happens |
|------|-------------|
| `file.ts` / `file.js` | Runs with Bun (or Node) and restarts on every save |
| `App.tsx` / `App.jsx` | Spins up a Vite dev server, opens your browser, live-reloads on save |
| `index.html` | Serves the file statically, reloads the browser on any change |
| `pages/index.tsx` | Detects Next.js and runs `next dev` from the project root |

No `vite.config.ts`. No `webpack.config.js`. No `tsconfig.json` required. No `package.json` in your folder. Just the file.

---

## Install

**Use without installing (recommended for one-off runs):**
```bash
npx getrun <file>
```

**Install globally for daily use:**
```bash
npm install -g getrun
runn <file>
```

**Install with Bun:**
```bash
bun add -g getrun
runn <file>
```

**Install with pnpm / Yarn:**
```bash
pnpm add -g getrun
yarn global add getrun
runn <file>
```

> The package is `getrun`. The command is `runn`. Install once, use `runn` forever.

---

## Examples

### React component — instant preview

```bash
# Write a component, see it in your browser immediately
runn Button.tsx
```

No `index.html`. No `main.tsx`. No `package.json`. Runn scaffolds everything in a temp directory, starts Vite, and opens the browser. Save the file → page updates without a refresh.

```tsx
// Button.tsx
import { useState } from 'react'

export default function Button() {
  const [count, setCount] = useState(0)
  return (
    <button onClick={() => setCount(c => c + 1)}>
      Clicked {count} times
    </button>
  )
}
```

```bash
runn Button.tsx
# → http://localhost:5173  (opens automatically)
```

---

### TypeScript script — watch mode

```bash
runn server.ts        # restarts on save with Bun
runn migrate.ts       # one-shot scripts work too
runn utils/parse.ts
```

Uses `bun --watch` when Bun is installed. Falls back to `tsx watch` (bundled) or `node --watch` on Node 18+. No extra installs needed.

---

### HTML file — dev server with hot reload

```bash
runn index.html
```

Serves the file and everything in its directory (CSS, images, JS). Injects a tiny hot-reload snippet — the browser refreshes automatically whenever you save any file in the folder.

```bash
runn landing/index.html    # works from any path
runn prototype.htm         # .htm too
```

---

### Next.js — just point at any file

```bash
runn pages/index.tsx       # detects next.config.js, runs next dev
runn app/page.tsx          # works with the App Router too
runn components/Nav.tsx    # any file in the project works
```

Runn walks up the directory tree looking for `next.config.js/ts/mjs`. When found, it starts `next dev` from the project root — exactly as if you ran it yourself.

---

## How it detects what to do

1. **`.html` / `.htm`** → static server + hot reload
2. **Next.js project** (any ancestor dir has `next.config.*`) → `next dev`
3. **`.tsx` / `.jsx`** → React + Vite dev server
4. **`.ts` / `.js`** with React imports or JSX → React + Vite dev server
5. **Everything else** → script runner with watch mode

---

## Runtime priority

Runn prefers **Bun** when it's installed — it's faster to start, runs TypeScript natively, and `bun --watch` is rock-solid. If Bun isn't available, it falls back to **Node 18+** using bundled `tsx` for TypeScript files.

```
Bun installed?  →  bun --watch <file>
Node + .ts?     →  tsx watch <file>    (bundled, no install needed)
Node + .js?     →  node --watch <file>
```

---

## Why runn?

Most developer tools make you set up a project before you can run a single file. You want to test an idea, verify a utility function, preview a component, or share a quick demo — and instead you're writing config files.

Runn is the missing `run` command for the JavaScript ecosystem:

- **AI-generated code** — paste the output of an LLM into a file and run it immediately
- **Prototyping** — try a new library or API without scaffolding a project
- **Teaching** — show code working in a browser without a build step
- **CI scripts** — run a `.ts` file directly in CI without a compile step
- **Quick demos** — share a single `.tsx` file that someone can run with `npx getrun`

---

## Using with AI coding assistants

Runn pairs well with AI-generated code. Ask any LLM to write you a React component, a TypeScript utility, or an HTML page, save it to a file, and run it instantly:

```bash
# Ask Claude / ChatGPT / Copilot to write you a component
# Save it as Component.tsx
runn Component.tsx
```

No boilerplate. No "now set up your project" step. The code runs.

---

## Zero dependencies on your end

Everything runn needs is bundled with it:

- **Vite 6** — dev server and HMR for React files
- **React 18** — no need to install React in your folder
- **tsx** — TypeScript support for Node fallback
- **`@vitejs/plugin-react`** — JSX transform

If you're running a React component, you don't even need `react` or `react-dom` in your project. Runn provides them.

If your component imports third-party packages (like MUI, Radix, Zustand), those are resolved from your own `node_modules` if present.

---

## Requirements

- **Node 18+** or **Bun** (any recent version)
- No other requirements for JS/TS/HTML
- For React files: no `react` install needed in your project
- For Next.js: the project must already have Next.js installed

---

## The name

**runn** = **run** + **n** — where *n* is anything.

The extra `n` is intentional. It represents the variable — the file you haven't written yet, the language we haven't added support for, the use case nobody thought of. The vision is a single command that runs whatever you throw at it, no matter what that turns out to be.

The package is published as `getrun` because it reads as an instruction: *get runn, then use runn*. The command you type every day is still `runn`.

`n` is not a fixed list. It grows.

---

## License

MIT
