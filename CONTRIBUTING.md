# Contributing

Small app, few rules. `pnpm test` is the gate: if it is green and the commit reads right, the
pull request is fine. Nothing here is set in stone — if a rule gets in the way of a good
patch, say so in the pull request instead of working around it.

## Before you start

- Node 20.19+, 22.13+ or 24+.
- **pnpm only.** `tools/only-pnpm.mjs` runs on `preinstall` and aborts `npm` and `yarn`,
  which would write a second lockfile next to `pnpm-lock.yaml`.
- A browser helps: `test/layout.js` measures the real grid in headless Chrome. Without one
  it skips itself rather than lie, so a green run on a machine with no Chrome proves less.
- There is no build step and there must not be one. The file you edit is the file that
  ships to the TV.

## The flow

```bash
# fork, then
git clone git@github.com:<you>/VexonTV.git && cd VexonTV
pnpm install
git switch -c fix/whatever
# change something
pnpm test
git commit
```

Open the pull request against `main`. CI runs the same `pnpm test` on every pull request
(`.github/workflows/test.yml`), but run it before you push: a red check reads better on your
machine, and the layout suite is the one that quietly skips itself when it cannot measure.

## What `pnpm test` is

`prettier --check . && eslint js/ test/ tools/` first, then `test/check.js` (the sources with
no DOM: parsers, sources, filters, storage, EPG), `test/dom.js` (the whole app in jsdom,
driven with the remote as a viewer would) and `test/layout.js` (the 64px grid, the rail and
the preview hole, measured in a real browser). A style nit fails before a real test runs, on
purpose: `pnpm format` and `pnpm lint` fix it for you.

## Commits

Conventional Commits, English, imperative, lowercase, scope when it helps:

```
fix(rail): the source shortcuts answer the remote, drop the recent block
feat(store): a list that is already imported resyncs, it does not download
docs: readme as a package for the TV
```

One change per commit, not one file per commit. The body is for the why, not the what: the
diff already says what.

## Tests

Any change with a branch, a loop, a parser or a money/security path leaves one runnable check
behind, in the suite it belongs to. No frameworks beyond what is there, no fixtures nobody
asked for. If what you fixed cannot be tested here — anything that needs the TV, AVPlay,
real hardware decoding — say how you checked it instead.

## Style

`pnpm format` and `pnpm lint` own the formatting: four spaces, double quotes, no semicolons,
100 columns, `const`/`let`, arrow functions, template literals. Do not hand-format and do not
fight the tools. `eslint.config.mjs` and `.prettierrc` are the whole story, and
[docs/DEVELOPING.md](docs/DEVELOPING.md) explains the two `var`s that survive on purpose.

Comments only where the code cannot say it, and in English. `vendor/` is third-party and is
left alone by both tools.

## Please do not

- **Add a runtime dependency, or load anything from a CDN.** Preact, its hooks and htm are
  vendored in `vendor/` precisely so the app boots with no network and no bundler. New
  dev-only tooling is fine if it earns its place.
- **Paste real playlists, panel URLs, usernames or MAC addresses** in an issue or a pull
  request. This app is about provider portals; redact the credentials before you quote
  anything, and use the fake ones from `test/sample.m3u`.
- **Restructure the focus engine, the 64px grid or the boot sequence** to make one small
  thing easier. Those three carry the whole interface; open an issue first and let's agree on
  the shape.
- Reformat files you did not touch. Prettier is enforced, so a stray reformat hides your
  actual change in the diff.
