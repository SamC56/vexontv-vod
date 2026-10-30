# Developing VexonTV VOD

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

## Installing on the TV

`python3 tools/tv.py deploy` builds, signs, installs and launches. It reads `.local/tv.json`
(ignored by git): `{"sdk": "~/tizen-studio", "profile": "<profile>", "target": "<tv-ip>:26101"}`.
`build`, `install` and `launch` run alone too. These are the steps it takes:


`tools/build-wgt.py` makes an unsigned `.wgt`. The TV only takes it signed with a Samsung
certificate profile that includes its DUID, and `tizen package` signs a folder, so the
package is unpacked first:

```bash
python3 tools/build-wgt.py
mkdir -p dist/stage && cd dist/stage && unzip -o ../VexonTV.wgt && cd ../..
export PATH=~/tizen-studio/jdk/Contents/Home/bin:$PATH     # tizen package needs Java
tizen package -t wgt -s <profile> -- "$PWD/dist/stage"
mv "dist/stage/VexonTV VOD.wgt" dist/VexonVOD.wgt          # a space in the name fails silently
sdb connect <tv-ip>:26101
tizen install -n VexonVOD.wgt -s <tv-ip>:26101 -- "$PWD/dist"
tizen run -p vx7vod0fk2.VexonVOD -s <tv-ip>:26101
```

`tizen install` wants the file name and its folder apart (`-n` and `--`); given a path in
`-n` it fails at "transferring the package". When it reports no connected target, the
`sdb` connection dropped: connect again.

### Starting with your own source

A `local-source.json` at the root, ignored by git, is the source a fresh install starts
with. `tools/build-wgt.py` writes it into the package as `js/local-source.js`, with a script
tag before `store.js` in the packaged `index.html`; the tree, the tests and the browser on
`localhost` never see it and keep the free channel list.

```json
{ "type": "xtream", "name": "My panel", "origin": "http://host", "user": "u", "pass": "p" }
```

## Testing without the TV

A desktop browser is useful for the interface: arrows are the D-pad, `Enter` is OK and
`Escape` is Back. It will **not** play a channel: Chrome doesn't decode MPEG-TS or HLS, and
AVPlay only exists on the TV. Most movies fail too (MKV with AC3 audio or HEVC video), and
the audio and subtitle menu stays empty: track lists come from AVPlay. Serve it with `python3 -m http.server 8000`: it loads the
bundled `test/sample.m3u`, which also carries the movies and episodes that prove live TV
keeps only the channels while the catalog keeps the rest.

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
css/                tokens, base, lists, forms, player, overlays, media, vod
js/store.js         state, sources, TV categories, EPG, playback, favorites, navigation
js/api.js           M3U, Xtream, Stalker parsers, movie and series catalogs, the MKV
                    track reader and the EPG call
js/vod.js           movies and series: catalogs, browse view, details, progress,
                    episodes, Up Next, shuffle, tracks and the on-demand player state
js/player.js        AVPlay (with a video fallback), rect handling, seek, tracks,
                    stream quality, errors
js/tv.js            the focus engine: zones, rows, keys, the TV's IME
js/app.js           focus zones, remote keys, boot
js/ui.js            root and mounting
js/ui/kit.js        icons, rows, lists, search, bar, clock, quality badge
js/ui/screens/      one file per screen: start (launch), tv, movies (Movies and Series),
                    title (movie details), show (seasons and episodes), vodplayer,
                    player (live), zap, recents, favs, cats, add, overlays
tools/              brand generator, .wgt packager, TV deploy (tv.py), README captures,
                    pnpm guard
test/               the three suites, the reporter and a sample playlist
docs/               these notes, upstream's publishing notes, the banner, the old
                    screenshots and movies-series-spec.html (the plan this fork followed)
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

## Movies and series

- **Loaded when asked.** Live channels come from `api.load()` as before; movies and series
  come from `api.loadCatalog()` the first time their section opens, kept in memory only.
  A playlist is downloaded once for both kinds; a panel is asked per kind
  (`get_vod_streams`, `get_series`). Details (`get_vod_info`, `get_series_info`) are fetched
  when a title is opened and cached for the session.
- **Sorting entries.** An M3U line is live, a movie or an episode by its address first
  (`/live/`, `/movie/`, `/series/`), then by a video-file extension, then by `S01E02`-style
  titles. Group names alone are not trusted: "Cine" is as often a live channel pack.
  Entries whose name is wrapped in `####` are category headings and are dropped.
- **Progress** is the one thing saved: `ts.progress`, keyed `listId:kind:id`, the newest
  300. Watched means past 92% or under three minutes left. Episodes carry their show's key,
  which is how a show finds its way into Continue watching.
- **Tracks.** AVPlay on these TVs lists subtitle tracks with no language. Before an MKV
  opens, `api.loadMkvTracks()` reads up to 256 KB of it (four seconds at most) and parses
  the Matroska track list; `vod.tracksReady()` lays those names, languages and forced flags
  over AVPlay's list by order. English audio is chosen when there is any; subtitles come
  on under foreign audio, or as a forced English track.
- **Up Next** is decided when an episode starts (the next in order, or a random one in
  shuffle), so the card and the end of the episode agree.
