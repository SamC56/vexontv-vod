// Screenshots for the README: it boots the real app in jsdom, parks it on a
// given screen and dumps that markup inside the real stylesheet, so a 1920x1080
// capture can be taken with the headless browser.
//
// Usage: pnpm shots [screen ...]   (no screen means all of them)
const fs = require("fs")
const path = require("path")
const { execFileSync } = require("child_process")
const { JSDOM, VirtualConsole } = require("jsdom")
const chrome = require("./chrome.js")

const root = path.join(__dirname, "..")
const out = path.join(root, "dist/shots")
// Public international channels for the design captures: the app is never shown
// with anyone's operator line-up. The first one is what plays in the player
// captures, which is why it carries the name of the still used as the signal.
const DEMO = [
    {
        short: "NATGEO",
        name: "National Geographic",
        group: "Europe",
        program: "Lost Treasures of Egypt",
        next: "Drain the Oceans",
    },
    {
        short: "FR24",
        name: "France 24 English",
        group: "Europe",
        program: "News",
        next: "The Debate",
    },
    {
        short: "EURONEWS",
        name: "Euronews English",
        group: "Europe",
        program: "Europe Today",
        next: "Business",
    },
    { short: "RAI", name: "RAI News 24", group: "Europe", program: "TG24", next: "Rassegna" },
    {
        short: "AJ",
        name: "Al Jazeera English",
        group: "Middle East",
        program: "Newshour",
        next: "Witness",
    },
    {
        short: "TRT",
        name: "TRT World",
        group: "Middle East",
        program: "News Hour",
        next: "The Newsmakers",
    },
    {
        short: "NHK",
        name: "NHK World-Japan",
        group: "Asia",
        program: "Newsroom Tokyo",
        next: "Direct Talk",
    },
    { short: "CNA", name: "CNA", group: "Asia", program: "Asia Tonight", next: "Money Mind" },
    {
        short: "ARIRANG",
        name: "Arirang TV",
        group: "Asia",
        program: "Arirang News",
        next: "K-Culture",
    },
    {
        short: "ABC",
        name: "ABC News",
        group: "Oceania",
        program: "News Breakfast",
        next: "The World",
    },
    {
        short: "CBC",
        name: "CBC News",
        group: "Americas",
        program: "The National",
        next: "Marketplace",
    },
    {
        short: "BLOOMBERG",
        name: "Bloomberg TV",
        group: "Americas",
        program: "Markets",
        next: "Tech",
    },
    { short: "NASA", name: "NASA TV", group: "Science", program: "ISS Live", next: "Launch Pad" },
]

function demoM3u() {
    let text = "#EXTM3U\n"
    DEMO.forEach((channel, index) => {
        text += `#EXTINF:-1 tvg-id="${channel.short.toLowerCase()}" tvg-logo="" group-title="${
            channel.group
        }",${channel.name}\n`
        // Shaped like a panel url (live/user/pass/id.ts): that is what makes the app
        // ask for the guide, and what lets the stub answer per channel.
        text += `http://stream.example/live/vexon/vexon/${index + 1}.ts\n`
    })
    return text
}

// The TV plays on a separate video plane, which a WebView capture cannot see:
// for the images a real broadcast still is put there instead. None of this is in
// the app, it belongs to this tool.
// inset: the TV plane sits 1px inside the stage so it does not cover the card
// border, which is where the focus lands; full screen has no border, so it is flush.
function feed(inset) {
    // No z-index: document order puts it under the app layer, which is how the TV
    // video plane goes (that one is not even inside the WebView).
    return (
        `<div class="demo-feed" style="position:absolute;inset:${inset || 0}px;` +
        `background:#05070a url(file://${root}/mocPlayer.png) center/cover no-repeat"></div>`
    )
}

const sampleM3u = demoM3u()

