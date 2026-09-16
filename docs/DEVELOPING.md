# Developing VexonTV

Notes for whoever works on the app. If you only want to watch TV, the
[README](../README.md) is all you need.

## Build and test

```bash
pnpm install                           # once: jsdom + prettier + eslint
pnpm test                              # style, lint, logic, the app in jsdom, layout in Chrome
pnpm format                            # prettier: rewrite whatever it complains about
pnpm lint                              # eslint: the ES6 rules prettier does not know about
pnpm shots                             # -> dist/shots/*.png, the captures in the README
python3 tools/make-icon.py logo.png    # -> icon.png + brand.png (the logo is not versioned)
python3 tools/build-wgt.py             # -> dist/VexonTV.wgt
```

pnpm is the only package manager here. `tools/only-pnpm.mjs` runs on `preinstall` and aborts
`npm`/`yarn` with a message, because they would write a second lockfile next to
`pnpm-lock.yaml`. They still drop a `package-lock.json` on their way out: it is in
`.gitignore`, and it is not a problem. `package.json` pins the pnpm version in
`packageManager`.

`check.js` loads the real sources with no DOM (parsing, sources, filters, storage, EPG),
`dom.js` boots the whole app in jsdom and drives it with the remote, and `layout.js`
measures a real browser — the only way to catch a broken grid; it skips itself if Chrome is
missing. No build step for the app itself: the file you edit is the file that ships.

`tools/shots.js` is what produced `docs/screens/`. A capture of the WebView cannot see the
video plane the TV plays on, so the tool puts a real broadcast still (`mocPlayer.png`, a
NatGeo frame) where the plane would be and drives the app to each screen first with the same
remote the viewer uses. It needs no browser of its own: it borrows the one `layout.js` finds
(`tools/chrome.js`) and writes the png, the html behind it and a normalised DOM golden into
`dist/shots`, which is ignored by git. `pnpm shots tv` does one screen, `pnpm shots` all of
them. None of it ships: the app has no idea this exists.

## Installing by hand

```bash
python3 tools/build-wgt.py
tizen install -n dist/VexonTV.wgt -t <tv>       # or drop it into Apps2Samsung
tizen run -p ts9k4m2w8p.VexonTV -t <tv>
```

The package is an unsigned `.wgt`; whoever installs it signs it.

## Testing without the TV

A desktop browser is useful for the interface: arrows are the D-pad, `Enter` is OK and
`Escape` is Back. It will **not** play a channel: Chrome doesn't decode MPEG-TS or HLS, and
AVPlay only exists on the TV. Serve it with `python3 -m http.server 8000`: it loads the
bundled `test/sample.m3u`, which is also what proves the live-only filter drops `/movie/`
and `/series/`.

Tizen Studio's emulator is a full Tizen, so there the player, the guide and the remote keys
all behave like on the TV (it needs VT-x/AMD-V enabled).

For a fast loop: in Chrome, DevTools → **Sources → Overrides → Enable local overrides**,
pointing at this folder. Edit `js/app.js` or any `css/*.css` inside DevTools, hit F5, and
see it without touching disk or repackaging.

## How it is put together

## Style

Prettier is the only opinion on looks, and it is not up for debate: four spaces, double
quotes, **no semicolons**, 100 columns. ESLint covers what prettier cannot see — `no-var`,
`prefer-const`, `prefer-template`, `prefer-arrow-callback`, `object-shorthand`. `pnpm test`
runs both, so a PR in its own style fails before anything else does. `pnpm format` and
`pnpm lint` fix most of it. `vendor/`, the generated `dist/` and the markdown are left
alone.

Two `var`s survive on purpose: `var App = App || {}` at the top of every file, which with no
modules is what shares the namespace (`test/check.js` hands each file its `App` as a
parameter), and the snippet `layout.js` injects into Chrome, which is a string no linter
looks inside.

Everything is plain ES2022 with Preact and htm vendored, so there is no transpiler in the
way and no build step for the app. Tizen 8 is a 2022 engine; nothing here needs older.
Channels are decoded through AVPlay, Samsung's native player, which is what handles
MPEG-TS and HLS at 1080p and above in hardware.

```
index.html          app shell and boot splash
config.xml          Tizen package: id, version, privileges, profile
css/                tokens, base, lists, forms, player, overlays, media
js/store.js         state, sources, TV categories, EPG, playback, favorites
js/api.js           M3U, Xtream, Stalker parsers and the EPG call
js/player.js        AVPlay (with a video fallback), rect handling, errors
js/tv.js            the focus engine: zones, rows, keys, the TV's IME
js/app.js           focus zones, remote keys, boot
js/ui.js            root and mounting
js/ui/kit.js        icons, rows, lists, search, bar
js/ui/screens/      one file per screen
tools/              brand generator, .wgt packager, README captures, pnpm guard
test/               the three suites, the reporter and a sample playlist
docs/               these notes, publishing, the banner and the screenshots
```

`htm` is not HTML5, so empty elements (`input`, `br`, `img`) are always self closed or the
parser swallows their container. A check watches for it.

## Two things you cannot see from the code

- **The boot splash is inline** in `index.html`, with its own styles, because it is the
  first frame: waiting for a stylesheet would show black instead. The app removes it as soon
  as it paints, and if the app failed to start, the splash stays, which says more than a
  black screen.
- **The TV launcher's loader** cannot be covered from inside the app, because it happens
  before the app exists. Samsung's video splash is the way, and it is left ready in
  `config.xml` to drop in (it needs a small H.264 MP4).
