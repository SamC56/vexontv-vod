<p align="center">
  <img src="docs/banner.png" alt="VexonTV — IPTV player for Tizen TV" width="100%">
</p>

<h1 align="center">VexonTV</h1>

<p align="center">
  <strong>A live TV player for Samsung Tizen TVs.</strong><br>
  M3U playlists, Xtream Codes and Stalker portals, provider EPG and a remote-first
  interface. No accounts, no ads, nothing to sign up for.
</p>

---

## Why another IPTV player

- **Live only.** Movie and series entries are filtered out on load, so the lists
  you browse are channels, not a mixed catalogue nobody asked for.
- **AVPlay, not a web video tag.** Channels are decoded in hardware, which is what
  keeps MPEG-TS and HLS streams smooth at 1080p on a TV.
- **Built for the remote.** Every screen is a D-pad path, categories and channels
  are one column apart, and the player tells you what each key does.
- **One player, many panels.** M3U, Xtream Codes, Stalker and a paste-anything
  mode that works out the format for you.
- **No build step.** Plain ES5, Preact and htm vendored, CSS split by concern. Edit
  a file, reload the TV.
- **No backend.** Nothing phones home. Your playlists stay on your TV.

## What it plays

| Source | What you give it |
| --- | --- |
| **M3U / M3U8** | a URL, a file from USB, or the playlist text pasted in |
| **Xtream Codes** | panel address, username and password |
| **Stalker portal** | portal address and MAC |
| **Detect** | paste whatever your provider sent you; the format is worked out |

The guide (what is on now, what comes next, and a progress bar) comes from your
own panel through `get_short_epg`, cached for ten minutes.

## Screenshots

| Live TV | Player |
| --- | --- |
| ![Browsing channels with the inline preview](docs/screens/browser.png) | ![Full screen playback](docs/screens/player.png) |

| Sources | Channel list |
| --- | --- |
| ![Sources](docs/screens/sources.png) | ![Channel list over the stream](docs/screens/channel-list.png) |

## The remote

| Key | What it does |
| --- | --- |
| `CH up` / `CH down` | change channel |
| `Left` | unfold the channel list |
| `OK` | pick a channel, press the focused button |
| `Down` | the player menu (favorites) |
| `Back` | close the list, leave the player |
| `Red` | save or remove a favorite |
| numbers | jump to that channel |

## Install on the TV

1. Put the TV in **developer mode**: `Apps` → type `12345` → on, and set the IP of
   the PC you build from.
2. Build the package and install it:

```bash
python3 tools/build-wgt.py                 # -> dist/VexonTV.wgt
```

Then either drag `dist/VexonTV.wgt` into **[Apps2Samsung](https://github.com/Apps2Samsung)**
(`winget install --id Apps2Samsung.Apps2Samsung`, pick `Custom WGT File`), or use the
Tizen CLI with the TV connected:

```bash
tizen install -n dist/VexonTV.wgt -t <tv>
tizen run -p ts9k4m2w8p.VexonTV -t <tv>
```

The package is an unsigned `.wgt`; whoever installs it signs it.

## Development

```bash
npm install                            # once: jsdom, for the tests
npm test                               # logic + the app in jsdom + layout in Chrome
python3 tools/make-icon.py logo.png    # -> icon.png + brand.png
python3 tools/build-wgt.py             # -> dist/VexonTV.wgt
```

`npm test` runs three suites: `check.js` loads the real sources with no DOM
(parsing, sources, filters, storage, EPG), `dom.js` boots the whole app in jsdom
and drives it with the remote, and `layout.js` measures a real browser, which is
the only thing that catches a broken grid (it skips itself if Chrome is missing).

A desktop browser is useful for the interface: arrows are the D-pad, `Enter` is
OK and `Escape` is Back. It will **not** play a channel though: Chrome doesn't
decode MPEG-TS or HLS, and AVPlay only exists on the TV. Serve it with
`python3 -m http.server 8000` and it will load the bundled `test/sample.m3u`,
which is also what proves the live-only filter drops `/movie/` and `/series/`.

Tizen Studio's **emulator** is a full Tizen, so there the player, the guide and
the remote keys all behave like on the TV (it needs VT-x/AMD-V enabled).

### Fast loop, no repackaging

In Chrome: DevTools → **Sources → Overrides → Enable local overrides**, pointing
at this folder. Edit `js/app.js` or any `css/*.css` inside DevTools, hit F5, and
see it without touching disk or the package.

## Layout

```
index.html          the app shell and the boot splash
config.xml          Tizen package: id, version, privileges, profile
css/tokens.css      design tokens: colour, type, motion, the hole rect
css/base.css        reset, background, rail, typography
css/lists.css       rows, thumbnails, the three column browser, preview
css/forms.css       inputs, search, type picker, buttons
css/player.css      player overlay, guide, channel list, error card
css/overlays.css    modal, toast, loader, the preview hole
css/media.css       reduced motion, reduced transparency, more contrast
js/store.js         state, sources, TV categories, EPG, playback, favorites
js/api.js           M3U, Xtream, Stalker parsers and the EPG call
js/player.js        AVPlay (with a video fallback), rect handling, errors
js/tv.js            the focus engine: zones, rows, keys, the TV's IME
js/app.js           focus zones, remote keys, boot
js/ui.js            root and mounting
js/ui/kit.js        icons, rows, lists, search, bar
js/ui/screens/*.js  one file per screen
tools/              brand generator, .wgt packager
test/               the three suites and a sample playlist
```

There is one convention worth knowing: `htm` is not HTML5, so empty elements
(`input`, `br`, `img`) are always self closed or the parser swallows their
container. A check watches for it.

## Notes

- **Live only, by design.** VOD and series are not in scope.
- **The boot splash is inline** in `index.html`, with its own styles, because it is
  the first frame: waiting for a stylesheet would show black instead. The app
  removes it as soon as it paints, and if the app ever failed to start, the splash
  stays, which says more than a black screen.
- What is *not* covered is the TV launcher's own loader, which happens before the
  app exists. Samsung documents a video splash for that, but it needs a small
  H.264 MP4, so it is left ready in `config.xml` to drop in.
- Tested on a Samsung Tizen 8 TV, with hardware decoding through AVPlay.

## Built with

[Preact](https://preactjs.com) and [htm](https://github.com/developit/htm),
vendored in `vendor/` (MIT, their licences are kept there). No other runtime
dependency.