// One process per screen: jsdom is cheap, a fresh window each time beats threading a
// reset through the whole flow, and a screen that crashes takes only itself out.
const SCREENS = [
    "home",
    "homeedit",
    "tvsrc",
    "types",
    "form",
    "modal",
    "tv",
    "tvcat",
    "cats",
    "browse",
    "browsepreview",
    "browsepreviewing",
    "browsepreviewfocus",
    "zappanel",
    "player",
    "playerbanner",
    "playermenu",
    "playerror",
    "cargando",
    "cargandodos",
    "cargandolargo",
]
const requested = process.argv.slice(2)
if (requested.length !== 1) {
    for (const name of requested.length ? requested : SCREENS) {
        execFileSync(process.execPath, [__filename, name], { stdio: "inherit" })
    }
    process.exit(0)
}
const screen = requested[0]

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const b64 = (value) => Buffer.from(value, "utf8").toString("base64")

const virtualConsole = new VirtualConsole()
virtualConsole.on("jsdomError", (e) => console.error("jsdomError:", String(e.detail || e.message)))

const html = fs
    .readFileSync(path.join(root, "index.html"), "utf8")
    .replace(/<script[^>]*><\/script>/g, "")
const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost:8000/",
    pretendToBeVisual: true,
    virtualConsole,
})
const window = dom.window
const document = window.document

window.Element.prototype.scrollIntoView = function () {}
window.HTMLMediaElement.prototype.load = function () {}
window.HTMLMediaElement.prototype.play = function () {
    return Promise.resolve()
}
window.HTMLMediaElement.prototype.pause = function () {}
Object.defineProperty(window.HTMLElement.prototype, "offsetTop", {
    get: function () {
        return Array.prototype.indexOf.call(document.querySelectorAll("*"), this) * 100
    },
})
let lastUrl = ""
window.fetch = function (url) {
    lastUrl = String(url || "")
    return Promise.resolve({
        ok: true,
        status: 200,
        headers: {
            get: function () {
                return null
            },
        },
        text: function () {
            return Promise.resolve(sampleM3u)
        },
        json: function () {
            function stamp(offsetMin) {
                const d = new Date(Date.now() + offsetMin * 60000)
                const p2 = (n) => String(n).padStart(2, "0")
                return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(
                    d.getHours(),
                )}:${p2(d.getMinutes())}:00`
            }
            // The guide is asked per channel (stream_id=N), so each one shows its own
            // programme instead of the same one everywhere, which stands out a lot.
            const id = Number((lastUrl.match(/stream_id=(\d+)/) || [])[1])
            const channel = DEMO[id - 1] || DEMO[0]
            return Promise.resolve({
                epg_listings: [
                    { title: b64(channel.program), start: b64(stamp(-30)), end: b64(stamp(30)) },
                    { title: b64(channel.next), start: b64(stamp(30)), end: b64(stamp(120)) },
                ],
            })
        },
    })
}

function press(keyCode) {
    const event = new window.KeyboardEvent("keydown", { bubbles: true })
    Object.defineProperty(event, "keyCode", { value: keyCode })
    document.dispatchEvent(event)
}

function focusRow(selector) {
    // Clears the focus class wherever it is, not only under the selector you pass:
    // otherwise the comparison lies when the engine put it on another node.
    const previous = document.querySelectorAll(".focused")
    Array.prototype.forEach.call(previous, (el) => {
        el.classList.remove("focused")
    })
    const element = document.querySelector(selector)
    if (element) element.classList.add("focused")
    return element
}

async function run() {
    // CSS is loaded and painted EXACTLY as index.html does it: otherwise the tool
    // lies (a different cascade order than the TV's).
    const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8")
    indexSource.matchAll(/<script src="([^"]+)"/g).forEach((m) => {
        window.eval(fs.readFileSync(path.join(root, m[1]), "utf8"))
    })
    document.dispatchEvent(new window.Event("DOMContentLoaded"))
    await wait(60)

    // The app ships a public source from the factory: it is removed to start clean
    // (otherwise the focus at boot lands on it and the add flow changes).
    window.App.store.state.lists.slice().forEach((list) => {
        window.App.store.removeList(list.id)
    })
    window.App.store.goHome()
    await wait(80)

    // A real list, added the same way a user adds one.
    if (screen !== "types" && screen !== "form") {
        press(13)
        await wait(40)
        document.querySelector('#addTypes .typecard[data-type="url"]').click()
        await wait(40)
        const url = document.getElementById("field-url")
        url.value = "http://stream.example/world-tv.m3u"
        url.dispatchEvent(new window.Event("input", { bubbles: true }))
        const named = document.getElementById("field-name")
        named.value = "World TV (public)"
        named.dispatchEvent(new window.Event("input", { bubbles: true }))
        document.getElementById("formSave").click()
        await wait(120)
    }

    if (screen === "home") {
        focusRow("#sourceList .row.source", "#sourceList .row.add")
    }

    if (screen === "homeedit") {
        focusRow("#sourceList .edit", "#sourceList .row.add")
    }

    if (screen === "tvsrc") {
        document.querySelector("#sourceList .row.source").click()
        await wait(250)
        focusRow("#tvCats .tvcat", "#tvSearch")
    }

    if (screen === "types") {
        window.App.store.openAdd()
        await wait(60)
    }

    if (screen === "form") {
        window.App.store.openAdd()
        await wait(40)
        document.querySelector('#addTypes .typecard[data-type="url"]').click()
        await wait(60)
    }

    if (screen === "modal") {
        press(403)
        await wait(120)
        focusRow("#confirmOk")
    }

    if (screen === "tv") {
        document.getElementById("navTv").click()
        await wait(200)
        focusRow("#tvCats .tvcat", "#tvSearch")
    }

    if (screen === "tvcat") {
        document.getElementById("navTv").click()
        await wait(200)
        document.querySelector('#tvCats .tvcat[data-group="Asia"]').click()
        await wait(200)
        focusRow("#tvChannels .channel", "#tvcatSearch")
    }

    if (screen === "cargandodos") {
        // Two sources: here every row DOES need its name.
        async function addSource(name) {
            window.App.store.openAdd()
            await wait(40)
            document.querySelector('#addTypes .typecard[data-type="url"]').click()
            await wait(40)
            const url = document.getElementById("field-url")
            const named = document.getElementById("field-name")
            url.value = "http://stream.example/world-tv.m3u"
            url.dispatchEvent(new window.Event("input", { bubbles: true }))
            named.value = name
            named.dispatchEvent(new window.Event("input", { bubbles: true }))
            document.getElementById("formSave").click()
            await wait(200)
        }
        await addSource("Futbol")
        const st = window.App.store.state
        st.channels = {}
        st.groups = {}
        st.flat = null
        window.fetch = function () {
            return new Promise(() => {})
        }
        document.getElementById("navTv").click()
        await wait(1200)
    }

    if (screen === "cargando" || screen === "cargandolargo") {
        // The real path: the source is already added, what was loaded is emptied and
        // the network is left hanging, like a big list coming in. No state by hand,
        // which is what hid the bug.
        const st = window.App.store.state
        st.channels = {}
        st.groups = {}
        st.flat = null
        window.fetch = function () {
            return new Promise(() => {})
        }
        document.querySelector("#sourceList .row.source").click()
        await wait(1200)
        if (screen === "cargandolargo") {
            // And now the case with a count and a long name, the one that breaks into
            // several lines when the row cannot take it.
            const entry = Object.keys(window.App.store.state.loadProgress)[0]
            window.App.store.state.loadProgress[entry].label = "Downloading"
            window.App.store.state.loadProgress[entry].count = 56360
            window.App.store.state.loadProgress[entry].name = "Bloomberg TV"
            window.App.ui.render()
            await wait(200)
        }
    }

    if (screen === "playerbanner") {
        document.getElementById("navTv").click()
        await wait(250)
        const category = document.querySelector('#tvCats .tvcat[data-group="Europe"]')
        if (!category) throw new Error("sin categorias")
        category.click()
        await wait(250)
        const channel = document.querySelector("#tvChannels .channel")
        if (!channel) throw new Error("sin canales")
        channel.click()
        await wait(300)
        // OK over the preview is what opens full screen
        document.getElementById("tvPreview").click()
        await wait(500)
        // UP shows the banner without focusing the favorites button
        press(38)
        await wait(250)
    }

    if (screen === "browsepreviewfocus" || screen === "browsepreviewing") {
        // Like on the TV: the hole mask works, so the engine sets
        // body.previewing and the backdrop is painted by the hole layer.
        document.getElementById("navTv").click()
        await wait(300)
        document.querySelector('#tvCats .tvcat[data-group="Europe"]').click()
        await wait(400)
        window.App.tv.set("tvChannels", 0, 0)
        await wait(150)
        press(13)
        await wait(400)
        window.App.tv.set("tvPreview", 0, 0)
        await wait(200)
        // 'previewing' means "there is a channel"; 'hole' means "there is a video plane
        // behind" (there never is here: this tool has no AVPlay).
        // Without 'hole': that class clips the card to the geometry, and in jsdom it
        // measures 0x0, so the mask ate the whole card. 'previewing' is enough for a
        // capture (it switches the stage card off and lets the video through).
        document.body.classList.add("previewing")
        await wait(200)
        if (screen === "browsepreviewfocus") {
            // the edge is cut right where the video is: focus on the preview column
            focusRow("#tvPreview")
            await wait(150)
        }
    }

    if (screen === "playermenu") {
        // Playing, with the player menu focused.
        document.getElementById("navTv").click()
        await wait(250)
        document.querySelector('#tvCats .tvcat[data-group="Europe"]').click()
        await wait(250)
        document.querySelector("#tvChannels .channel").click()
        await wait(300)
        // OK over the preview is what opens full screen
        document.getElementById("tvPreview").click()
        await wait(500)
        press(40)
        await wait(120)
        press(40)
        await wait(300)
    }

    if (screen === "player") {
        // Full screen player with the signal on: the image that shows what a real
        // channel looks like.
        document.getElementById("navTv").click()
        await wait(250)
        document.querySelector('#tvCats .tvcat[data-group="Europe"]').click()
        await wait(300)
        document.querySelector("#tvChannels .channel").click()
        await wait(300)
        document.getElementById("tvPreview").click()
        await wait(600)
    }

    if (screen === "browse" || screen === "browsepreview") {
        document.getElementById("navTv").click()
        await wait(300)
        const category = document.querySelector('#tvCats .tvcat[data-group="Europe"]')
        if (!category) throw new Error("sin categorias")
        category.click()
        await wait(400)
        if (screen === "browsepreview") {
            // OK on a channel: that is what opens the preview (focus does not)
            window.App.tv.set("tvChannels", 0, 0)
            await wait(150)
            const ev = new window.KeyboardEvent("keydown", { bubbles: true })
            Object.defineProperty(ev, "keyCode", { value: 13 })
            document.dispatchEvent(ev)
            await wait(400)
            window.App.tv.set("tvPreview", 0, 0)
            await wait(200)
        }
    }

    if (screen === "zappanel") {
        // The panel lives in the player: full screen first, then OK.
        document.getElementById("navTv").click()
        await wait(250)
        document.querySelector('#tvCats .tvcat[data-group="Europe"]').click()
        await wait(250)
        document.querySelector("#tvChannels .channel").click()
        await wait(300)
        document.getElementById("tvPreview").click()
        await wait(500)
        press(13)
        await wait(600)
    }

    if (screen === "playerror") {
        document.getElementById("navTv").click()
        await wait(250)
        const category = document.querySelector('#tvCats .tvcat[data-group="Europe"]')
        if (!category) throw new Error("sin categorias: el flujo del reproductor no puede seguir")
        category.click()
        await wait(250)
        const channel = document.querySelector("#tvChannels .channel")
        if (!channel) throw new Error("sin canales en la categoria")
        channel.click()
        await wait(300)
        window.App.store.playFailed("No hay conexión con el canal")
        await wait(200)
    }

    if (screen === "cats") {
        document.getElementById("navTv").click()
        await wait(120)
        document.getElementById("catsBtn").click()
        await wait(120)
        focusRow("#catList .cat", "#catSearch")
        document.querySelectorAll("#catList .cat")[1].classList.remove("on")
        document.querySelectorAll("#catList .cat")[3].classList.remove("on")
    }

    await wait(60)

    // Which channels have to come out playing on each screen.
    const PLAYING = [
        "browsepreviewing",
        "browsepreviewfocus",
        "zappanel",
        "player",
        "playerbanner",
        "playermenu",
    ]
    const FULLSCREEN = ["zappanel", "player", "playerbanner", "playermenu"]
    const shown = window.App.store.state.playing
        ? window.App.store.state.playing.channel
        : window.App.store.state.preview
    const demo = shown
        ? DEMO.filter((channel) => {
              return channel.name === shown.name
          })[0] || DEMO[0]
        : null

    // The "channels added" notice is left there by the flow and paints nothing in
    // a design image.
    document.querySelectorAll(".toast").forEach((element) => {
        element.remove()
    })
    let appHtml = document
        .getElementById("app")
        .innerHTML.replace(/src="brand.png"/, `src="file://${root}/brand.png"`)
    const layerHtml = ""
    if (demo && PLAYING.indexOf(screen) !== -1) {
        if (FULLSCREEN.indexOf(screen) !== -1) {
            // Full screen, the signal goes inside the player and under the banner: that is
            // what the real <video> does.
            appHtml = appHtml.replace(/(<video id="videoPlayer")/, `${feed()}$1`)
        } else {
            // Inside the stage: the dump keeps no geometry, so a fixed layer would come
            // out invisible (jsdom measures 0x0).
            appHtml = appHtml.replace(/(<div class="preview-stage"[^>]*>)/, `$1${feed(1)}`)
        }
    }

    const css = Array.from(indexSource.matchAll(/<link rel="stylesheet" href="([^"]+)"/g))
        .map((m) => {
            return fs.readFileSync(path.join(root, m[1]), "utf8")
        })
        .join("\n")
    // The app sets the hole measurements on the root (inline): they have to be
    // copied on dump, or the capture lies and the hole comes out 0x0.
    const rootStyle = document.documentElement.getAttribute("style") || ""
    const page =
        `<!doctype html><html lang="es" style="${rootStyle.replace(
            /"/g,
            "&quot;",
        )}"><head><meta charset="utf-8">` +
        `<style>${css}</style>` +
        // A still capture has no movement: it is switched off so nothing comes out half done.
        `<style>*,*::before,*::after{animation:none !important;transition:none !important}</style>` +
        // The card is clipped to let the video plane behind show through, and there is
        // none here: that clip leans on TV measurements jsdom cannot give, so in the
        // capture the card paints whole and the signal is shown inside it.
        `<style>body.previewing .browse-preview,body.previewing .backdrop` +
        `{-webkit-mask:none !important;mask:none !important}` +
        `body.previewing .preview-stage > .demo-feed{opacity:1 !important}</style>` +
        `</head><body class="${document.body.className || ""}"><div id="app">${
            // the tool runs from the repo: the brand resolves to the real path
            appHtml
        }</div>${
            // the signal goes after the shell: same paint height, so it lands on top
            layerHtml
        }</body></html>`

    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(path.join(out, `${screen}.html`), page)
    const browser = chrome()
    if (browser) {
        execFileSync(
            browser,
            [
                "--headless",
                "--disable-gpu",
                "--hide-scrollbars",
                "--window-size=1920,1080",
                "--virtual-time-budget=5000",
                `--screenshot=${path.join(out, `${screen}.png`)}`,
                `file://${path.join(out, `${screen}.html`)}`,
            ],
            { stdio: "ignore" },
        )
    }

    // Golden: the screen DOM normalised (ids and seconds change on every boot
    // and are not part of the behaviour).
    const golden = `${out}-golden`
    fs.mkdirSync(golden, { recursive: true })
    const dom = document
        .getElementById("app")
        .innerHTML.replace(/l[0-9]{6,}/g, "lID")
        .replace(/[0-9]+ s</g, "N s<")
    fs.writeFileSync(path.join(golden, `${screen}.html`), dom)
    console.log(`${browser ? "🖼  " : "   "}${path.join(out, `${screen}.png`)}`)
    window.close()
}

run().catch((error) => {
    console.error(error)
    process.exit(1)
})
