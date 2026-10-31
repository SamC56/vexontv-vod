const fs = require("fs")
const path = require("path")
const { JSDOM, VirtualConsole } = require("jsdom")

const root = path.join(__dirname, "..")
const sampleM3u = fs.readFileSync(path.join(root, "test/sample.m3u"), "utf8")
const report = require("./report")("dom — the whole app in jsdom, driven with the remote")
const check = report.check

function checkClasses(label, pairs) {
    const missing = pairs
        .filter((pair) => {
            return !document.querySelector(pair[0])
        })
        .map((pair) => {
            return pair[1]
        })
    check(label, missing.length === 0, missing.join(", "))
}

function wait(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

const errors = []
const virtualConsole = new VirtualConsole()
virtualConsole.on("jsdomError", (error) => {
    errors.push(String(error.detail ? error.detail.stack || error.detail.message : error.message))
})
virtualConsole.on("error", function () {
    errors.push(`console.error: ${Array.prototype.join.call(arguments, " ")}`)
})

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

// jsdom reports offsetTop 0 for everything; give each element its own row.
Object.defineProperty(window.HTMLElement.prototype, "offsetTop", {
    get: function () {
        return Array.prototype.indexOf.call(document.querySelectorAll("*"), this) * 100
    },
})

const b64 = (value) => Buffer.from(value, "utf8").toString("base64")
window.fetch = function () {
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
            return Promise.resolve({
                epg_listings: [
                    {
                        title: b64("Programa de prueba"),
                        start: b64("2026-09-16 21:00:00"),
                        end: b64("2026-09-16 22:00:00"),
                    },
                    {
                        title: b64("El siguiente"),
                        start: b64("2026-09-16 22:00:00"),
                        end: b64("2026-09-16 23:30:00"),
                    },
                ],
            })
        },
    })
}
window.addEventListener("error", (event) => {
    errors.push(`window.error: ${(event.error && event.error.stack) || event.message}`)
})

function press(keyCode) {
    const event = new window.KeyboardEvent("keydown", { bubbles: true })
    Object.defineProperty(event, "keyCode", { value: keyCode })
    document.dispatchEvent(event)
}

function focused() {
    return document.querySelector(".focused")
}

function screens() {
    return Array.prototype.map.call(document.querySelectorAll('[id^="screen-"]'), (el) => {
        return el.id
    })
}

function onlyScreen(id) {
    const mounted = screens()
    return mounted.length === 1 && mounted[0] === id
}

function typeInto(selector, value) {
    const input = document.querySelector(selector)
    input.value = value
    input.dispatchEvent(new window.Event("input", { bubbles: true }))
    return input
}

// Back steps down: menus, the mark, the controls, then out. Pressed until it is out.
async function leavePlayer() {
    for (let i = 0; i < 4 && window.App.store.state.screen === "vodplayer"; i++) {
        press(10009)
        await wait(60)
    }
}

// Movies with the remote: the launch tile, the grid, details, play, seek, pause, resume, the end.
async function movies() {
    const vod = window.App.vod
    const store = window.App.store
    window.localStorage.removeItem("ts.progress")
    vod.init()
    store.state.lists = [{ id: "vm", name: "Pelis", kind: "m3u", source: "text", text: sampleM3u }]

    store.goStart()
    await wait(60)
    document.getElementById("startMovies").click()
    await wait(120)
    check("Movies opens from the launch screen", onlyScreen("screen-movies"), screens().join(", "))
    check(
        "the grid shows the playlist's movies and leaves the channels out",
        document.querySelectorAll("#vodGrid .poster").length === 3,
        String(document.querySelectorAll("#vodGrid .poster").length),
    )
    const names = Array.prototype.map.call(
        document.querySelectorAll("#vodCats .vodcat .row-name"),
        (el) => {
            return el.textContent
        },
    )
    check(
        "the categories start with All movies",
        names.join("|") === "All movies|Cine en casa|VOD | Acción|VOD | Drama",
        names.join("|"),
    )
    check(
        "the focus starts on the categories",
        !!focused() && focused().classList.contains("vodcat"),
        focused() ? focused().className : "(nothing)",
    )
    checkClasses("the Movies screen uses the classes the CSS styles", [
        ["#vodSort .seg-btn.on", "sort"],
        [".vod-grid .poster .poster-art", "poster"],
        [".poster .poster-letter", "letter"],
        [".poster .poster-name", "name"],
    ])

    press(40)
    await wait(40)
    press(13)
    await wait(80)
    check(
        "OK on a category fills the grid with it and moves into it",
        document.querySelectorAll("#vodGrid .poster").length === 1 &&
            !!focused() &&
            focused().classList.contains("poster"),
        focused() ? focused().className : "(nothing)",
    )
    press(37)
    await wait(40)
    check(
        "left from the grid goes back to the categories",
        !!focused() && focused().classList.contains("vodcat"),
    )

    vod.setCategory("")
    await wait(60)
    typeInto("#vodSearch", "otra")
    await wait(260)
    check(
        "the search narrows the grid",
        document.querySelectorAll("#vodGrid .poster").length === 1 &&
            document.querySelector("#vodGrid .poster-name").textContent === "Otra película",
    )
    typeInto("#vodSearch", "")
    await wait(260)
    document.getElementById("vodCatsBtn").click()
    await wait(80)
    check(
        "Categories opens the list of movie categories, all ticked",
        onlyScreen("screen-vodcats") &&
            document.querySelectorAll("#vodCatList .cat.on").length === 3,
        `${screens().join(", ")} / ${document.querySelectorAll("#vodCatList .cat.on").length}`,
    )
    document.querySelector('#vodCatList .cat[data-group="Cine en casa"]').click()
    await wait(40)
    press(10009)
    await wait(80)
    check(
        "Back leaves without saving",
        onlyScreen("screen-movies") && document.querySelectorAll("#vodGrid .poster").length === 3,
    )
    document.getElementById("vodCatsBtn").click()
    await wait(80)
    document.querySelector('#vodCatList .cat[data-group="Cine en casa"]').click()
    document.getElementById("vodCatSave").click()
    await wait(80)
    check(
        "a hidden category leaves the grid and the list",
        onlyScreen("screen-movies") &&
            document.querySelectorAll("#vodGrid .poster").length === 2 &&
            !document.querySelector('#vodCats .vodcat[data-cat="Cine en casa"]'),
        `${document.querySelectorAll("#vodGrid .poster").length} posters`,
    )
    document.getElementById("vodCatsBtn").click()
    await wait(80)
    document.getElementById("vodCatAll").click()
    document.getElementById("vodCatSave").click()
    await wait(80)
    check("All brings it back", document.querySelectorAll("#vodGrid .poster").length === 3)
    document.querySelector('#vodSort .seg-btn[data-sort="name"]').click()
    await wait(60)
    check(
        "A–Z sorts by name and is remembered",
        document.querySelector("#vodGrid .poster-name").textContent === "Corto sin ruta" &&
            window.localStorage.getItem("ts.vod.sort.movie") === '"name"',
    )

    let avTime = 0
    let opens = 0
    let audioTrack = 1
    let subtitlesSilent = null
    const selected = []
    let avState = "IDLE"
    let listener = null
    const seeks = []
    window.webapis = {
        avplay: {
            open: function () {
                avTime = 0
                opens++
            },
            setDisplayRect: function () {},
            setDisplayMethod: function () {},
            setListener: function (value) {
                listener = value
            },
            prepareAsync: function (ok) {
                avState = "READY"
                ok()
            },
            play: function () {
                avState = "PLAYING"
            },
            pause: function () {
                avState = "PAUSED"
            },
            getState: function () {
                return avState
            },
            getCurrentTime: function () {
                return avTime
            },
            getDuration: function () {
                return 6000000
            },
            // Spanish first, as the provider's file had it: the app must pick English.
            getTotalTrackInfo: function () {
                return [
                    { index: 0, type: "VIDEO", extra_info: "{}" },
                    { index: 1, type: "AUDIO", extra_info: '{"language":"spa","fourCC":"AC3"}' },
                    { index: 2, type: "AUDIO", extra_info: '{"language":"eng","fourCC":"AAC"}' },
                    { index: 3, type: "TEXT", extra_info: '{"track_lang":"spa"}' },
                    { index: 4, type: "TEXT", extra_info: '{"track_lang":"eng"}' },
                ]
            },
            getCurrentStreamInfo: function () {
                return [
                    {
                        index: 0,
                        type: "VIDEO",
                        extra_info:
                            '{"fourCC":"HEVC","Width":"1920","Height":"1080","Bit_rate":"8200000"}',
                    },
                    { index: audioTrack, type: "AUDIO", extra_info: "{}" },
                ]
            },
            setSelectTrack: function (type, index) {
                selected.push(`${type}:${index}`)
                if (type === "AUDIO") audioTrack = index
            },
            setSilentSubtitle: function (silent) {
                subtitlesSilent = silent
            },
            seekTo: function (ms, ok) {
                seeks.push(ms)
                avTime = ms
                if (ok) ok()
            },
            stop: function () {
                avState = "IDLE"
            },
            close: function () {},
        },
    }

    store.focus("vodGrid", 0, 0)
    store.emit()
    await wait(60)
    const key = focused() ? focused().dataset.key : ""
    press(13)
    await wait(80)
    check("OK on a poster opens its details", onlyScreen("screen-title"), screens().join(", "))
    check(
        "the details show the title and a Play button, no Start over yet",
        document.getElementById("titleName").textContent === "Corto sin ruta" &&
            document.getElementById("titlePlay").textContent.trim() === "Play" &&
            !document.getElementById("titleRestart"),
    )
    check(
        "a playlist movie has no description and says so",
        document.getElementById("titlePlot").textContent.indexOf("no description") !== -1,
        document.getElementById("titlePlot").textContent,
    )
    press(10009)
    await wait(80)
    check(
        "Back returns to the grid on the same poster",
        onlyScreen("screen-movies") && !!focused() && focused().dataset.key === key,
        focused() ? focused().dataset.key : "(nothing)",
    )
    press(13)
    await wait(80)

    press(13)
    await wait(120)
    check("Play opens the movie player", onlyScreen("screen-vodplayer"), screens().join(", "))
    check(
        "the movie player has a seek bar and its legend",
        !!document.getElementById("vodTrack") &&
            document.getElementById("vodKeys").textContent.indexOf("choose where to jump") !== -1,
    )
    await wait(350)
    check(
        "English audio is picked over the Spanish one the file starts with",
        selected.indexOf("AUDIO:2") !== -1 &&
            document.getElementById("vodAudioBtn").textContent.indexOf("English") !== -1,
        selected.join(),
    )
    await wait(1000)
    check(
        "a moment after it starts, the stream's quality shows in a corner",
        (document.getElementById("qualityBadge") || {}).textContent === "1080p · HEVC · 8.2 Mb/s",
        (document.getElementById("qualityBadge") || {}).textContent,
    )
    check(
        "and under English audio the subtitles stay off",
        subtitlesSilent === true &&
            document.getElementById("vodTextBtn").textContent.indexOf("Off") !== -1,
        String(subtitlesSilent),
    )

    press(39)
    press(39)
    press(39)
    await wait(40)
    check(
        "right moves the mark 10 s a press, and the video waits",
        document.getElementById("vodSeekTip").textContent === "0:30" && seeks.length === 0,
        `${(document.getElementById("vodSeekTip") || {}).textContent} / ${seeks.join()}`,
    )
    check(
        "the legend says OK jumps and Back stays",
        document.getElementById("vodKeys").textContent.indexOf("jump there") !== -1,
    )
    await wait(800)
    check("it waits for OK, however long the presses stop", seeks.length === 0, seeks.join())
    press(13)
    await wait(40)
    check(
        "OK jumps to the mark, once",
        seeks.length === 1 && seeks[0] === 30000 && avState === "PLAYING",
        `${seeks.join()} / ${avState}`,
    )
    for (let i = 0; i < 6; i++) press(39)
    press(13)
    await wait(40)
    check("held down, the step grows", seeks.length === 2 && seeks[1] === 110000, seeks.join())
    press(37)
    press(13)
    await wait(40)
    check("left goes back", seeks[2] === 100000, seeks.join())
    press(39)
    await wait(40)
    press(10009)
    await wait(60)
    check(
        "Back drops the mark and stays in the movie",
        onlyScreen("screen-vodplayer") && !vod.ui.seek && seeks.length === 3,
        `${screens().join(", ")} / ${seeks.join()}`,
    )

    press(40)
    await wait(60)
    check(
        "down reaches the audio and subtitle buttons",
        !!focused() && focused().id === "vodAudioBtn",
        focused() ? focused().id : "(nothing)",
    )
    press(40)
    await wait(40)
    press(13)
    await wait(60)
    const options = Array.prototype.map.call(
        document.querySelectorAll("#vodTracks .vod-track-opt .row-name"),
        (el) => {
            return el.textContent
        },
    )
    check(
        "the subtitle list offers Off and each language",
        options.join("|") === "Off|Spanish|English" &&
            !!focused() &&
            focused().classList.contains("selected"),
        options.join("|"),
    )
    press(40)
    press(40)
    await wait(40)
    press(13)
    await wait(60)
    check(
        "choosing English turns those subtitles on",
        selected.indexOf("TEXT:4") !== -1 &&
            subtitlesSilent === false &&
            !document.getElementById("vodTracks") &&
            document.getElementById("vodTextBtn").textContent.indexOf("English") !== -1,
        `${selected.join()} / ${subtitlesSilent}`,
    )
    listener.onsubtitlechange(2000, "<i>Where are we?</i>\nNowhere.")
    await wait(40)
    check(
        "a subtitle is drawn without its markup, a line each",
        document.querySelectorAll("#vodSubtitle .vod-subtitle-line").length === 2 &&
            document.getElementById("vodSubtitle").textContent.indexOf("<i>") === -1,
        (document.getElementById("vodSubtitle") || {}).textContent,
    )
    press(10009)
    await wait(60)
    check(
        "Back closes the buttons before it leaves the movie",
        onlyScreen("screen-vodplayer") && !vod.ui.menu,
    )
    press(40)
    await wait(60)
    check("down opens the buttons again", vod.ui.menu === true)
    check(
        "beside them, the sleep timer",
        document.getElementById("vodSleepBtn").textContent.trim() === "Sleep: Off",
    )
    await wait(5300)
    check(
        "left alone on them, they hide with the controls",
        !vod.ui.menu &&
            !document.getElementById("vodOsd").classList.contains("visible") &&
            onlyScreen("screen-vodplayer"),
    )

    press(13)
    await wait(40)
    check(
        "OK pauses and says so",
        avState === "PAUSED" && !!document.getElementById("vodPaused"),
        avState,
    )
    press(415)
    await wait(40)
    check("the play key resumes", avState === "PLAYING" && !document.getElementById("vodPaused"))
    press(48)
    await wait(40)
    check("numbers do nothing in a movie", !store.state.numBuffer)

    avTime = 1800000
    press(10009)
    await wait(60)
    check(
        "with the controls showing, Back only hides them",
        onlyScreen("screen-vodplayer") &&
            !document.getElementById("vodOsd").classList.contains("visible"),
        screens().join(", "),
    )
    press(10009)
    await wait(80)
    check(
        "and Back again leaves the movie, offering to resume where it was",
        onlyScreen("screen-title") &&
            document.getElementById("titlePlay").textContent.trim() === "Resume from 30:00" &&
            !!document.getElementById("titleRestart") &&
            !!document.getElementById("titleProgress"),
        document.getElementById("titlePlay")
            ? document.getElementById("titlePlay").textContent
            : screens().join(", "),
    )
    press(13)
    await wait(120)
    check(
        "Resume opens it at that point",
        vod.ui.playing.start === 1800 && seeks[seeks.length - 1] === 1800000,
        seeks.join(),
    )
    await leavePlayer()
    // Down here, right on the TV: jsdom gives every element a row of its own.
    press(40)
    await wait(40)
    press(13)
    await wait(120)
    check("Start over opens it from the beginning", vod.ui.playing.start === 0)
    await leavePlayer()

    press(10009)
    await wait(80)
    check(
        "a movie left halfway appears in Continue watching",
        document.querySelector("#vodCats .vodcat .row-name").textContent === "Continue watching",
    )
    store.focus("vodGrid", 0, 0, `#vodGrid .poster[data-key="${key}"]`)
    store.emit()
    await wait(60)
    press(13)
    await wait(80)
    press(13)
    await wait(120)
    const logged = errors.length
    const opened = opens
    listener.onerror({ name: "PLAYER_ERROR_CONNECTION_FAILED" })
    await wait(60)
    check(
        "the first refusal is not shown: one stream per account takes a moment to free",
        !document.getElementById("vodError"),
    )
    await wait(3200)
    check("and it is retried once on its own", opens === opened + 1, `${opens - opened} opens`)
    listener.onerror({ name: "PLAYER_ERROR_CONNECTION_FAILED" })
    await wait(60)
    // The player logs the failure on purpose; it is not one of the session's errors.
    const failure = errors.splice(logged).filter((line) => {
        return line.indexOf("playback error") === -1
    })
    errors.push(...failure)
    check(
        "a failure shows the error card with Retry focused",
        !!document.getElementById("vodError") && !!focused() && focused().id === "vodRetry",
        focused() ? focused().id : "(nothing)",
    )
    press(13)
    await wait(120)
    check("Retry opens it again", !document.getElementById("vodError") && !!vod.ui.playing)
    listener.onstreamcompleted()
    await wait(80)
    check(
        "at the end it is marked watched and the details offer Play again",
        onlyScreen("screen-title") &&
            document.getElementById("titlePlay").textContent.trim() === "Play" &&
            vod.progressOf(vod.ui.title).done === true,
    )
    press(10009)
    await wait(80)
    check(
        "and the poster carries the watched tick",
        !!document.querySelector(`#vodGrid .poster[data-key="${key}"] .poster-seen`),
    )
    window.webapis = undefined
}

// Series with the remote: the launch tile, a show, its seasons, Up Next, the last episode.
async function series() {
    const vod = window.App.vod
    const store = window.App.store
    let avTime = 0
    let avState = "IDLE"
    let listener = null
    const opened = []
    const showSelected = []
    let showCurrentText = null
    window.webapis = {
        avplay: {
            open: function (url) {
                opened.push(url)
                avTime = 0
            },
            setDisplayRect: function () {},
            setDisplayMethod: function () {},
            setListener: function (value) {
                listener = value
            },
            prepareAsync: function (ok) {
                avState = "READY"
                ok()
            },
            play: function () {
                avState = "PLAYING"
            },
            pause: function () {
                avState = "PAUSED"
            },
            getState: function () {
                return avState
            },
            getCurrentTime: function () {
                return avTime
            },
            getDuration: function () {
                return 3000000
            },
            getTotalTrackInfo: function () {
                return [
                    { index: 1, type: "AUDIO", extra_info: '{"language":"eng"}' },
                    { index: 3, type: "TEXT", extra_info: '{"track_lang":"eng"}' },
                    { index: 4, type: "TEXT", extra_info: '{"track_lang":"eng"}' },
                ]
            },
            getCurrentStreamInfo: function () {
                const info = [{ index: 1, type: "AUDIO", extra_info: "{}" }]
                if (showCurrentText !== null)
                    info.push({ index: showCurrentText, type: "TEXT", extra_info: "{}" })
                return info
            },
            setSelectTrack: function (type, index) {
                showSelected.push(`${type}:${index}`)
                if (type === "TEXT") showCurrentText = index
            },
            setSilentSubtitle: function () {},
            seekTo: function (ms, ok) {
                avTime = ms
                if (ok) ok()
            },
            stop: function () {
                avState = "IDLE"
            },
            close: function () {},
        },
    }
    const subtitle = () => {
        return (document.getElementById("vodSub") || {}).textContent || ""
    }
    const lastOpened = () => {
        return opened[opened.length - 1] || ""
    }

    const shuffleAv = window.webapis
    store.goStart()
    await wait(60)
    document.getElementById("startSeries").click()
    await wait(150)
    check("Series opens from the launch screen", onlyScreen("screen-series"), screens().join(", "))
    const shows = Array.prototype.map.call(
        document.querySelectorAll("#vodGrid .poster-name"),
        (el) => {
            return el.textContent
        },
    )
    check(
        "the grid lists the playlist's shows, one poster each",
        shows.length === 3 && shows.indexOf("El Ministerio") !== -1,
        shows.join("|"),
    )
    const poster = Array.prototype.filter.call(
        document.querySelectorAll("#vodGrid .poster"),
        (el) => {
            return el.textContent.indexOf("El Ministerio") !== -1
        },
    )[0]
    poster.click()
    await wait(150)
    check("a show opens its page", onlyScreen("screen-show"), screens().join(", "))
    check(
        "with its seasons, season 1 chosen",
        document.querySelectorAll("#showSeasons .season").length === 2 &&
            document.querySelector("#showSeasons .selected .row-name").textContent === "Season 1",
    )
    check(
        "and its episodes in order, focus on the first to watch",
        document.querySelectorAll("#showEpisodes .episode").length === 2 &&
            !!focused() &&
            focused().dataset.key.indexOf("905") !== -1 &&
            document.getElementById("showPlay").textContent.trim() === "Play S1 · E1",
        focused() ? focused().dataset.key : "(nothing)",
    )

    press(13)
    await wait(150)
    check(
        "OK plays the episode, named by its show",
        onlyScreen("screen-vodplayer") &&
            document.getElementById("vodName").textContent === "El Ministerio" &&
            subtitle() === "S1 · E1",
        `${screens().join(", ")} / ${subtitle()}`,
    )
    await wait(400)
    vod.openTracks("text")
    await wait(40)
    vod.pickTrack("text", 4)
    await wait(40)
    showSelected.length = 0
    avTime = 2900000
    await wait(1200)
    check("100 s from the end, Up Next is not shown yet", !document.getElementById("vodUpNext"))
    avTime = 2985000
    await wait(1200)
    check(
        "near the end, Up Next offers the next episode with Play now focused",
        !!document.getElementById("vodUpNext") &&
            document.getElementById("vodUpNext").textContent.indexOf("S1 · E2") !== -1 &&
            !!focused() &&
            focused().id === "vodUpNextPlay",
        focused() ? focused().id : "(nothing)",
    )
    press(13)
    await wait(150)
    await wait(400)
    check(
        "the next episode keeps the subtitles chosen for the show",
        showSelected.indexOf("TEXT:4") !== -1,
        showSelected.join(),
    )
    showCurrentText = 3
    showSelected.length = 0
    await wait(1700)
    check(
        "and when the TV switches on a subtitle track of its own, the chosen one is put back",
        showSelected.indexOf("TEXT:4") !== -1,
        showSelected.join(),
    )
    check(
        "Play now goes straight to it",
        subtitle() === "S1 · E2" &&
            lastOpened().indexOf("904") !== -1 &&
            !document.getElementById("vodUpNext"),
        `${subtitle()} / ${lastOpened()}`,
    )
    check(
        "and the episode before is marked watched",
        vod.progressOf({ listId: "vm", kind: "episode", id: opened[opened.length - 2] }).done ===
            true,
    )
    avTime = 2985000
    await wait(1200)
    press(10009)
    await wait(60)
    check(
        "Back cancels Up Next and the episode plays on",
        !document.getElementById("vodUpNext") && onlyScreen("screen-vodplayer"),
    )
    await wait(1200)
    check("and it does not come back for this episode", !document.getElementById("vodUpNext"))
    listener.onstreamcompleted()
    await wait(150)
    check(
        "at the end the next season starts on its own",
        subtitle() === "S2 · E1 · Capítulo uno" && lastOpened().indexOf("903") !== -1,
        `${subtitle()} / ${lastOpened()}`,
    )
    listener.onstreamcompleted()
    await wait(150)
    check(
        "after the last episode it returns to the show, in that season, on that episode",
        onlyScreen("screen-show") &&
            document.querySelector("#showSeasons .selected .row-name").textContent === "Season 2" &&
            !!focused() &&
            focused().dataset.key.indexOf("903") !== -1,
        `${screens().join(", ")} / ${focused() ? focused().dataset.key : "(nothing)"}`,
    )
    check(
        "and that episode is ticked",
        !!document.querySelector("#showEpisodes .episode-time.done"),
    )
    press(37)
    await wait(40)
    check(
        "left from the episodes lands on the season showing",
        !!focused() &&
            focused().classList.contains("season") &&
            focused().classList.contains("selected"),
    )
    press(38)
    await wait(40)
    press(13)
    await wait(60)
    check(
        "choosing season 1 shows its episodes, both ticked",
        document.querySelectorAll("#showEpisodes .episode-time.done").length === 2 &&
            document.querySelector("#showSeasons .selected .row-name").textContent === "Season 1",
    )
    check("the episode list says what Red does there", !!document.getElementById("showHint"))
    window.App.tv.set("showEpisodes", 0, 0)
    await wait(40)
    press(403)
    await wait(60)
    check(
        "Red on a watched episode marks it unwatched",
        document.querySelectorAll("#showEpisodes .episode-time.done").length === 1 &&
            (document.querySelector(".toast") || {}).textContent === "Marked as unwatched",
    )
    press(403)
    await wait(60)
    check(
        "and again marks it watched",
        document.querySelectorAll("#showEpisodes .episode-time.done").length === 2,
    )
    press(10009)
    await wait(80)
    check("Back returns to the series grid", onlyScreen("screen-series"), screens().join(", "))
    press(10009)
    await wait(80)
    check("and Back again to the launch screen", onlyScreen("screen-start"), screens().join(", "))

    window.webapis = shuffleAv
    document.getElementById("startSeries").click()
    await wait(150)
    Array.prototype.filter
        .call(document.querySelectorAll("#vodGrid .poster"), (el) => {
            return el.textContent.indexOf("El Ministerio") !== -1
        })[0]
        .click()
    await wait(150)
    check(
        "a show with several episodes offers Play random",
        !!document.getElementById("showRandom"),
    )
    document.getElementById("showRandom").click()
    await wait(150)
    check(
        "Play random plays an episode of the show, in shuffle",
        onlyScreen("screen-vodplayer") &&
            vod.ui.playing.shuffle === true &&
            /^S\d · E\d/.test(subtitle()),
        `${screens().join(", ")} / ${subtitle()}`,
    )
    const shuffled = vod.ui.playing.item
    avTime = 2985000
    await wait(1200)
    check(
        "and Up Next offers another random one, not the same",
        !!document.getElementById("vodUpNext") &&
            document.getElementById("vodUpNextLabel").textContent.indexOf("Random next") !== -1 &&
            vod.ui.upNext.episode.id !== shuffled.id,
        (document.getElementById("vodUpNextLabel") || {}).textContent,
    )
    press(13)
    await wait(150)
    check(
        "which keeps shuffling",
        vod.ui.playing.shuffle === true && vod.ui.playing.item.id !== shuffled.id,
    )
    // Two hours without a key press, by moving the clock rather than waiting.
    const realNow = window.Date.now
    let ahead = 0
    window.Date.now = function () {
        return realNow() + ahead
    }
    function idleTwoHours() {
        ahead += store.STILL_IDLE_MS + 1000
        store.checkStillWatching()
    }
    vod.setPaused(true)
    idleTwoHours()
    await wait(80)
    check("paused for two hours, nobody is asked", !document.getElementById("stillWatching"))
    vod.setPaused(false)
    store.touched()
    idleTwoHours()
    await wait(80)
    check(
        "two hours playing without a key asks whether anyone is still watching",
        !!document.getElementById("stillWatching") &&
            !!focused() &&
            focused().id === "stillKeep" &&
            /60 s/.test(document.getElementById("stillText").textContent),
        focused() ? focused().id : "(nothing)",
    )
    press(13)
    await wait(80)
    check(
        "Keep watching closes it and playback goes on",
        !document.getElementById("stillWatching") && onlyScreen("screen-vodplayer"),
        screens().join(", "),
    )
    idleTwoHours()
    await wait(80)
    press(10009)
    await wait(80)
    check(
        "Back answers it too, without leaving the player",
        !document.getElementById("stillWatching") && onlyScreen("screen-vodplayer"),
        screens().join(", "),
    )
    store.checkStillWatching()
    await wait(80)
    check(
        "and the two hours start again after an answer",
        !document.getElementById("stillWatching"),
    )
    store.sleepNow()
    await wait(100)
    check(
        "when the sleep timer runs out, playback stops and the launch screen shows",
        onlyScreen("screen-start") &&
            !vod.ui.playing &&
            (document.querySelector(".toast") || {}).textContent.indexOf("sleep timer") !== -1,
        screens().join(", "),
    )
    vod.playTitle(shuffled, true)
    await wait(200)
    idleTwoHours()
    await wait(80)
    ahead += 61000
    await wait(1200)
    check(
        "with no answer in a minute, playback stops and the launch screen shows",
        onlyScreen("screen-start") &&
            !vod.ui.playing &&
            !document.getElementById("stillWatching") &&
            (document.querySelector(".toast") || {}).textContent.indexOf("nobody") !== -1,
        `${screens().join(", ")} / ${(document.querySelector(".toast") || {}).textContent}`,
    )
    window.Date.now = realNow
    await leavePlayer()
    press(10009)
    await wait(80)
    press(10009)
    await wait(80)
    window.webapis = undefined

    const film = vod.items("movie")[0]
    vod.saveProgress(film, 600, 6000)
    document.getElementById("startMovies").click()
    await wait(150)
    check(
        "a section opens on Continue watching when there is something in it",
        document.querySelector("#vodCats .vodcat.selected .row-name").textContent ===
            "Continue watching" &&
            document.getElementById("moviesMeta").textContent.indexOf("RED removes one") !== -1,
        (document.querySelector("#vodCats .vodcat.selected .row-name") || {}).textContent,
    )
    store.focus("vodGrid", 0, 0)
    store.emit()
    await wait(60)
    press(403)
    await wait(60)
    check(
        "Red on a poster asks before removing it",
        !!document.getElementById("confirm") &&
            document.getElementById("confirmText").textContent.indexOf(film.name) !== -1,
    )
    document.getElementById("confirmOk").click()
    await wait(80)
    check(
        "and once accepted its progress is gone, and so is the row",
        !vod.progressOf(film) &&
            onlyScreen("screen-movies") &&
            !document.querySelector("#vodCats .vodcat.pinned"),
        screens().join(", "),
    )

    vod.saveProgress(film, 600, 6000)
    vod.openTitle(film)
    await wait(120)
    document.getElementById("titleForget").click()
    await wait(60)
    document.getElementById("confirmOk").click()
    await wait(80)
    check(
        "the details page removes it too, and stays open",
        !vod.progressOf(film) &&
            onlyScreen("screen-title") &&
            !document.getElementById("titleForget") &&
            !!focused() &&
            focused().id === "titlePlay",
        focused() ? focused().id : "(nothing)",
    )

    document.getElementById("titleFav").click()
    await wait(60)
    check(
        "Add to favorites on a film's page saves it",
        vod.isFavorite(film) &&
            document.getElementById("titleFav").textContent.indexOf("Remove") !== -1,
    )
    store.openFavorites("movie")
    await wait(80)
    check(
        "Favorites has a Movies tab with it",
        onlyScreen("screen-favs") &&
            document.querySelector("#favTabs .seg-btn.on").textContent.trim() === "Movies" &&
            document.querySelectorAll("#favGrid .poster").length === 1,
        `${screens().join(", ")} / ${document.querySelectorAll("#favGrid .poster").length}`,
    )
    document.querySelector("#favGrid .poster").click()
    await wait(120)
    check("a favorite opens its page", onlyScreen("screen-title"), screens().join(", "))
    press(10009)
    await wait(80)
    check(
        "and Back returns to Favorites, on it",
        onlyScreen("screen-favs") && !!focused() && focused().classList.contains("poster"),
        `${screens().join(", ")} / ${focused() ? focused().className : "(nothing)"}`,
    )
    press(403)
    await wait(60)
    check(
        "Red on it takes it out of favorites",
        !vod.isFavorite(film) && document.querySelectorAll("#favGrid .poster").length === 0,
    )
    window.webapis = undefined
}

async function run() {
    const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8")
    const scripts = Array.from(indexSource.matchAll(/<script src="([^"]+)"/g)).map((m) => {
        return m[1]
    })
    scripts.forEach((file) => {
        window.eval(fs.readFileSync(path.join(root, file), "utf8"))
    })

    document.dispatchEvent(new window.Event("DOMContentLoaded"))
    await wait(50)

    check("the app renders something", document.getElementById("app").innerHTML.length > 100)
    check("without runtime errors", errors.length === 0, errors.join(" | "))
    check(
        "the splash is removed as soon as the app renders",
        (function () {
            const splash = document.getElementById("splash")
            return !splash || splash.classList.contains("off")
        })(),
    )
    check("it boots on the launch screen", onlyScreen("screen-start"), screens().join(", "))
    check(
        "with Live TV, Movies and Series, and no side menu",
        Array.prototype.map
            .call(document.querySelectorAll("#startTiles .start-tile-label"), (el) => {
                return el.textContent
            })
            .join("|") === "Live TV|Movies|Series" && !document.querySelector(".rail"),
    )
    check(
        "the launch screen carries the clock",
        /^\d\d:\d\d$/.test((document.getElementById("startClock") || {}).textContent || ""),
    )
    check(
        "and an icon on each tile",
        document.querySelectorAll("#startTiles .start-tile-icon svg").length === 3,
    )
    check(
        "the focus starts on Live TV",
        !!focused() && focused().id === "startLive",
        focused() ? focused().id : "(nothing)",
    )
    // The first frame's focus pass may still be pending this soon after boot: no remote is
    // that quick, so the test waits for it before its first key.
    await wait(150)
    // Down here, right on the TV: jsdom gives every element a row of its own.
    press(40)
    await wait(40)
    check("the next tile is Movies", !!focused() && focused().id === "startMovies")
    press(38)
    await wait(40)
    for (let i = 0; i < 3; i++) press(40)
    await wait(40)
    check(
        "below the tiles: Recent, Favorites and Sources",
        !!focused() && focused().id === "startRecents",
        focused() ? focused().id : "(nothing)",
    )
    document.getElementById("startSources").click()
    await wait(80)
    check("home screen mounted", !!document.getElementById("screen-home"))
    check("and it is the only screen mounted", onlyScreen("screen-home"), screens().join(", "))
    check("there is no side menu in a section either", !document.querySelector(".rail"))
    check(
        "on boot the factory public source is there",
        document.querySelectorAll("#sourceList .row.source").length === 1 &&
            document.querySelector("#sourceList .row-name").textContent ===
                "Free channels of the world" &&
            document.querySelector("#sourceList .kind").textContent === "M3U",
        document.querySelector("#sourceList .row-name")
            ? document.querySelector("#sourceList .row-name").textContent
            : "(no row)",
    )
    check(
        "and the focus starts on it",
        !!focused() && focused().classList.contains("source"),
        focused() ? focused().className : "(nothing)",
    )
    check(
        "the type filter has its four options",
        document.querySelectorAll("#typeList .type").length === 4,
    )
    checkClasses("the home uses the classes the CSS styles", [
        [".bar h1", "titular"],
        ["#listCounts.meta", "resumen"],
        ["#typeList .type", "filtro de tipo"],
        ["#sourceList.rows", "sources list"],
        ["#sourceList .row.add", "add row"],
        ["#homeActions .btn", "add button"],
    ])

    press(403)
    await wait(60)
    check(
        "the red key asks before deleting the factory one",
        !!document.querySelector("#confirm .modal-card"),
    )
    document.getElementById("confirmOk").click()
    await wait(80)
    check(
        "and the factory one can be deleted like any other",
        document.querySelectorAll("#sourceList .row.source").length === 0,
    )
    check(
        "the focus returns to the add row",
        !!focused() && focused().classList.contains("add"),
        focused() ? focused().className : "(nothing)",
    )

    press(37)
    check("left leads to the type filter", !!focused() && focused().classList.contains("type"))
    press(37)
    check(
        "left at the edge stays on the filter",
        !!focused() && focused().classList.contains("type"),
    )
    press(39)
    check("right again returns to the sources", !!focused() && focused().classList.contains("row"))

    press(13)
    await wait(30)
    check("OK opens the type selector", !!document.getElementById("addTypes"))
    check(
        "it offers the six formats",
        document.querySelectorAll("#addTypes .typecard").length === 6,
        `${document.querySelectorAll("#addTypes .typecard").length} tarjetas`,
    )
    check("the focus enters the selector", !!focused() && focused().classList.contains("typecard"))
    checkClasses("the type selector uses the classes the CSS styles", [
        ["#addTypes .typecard .type-icon", "icon"],
        ["#addTypes .typecard .type-title", "title"],
        ["#addTypes .typecard .type-hint", "description"],
    ])

    document.querySelector('#addTypes .typecard[data-type="url"]').click()
    await wait(30)
    check("choosing a type opens the form", !!document.getElementById("sourceForm"))
    check(
        "the URL form has its fields",
        !!document.getElementById("field-url") && !!document.getElementById("field-name"),
    )
    check("the focus enters the first field", !!focused() && focused().id === "field-url")
    check("the type can be changed", !!document.getElementById("changeTypeBtn"))

    typeInto("#field-url", "http://localhost:8000/test/sample.m3u")
    document.getElementById("formSave").click()
    await wait(80)
    check("the source is added and it returns home", !!document.getElementById("screen-home"))
    document.querySelector("#sourceList .row.source").click()
    await wait(150)
    check(
        "OK on a source enters the TV of that source",
        window.App.store.state.screen === "tv" && !!window.App.store.state.tvSource,
        `${window.App.store.state.screen} / tvSource=${window.App.store.state.tvSource}`,
    )
    // the rest of the flow carries on in Sources
    window.App.store.goHome()
    await wait(80)

    check(
        "the source row appears",
        document.querySelectorAll("#sourceList .row.source").length === 1,
    )
    check(
        "the row says what type it is",
        document.querySelector("#sourceList .kind").textContent === "M3U",
        document.querySelector("#sourceList .kind").textContent,
    )
    check(
        "the summary counts source and channels",
        document.getElementById("listCounts").textContent.indexOf("1 source") === 0 &&
            document.getElementById("listCounts").textContent.indexOf("9 channels") !== -1,
        document.getElementById("listCounts").textContent,
    )

    document.querySelector("#typeList .type[data-type], #typeList .type")
    const typeRows = document.querySelectorAll("#typeList .type")
    typeRows[2].click()
    await wait(40)
    check(
        "filtering by Xtream leaves the list empty",
        document.querySelectorAll("#sourceList .row.source").length === 0,
    )
    check("and explains it", !!document.querySelector("#sourceList .empty"))
    typeRows[1].click()
    await wait(40)
    check(
        "filtering by M3U shows the source",
        document.querySelectorAll("#sourceList .row.source").length === 1,
    )
    typeRows[0].click()
    await wait(40)

    check(
        "each source has its edit button",
        document.querySelectorAll("#sourceList .edit").length === 1,
    )
    window.App.tv.set("sources", 0, 0)
    press(40)
    await wait(60)
    check(
        "going down in sources does NOT enter the edit button",
        !!focused() && focused().classList.contains("add"),
        focused() ? focused().className : "(nothing)",
    )
    window.App.tv.set("sources", 0, 0)
    press(39)
    await wait(60)
    check(
        "right does enter the edit button of that row",
        !!focused() && focused().classList.contains("edit"),
        focused() ? focused().className : "(nothing)",
    )
    press(37)
    await wait(60)
    check(
        "and left returns to the source",
        !!focused() && focused().classList.contains("source"),
        focused() ? focused().className : "(nothing)",
    )
    check(
        "the source row is a div (a button goes inside)",
        document.querySelector("#sourceList .row.source").tagName === "DIV",
    )
    checkClasses("the edit button uses the classes the CSS styles", [
        ["#sourceList .edit svg", "pencil"],
        ["#sourceList .edit", "button"],
    ])

    document.querySelector("#sourceList .edit").click()
    await wait(80)
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
    const zapChannels = (function () {
        const lists = window.App.store.state.channels
        return lists[Object.keys(lists)[0]] || []
    })()
    const zapChannel = zapChannels.filter((channel) => {
        return channel.group === "Deportes"
    })[0]
    window.App.store.play(zapChannel, zapChannel.listId, zapChannels)
    await wait(120)
    press(13)
    await wait(150)
    check("OK while watching opens the zapping panel", !!document.getElementById("zapPanel"))
    check(
        "with the categories and the channels",
        document.querySelectorAll("#zapCats .zapcat").length > 0 &&
            document.querySelectorAll("#zapChannels .zapch").length > 0,
        `${document.querySelectorAll("#zapCats .zapcat").length} categorías, ${
            document.querySelectorAll("#zapChannels .zapch").length
        } channels`,
    )
    checkClasses("the panel uses the classes the CSS styles", [
        ["#zapCats .zapcat", "category"],
        ["#zapChannels .zapch", "channel"],
        [".zap-bar", "bar"],
        [".zap-info", "info"],
    ])
    check(
        "with a channel marked as the one being watched",
        !!document.querySelector("#zapChannels .zapch.playing"),
    )
    const beforeZap = window.App.store.state.playing.channel.name
    press(40)
    press(40)
    await wait(700)
    check(
        "moving through the channels does NOT change the channel being watched",
        window.App.store.state.playing.channel.name === beforeZap,
        `${beforeZap} -> ${window.App.store.state.playing.channel.name}`,
    )
    const zapFocused = focused()
    check(
        "with the focus on another channel in the panel",
        !!zapFocused &&
            zapFocused.classList.contains("zapch") &&
            zapFocused.dataset.url !== beforeZap,
        zapFocused ? (zapFocused.textContent || "").trim().slice(0, 24) : "(nothing)",
    )
    press(13)
    await wait(200)
    check(
        "and OK opens the focused channel and closes the list",
        !document.getElementById("zapPanel") &&
            window.App.store.state.playing.channel.url === zapFocused.dataset.url,
        window.App.store.state.playing.channel.name,
    )
    window.App.store.exitPlayer()
    await wait(80)

    check(
        "the edit button opens editing without entering the source",
        !!document.getElementById("screen-edit"),
    )
    document.getElementById("formCancel").click()
    await wait(80)
    check("canceling editing returns to sources", !!document.getElementById("screen-home"))

    document.querySelector("#sourceList .row.source").click()
    await wait(150)
    check(
        "tapping a source leads to the TV, not to a list screen",
        !!document.getElementById("screen-tv") && !document.getElementById("screen-list"),
    )
    check("and the TV is the one for that source", window.App.store.state.tvSource !== null)
    check(
        "with its categories",
        document.querySelectorAll("#tvCats .tvcat").length === 4,
        `${document.querySelectorAll("#tvCats .tvcat").length} categorías`,
    )
    check(
        "and the summary says which source",
        document.getElementById("tvMeta").textContent.indexOf("sample") === 0,
        document.getElementById("tvMeta").textContent,
    )

    window.App.store.state.preview = null
    window.App.store.setSearch("tv", "")
    await wait(120)
    check(
        "with no channel chosen, the preview is the empty state",
        !!document.querySelector("#tvPreview #previewEmpty"),
    )
    check(
        "the channel and preview columns are the same screen",
        onlyScreen("screen-tv"),
        screens().join(", "),
    )

    document.querySelector('#tvCats .tvcat[data-group="Deportes"]').click()
    await wait(150)
    check(
        "choosing a category fills the middle column, without changing screen",
        !!document.getElementById("screen-tv") && !document.getElementById("screen-tvcat"),
    )
    check(
        "with its channels",
        document.querySelectorAll("#tvChannels .channel").length === 2,
        `${document.querySelectorAll("#tvChannels .channel").length} channels`,
    )
    check(
        "the channel with a logo sets its image as the thumbnail background",
        (function () {
            const thumbs = document.querySelectorAll("#tvChannels .thumb")
            for (let i = 0; i < thumbs.length; i++) {
                if (/background-image/.test(thumbs[i].getAttribute("style") || "")) return true
            }
            return false
        })(),
        "none with a background",
    )
    check(
        "and the one without a logo leaves the letter",
        !!document.querySelector("#tvChannels .thumb-letter"),
    )
    check(
        "the rows carry a channel number",
        document.querySelector("#tvChannels .num").textContent === "1",
    )
    checkClasses("the three columns use the classes the CSS styles", [
        [".browse .browse-cats", "categories column"],
        [".browse .browse-channels", "channels column"],
        [".browse .browse-preview", "preview column"],
        ["#tvChannels .channel", "channel row"],
        ["#tvChannels .num", "number"],
        ["#tvChannels .thumb", "thumbnail"],
    ])
    check(
        "choosing a category does not open the preview on its own",
        !document.querySelector("#tvPreview .preview-name"),
        document.querySelector("#tvPreview .preview-name")
            ? `opened ${document.querySelector("#tvPreview .preview-name").textContent}`
            : "empty",
    )

    press(40)
    await wait(90)
    check(
        "the focused row requests its program (and it appears below the name)",
        !!focused() && focused().textContent.indexOf("Programa de prueba") !== -1,
        focused() ? focused().textContent.slice(0, 60) : "(nothing)",
    )

    press(50)
    await wait(20)
    check("the typed number is shown", !!document.getElementById("numBuffer"))
    press(13)
    await wait(40)
    check(
        "Enter jumps to the typed row",
        !!focused() &&
            focused().querySelector(".num") &&
            focused().querySelector(".num").textContent === "2",
        focused() ? focused().className : "(nothing)",
    )
    check("on jumping the number is cleared", !document.getElementById("numBuffer"))

    window.App.tv.set("tvChannels", 0, 0)
    await wait(300)
    check("passing over a channel does not open it straight away", !window.App.store.state.preview)
    await wait(700)
    check(
        "resting on a channel previews it without leaving the TV",
        !!document.getElementById("screen-tv") && !document.getElementById("screen-player"),
        screens().join(", "),
    )
    check(
        "the card can read the hole measurements",
        (function () {
            const root = document.documentElement.style.getPropertyValue("--hole-w")
            const layer = document.getElementById("backdrop").style.getPropertyValue("--hole-w")
            return !!root && !layer
        })(),
        `raiz=${document.documentElement.style.getPropertyValue("--hole-w")} capa=${document
            .getElementById("backdrop")
            .style.getPropertyValue("--hole-w")}`,
    )

    check(
        "and the preview is that channel",
        (function () {
            const preview = window.App.store.state.preview
            const focusedChannel = focused()
            return (
                !!preview &&
                !!focusedChannel &&
                focusedChannel.textContent.indexOf(preview.name) !== -1
            )
        })(),
        window.App.store.state.preview ? window.App.store.state.preview.name : "(no preview)",
    )

    press(13)
    await wait(120)
    check(
        "OK on the channel opens it full screen",
        !!document.getElementById("screen-player"),
        screens().join(", "),
    )
    check("and it is the only one mounted", onlyScreen("screen-player"), screens().join(", "))
    check(
        "the player's buttons stay hidden until Down reaches them",
        !document.getElementById("ovActions") &&
            document.getElementById("playerOverlay").classList.contains("visible"),
    )
    await wait(5200)
    check(
        "with no key pressed, the channel bar hides after five seconds",
        !document.getElementById("playerOverlay").classList.contains("visible"),
        document.getElementById("playerOverlay").className,
    )
    check(
        "the player has the surface where AVPlay renders the video",
        (function () {
            const surface = document.getElementById("avPlayer")
            return !!surface && surface.getAttribute("type") === "application/avplayer"
        })(),
    )
    check(
        "while playing, the screen behind is not in the DOM",
        !document.getElementById("screen-tv"),
    )
    check(
        "and the app background stops rendering (otherwise it covers the video plane)",
        document.body.classList.contains("playing"),
    )
    check(
        "and it says which engine plays (with no console on the TV there is no other way)",
        !!document.getElementById("ovEngine") &&
            /AVPlay|HTML5/.test(document.getElementById("ovEngine").textContent),
        document.getElementById("ovEngine")
            ? document.getElementById("ovEngine").textContent
            : "(nothing)",
    )
    check(
        "the now program appears",
        !!document.getElementById("ovProgram") &&
            document.getElementById("ovProgram").textContent.indexOf("Programa de prueba") !== -1,
    )
    check(
        "with its progress bar",
        (function () {
            const fill = document.getElementById("ovProgress")
            return !!fill && /width:\s*\d+%/.test(fill.getAttribute("style") || "")
        })(),
        document.getElementById("ovProgress")
            ? document.getElementById("ovProgress").getAttribute("style")
            : "(no bar)",
    )
    check(
        "and the next program, as in any player",
        !!document.getElementById("ovNext") &&
            document.getElementById("ovNext").textContent.indexOf("El siguiente") !== -1,
        document.getElementById("ovNext")
            ? document.getElementById("ovNext").textContent
            : "(no next)",
    )
    check(
        "on opening a channel there is no selected button",
        !document.querySelector(".focused"),
        focused() ? focused().className : "(nothing)",
    )
    press(40)
    await wait(60)
    check(
        "down selects the favorites button",
        !!focused() && focused().id === "ovFav",
        focused() ? focused().id : "(nothing)",
    )
    press(38)
    await wait(60)
    check("and up releases it", !document.querySelector(".focused"))

    press(40)
    await wait(50)
    press(403)
    await wait(50)
    check("the red key saves the favorite", window.App.store.state.favorites.length === 1)

    window.App.store.playFailed("The channel is not answering")
    await wait(90)
    check(
        "a channel that fails does not leave the screen black",
        !!document.getElementById("playError"),
    )
    check(
        "the card says the reason and the channel",
        document.getElementById("playErrorWhy").textContent === "The channel is not answering" &&
            document.getElementById("playErrorName").textContent.length > 0,
        document.getElementById("playErrorWhy").textContent,
    )
    check(
        "and offers retry and back",
        !!document.getElementById("playRetry") && !!document.getElementById("playClose"),
    )
    checkClasses("the error card uses the classes the CSS styles", [
        [".play-card", "card"],
        [".play-card .play-why", "motivo"],
        [".play-card .play-hint", "ayuda"],
        [".play-card .play-actions", "acciones"],
    ])
    check(
        "the focus goes to the card buttons",
        !!focused() && focused().id === "playRetry",
        focused() ? focused().id : "(nothing)",
    )
    const before = window.App.store.state.playing.channel.name
    press(428)
    await wait(120)
    check(
        "with the error card open, the channel-down button changes channel",
        !document.getElementById("playError") &&
            window.App.store.state.playing.channel.name !== before,
        document.getElementById("playError") ? "the card is still there" : "(no card)",
    )

    window.App.store.playFailed("The channel is not answering")
    await wait(90)
    press(40)
    await wait(60)
    check(
        "and up/down move between Retry and Back",
        !!focused() && focused().id === "playClose",
        focused() ? focused().id : "(nothing)",
    )
    press(38)
    await wait(60)
    check("returning to Retry", !!focused() && focused().id === "playRetry")

    document.getElementById("playRetry").click()
    await wait(90)
    check("retry removes the card and opens again", !document.getElementById("playError"))

    const withMenu = window.App.store.state.playing.channel.name
    press(40)
    await wait(60)
    check(
        "down enters the player menu",
        window.App.store.state.menuFocus && !!focused() && !!focused().closest("#ovActions"),
        focused() ? focused().id : "(nothing)",
    )
    check(
        "the menu does not hide while it is focused",
        document.getElementById("playerOverlay").classList.contains("visible"),
    )
    check(
        "with the favorites button focused",
        !!focused() && focused().id === "ovFav" && !!focused().closest("#ovActions"),
        focused() ? focused().id : "(nothing)",
    )
    const savedBefore = window.App.store.isFavorite(
        window.App.store.state.playing.listId,
        window.App.store.state.playing.channel.url,
    )
    press(13)
    await wait(120)
    check(
        "OK with the menu focused presses the focused button (favorites)",
        window.App.store.isFavorite(
            window.App.store.state.playing.listId,
            window.App.store.state.playing.channel.url,
        ) !== savedBefore,
    )
    check(
        "and it has not changed channel",
        window.App.store.state.playing.channel.name === withMenu,
    )
    window.App.store.state.playing && document.getElementById("ovFav").click()
    await wait(80)
    press(38)
    await wait(60)
    check("up leaves the menu", !window.App.store.state.menuFocus)
    press(39)
    await wait(150)
    check("right opens nothing", !document.getElementById("zapPanel"))
    press(37)
    await wait(150)
    check("and left unfolds the channel list", !!document.getElementById("zapPanel"))
    press(10009)
    await wait(120)
    check(
        "Back closes the list and keeps watching",
        !document.getElementById("zapPanel") && window.App.store.state.screen === "player",
    )
    const beforeChUp = window.App.store.state.playing.channel.name
    press(427)
    await wait(200)
    check(
        "the channel-up button changes channel",
        window.App.store.state.playing.channel.name !== beforeChUp,
        `${beforeChUp} -> ${window.App.store.state.playing.channel.name}`,
    )

    const watching = window.App.store.state.playing.channel
    press(10009)
    await wait(80)
    check(
        "Back lands on the channel that was playing, in its category, not at the top",
        !!focused() &&
            focused().dataset.url === watching.url &&
            window.App.store.state.catName === (watching.group || "Otros"),
        `${focused() ? focused().dataset.url : "(nothing)"} / ${window.App.store.state.catName}`,
    )
    check(
        "back leaves the player, to the TV with the three columns",
        !!document.getElementById("screen-tv") && !!document.querySelector(".browse-preview"),
    )
    check(
        "returning, the channel keeps previewing",
        !!window.App.store.state.preview,
        window.App.store.state.preview ? window.App.store.state.preview.name : "(no preview)",
    )
    const previewedGroup = window.App.store.state.preview.group
    const otherCategory = window.App.store.tvCategories().rows.filter((row) => {
        return row.name !== previewedGroup
    })[0]
    document.querySelector(`#tvCats .tvcat[data-group="${otherCategory.name}"]`).click()
    await wait(120)
    check(
        "changing category releases the preview",
        !window.App.store.state.preview,
        window.App.store.state.preview
            ? `sigue ${window.App.store.state.preview.name}`
            : "(suelto)",
    )
    check(
        "and the card returns to the empty state",
        !!document.querySelector("#tvPreview #previewEmpty"),
    )

    press(10009)
    await wait(80)
    check(
        "and another Back returns to the launch screen",
        window.App.store.state.screen === "start",
        `screen=${window.App.store.state.screen}`,
    )
    window.App.store.goHome()
    await wait(80)

    window.App.store.goStart()
    await wait(60)
    document.getElementById("startLive").click()
    await wait(120)
    check("the TV section exists", !!document.getElementById("screen-tv"))
    check("and the sources one is no longer mounted", onlyScreen("screen-tv"), screens().join(", "))
    check(
        "Live TV opens with the focus on the categories",
        !!focused() && focused().classList.contains("tvcat"),
        focused() ? focused().className : "(nothing)",
    )
    window.App.tv.set("tvActions", 0, 0)
    await wait(60)
    check(
        "the Categories button opens the bar",
        !!focused() && focused().id === "catsBtn",
        focused() ? focused().id : "(nothing)",
    )
    press(39)
    await wait(60)
    check(
        "and from the button it moves to the search box",
        !!focused() && focused().id === "tvSearch",
        focused() ? focused().id : "(nothing)",
    )
    press(37)
    await wait(60)
    check("and with left it returns to the button", !!focused() && focused().id === "catsBtn")
    check(
        "the TV is three columns: categories, channels and preview",
        document.querySelectorAll("#tvCats .tvcat").length === 4 &&
            !!document.querySelector(".browse-channels") &&
            !!document.querySelector(".browse-preview"),
        `${document.querySelectorAll("#tvCats .tvcat").length} categorías`,
    )
    check("there is a categories button", !!document.getElementById("catsBtn"))
    checkClasses("the TV uses the classes the CSS styles", [
        ["#tvCats .tvcat .row-name", "category name"],
        ["#tvCats .tvcat .row-count", "count"],
        ["#screen-tv .search", "buscador"],
    ])

    typeInto("#tvSearch", "espa")
    await wait(400)
    check(
        "searching in TV filters categories",
        document.querySelectorAll("#tvCats .tvcat").length === 1 &&
            document.querySelector("#tvCats .tvcat .row-name").textContent === "España",
        `${document.querySelectorAll("#tvCats .tvcat").length} rows`,
    )
    typeInto("#tvSearch", "")
    await wait(400)

    window.App.tv.set("tvSearch", 0, 0)
    press(13)
    await wait(60)
    check(
        "OK on the search box focuses the field (and the TV raises the keyboard)",
        !!document.activeElement && document.activeElement.id === "tvSearch",
        document.activeElement
            ? `${document.activeElement.tagName}#${document.activeElement.id}`
            : "(nothing)",
    )
    document.getElementById("tvSearch").blur()

    document.querySelector('#tvCats .tvcat[data-group="España"]').click()
    await wait(120)
    check(
        "choosing a category fills the middle column",
        document.querySelectorAll("#tvChannels .channel").length > 0,
        `${document.querySelectorAll("#tvChannels .channel").length} channels`,
    )
    check(
        "and lists the channels of that category",
        document.querySelectorAll("#tvChannels .channel").length === 3,
        `${document.querySelectorAll("#tvChannels .channel").length} channels`,
    )
    await wait(200)
    check(
        "and shows what is on every one of them, without moving onto each",
        Array.prototype.every.call(document.querySelectorAll("#tvChannels .channel"), (row) => {
            const sub = row.querySelector(".row-sub")
            return !!sub && sub.textContent.indexOf("Programa de prueba") === 0
        }),
        Array.prototype.map
            .call(document.querySelectorAll("#tvChannels .channel"), (row) => {
                return (row.querySelector(".row-sub") || {}).textContent || "(none)"
            })
            .join(" | "),
    )
    check(
        "they are not all the channels, only those of the category",
        document.querySelectorAll("#tvChannels .channel").length < 9,
    )

    press(40)
    await wait(80)
    check(
        "the focused category row requests its program",
        !!focused() && focused().textContent.indexOf("Programa de prueba") !== -1,
        focused() ? focused().textContent.slice(0, 60) : "(nothing)",
    )

    press(37)
    await wait(100)
    check(
        "left, from the channels to the categories",
        !!focused() && focused().classList.contains("tvcat"),
        focused() ? focused().className : "(nothing)",
    )

    document.querySelector('#tvCats .tvcat[data-group="España"]').click()
    await wait(150)
    document.getElementById("catsBtn").click()
    await wait(100)
    check("the category management opens", !!document.getElementById("screen-cats"))
    check("the categories go by provider", !!document.querySelector(".cat-source"))
    check(
        "there is one row per category",
        document.querySelectorAll("#catList .cat").length === 4,
        `${document.querySelectorAll("#catList .cat").length} categorías`,
    )
    check("all appear active", document.querySelectorAll("#catList .cat.on").length === 4)
    checkClasses("the categories use the classes the CSS styles", [
        ["#catList .cat .check", "casilla"],
        ["#catActions .btn", "acciones"],
        ["#screen-cats .search", "buscador"],
    ])

    typeInto("#catSearch", "depor")
    await wait(400)
    check(
        "searching in categories filters the list",
        document.querySelectorAll("#catList .cat").length === 1,
        `${document.querySelectorAll("#catList .cat").length} rows`,
    )
    typeInto("#catSearch", "")
    await wait(400)
    check("and on emptying all return", document.querySelectorAll("#catList .cat").length === 4)

    window.App.tv.set("catSearch", 0, 0)
    press(13)
    await wait(60)
    check(
        "OK on the category search box focuses the field",
        !!document.activeElement && document.activeElement.id === "catSearch",
        document.activeElement
            ? `${document.activeElement.tagName}#${document.activeElement.id}`
            : "(nothing)",
    )
    document.getElementById("catSearch").blur()

    press(40)
    await wait(40)
    check("the focus enters the categories", !!focused() && focused().classList.contains("cat"))
    press(13)
    await wait(40)
    check(
        "a category can be deactivated",
        document.querySelectorAll("#catList .cat.on").length === 3,
    )
    document.getElementById("catNone").click()
    await wait(40)
    check('"None" disables all', document.querySelectorAll("#catList .cat.on").length === 0)
    document.getElementById("catAll").click()
    await wait(40)
    check('"All" reactivates them', document.querySelectorAll("#catList .cat.on").length === 4)
    press(13)
    await wait(40)
    document.getElementById("catSave").click()
    await wait(120)
    check("on saving it returns to the TV", !!document.getElementById("screen-tv"))
    check(
        "the muted category is no longer offered",
        document.querySelectorAll("#tvCats .tvcat").length === 3,
        `${document.querySelectorAll("#tvCats .tvcat").length} categorías`,
    )

    window.App.store.openRecents()
    await wait(60)
    check(
        "recent lists the last watched",
        document.querySelectorAll("#recentsList .channel").length >= 1,
        `${document.querySelectorAll("#recentsList .channel").length} rows`,
    )
    window.App.store.openFavorites()
    await wait(60)
    check("the favorites are listed", document.querySelectorAll("#favList .channel").length === 1)
    checkClasses("favorites uses the classes the CSS styles", [
        ["#favList .channel", "row"],
        ["#favList .saved", "estrella"],
    ])

    window.App.store.goHome()
    await wait(80)
    document.querySelector("#sourceList .edit").click()
    await wait(80)
    check("editing opens", !!document.getElementById("screen-edit"))
    check(
        "editing comes pre-filled",
        document.getElementById("field-url").value.indexOf("sample.m3u") !== -1,
        document.getElementById("field-url").value,
    )
    check("editing offers delete", !!document.getElementById("formDelete"))
    typeInto("#field-name", "My list")
    document.getElementById("formSave").click()
    await wait(150)
    check(
        "on saving it returns to sources with the new name",
        !!document.getElementById("screen-home") &&
            document.querySelector("#sourceList .row-name").textContent === "My list",
        document.querySelector("#sourceList .row-name")
            ? document.querySelector("#sourceList .row-name").textContent
            : "(no row)",
    )

    window.fetch = function () {
        return new Promise(() => {})
    }
    const loadingStore = window.App.store
    loadingStore.state.channels = {}
    loadingStore.state.groups = {}
    loadingStore.state.flat = null
    loadingStore.openSource(loadingStore.state.lists[0].id)
    await wait(500)

    const loadRow = document.querySelector("#loadingList .loading-row")
    check(
        "while loading the progress is shown, not an empty card",
        !!loadRow && loadRow.querySelector(".loading-phase").textContent.length > 0,
        loadRow ? `(${loadRow.textContent})` : "(no row)",
    )
    check(
        "the phase says what it is doing",
        /Connecting|Downloading|Fetching|Preparing|Reading/.test(
            loadRow ? loadRow.querySelector(".loading-phase").textContent : "",
        ),
    )
    check(
        "with a single source the headline names it",
        (function () {
            const title = document.getElementById("loadingTitle").textContent
            return title.indexOf("My list") !== -1
        })(),
        document.getElementById("loadingTitle").textContent,
    )
    check(
        "and the row does not repeat the name",
        !loadRow.querySelector(".loading-name") ||
            loadRow.querySelector(".loading-name").textContent === "",
        loadRow.querySelector(".loading-name")
            ? loadRow.querySelector(".loading-name").textContent
            : "(no name)",
    )

    loadingStore.setLoading(false)
    loadingStore.state.pending = {}
    loadingStore.state.loadProgress = {}

    window.App.store.goHome()
    await wait(60)
    press(403)
    await wait(40)
    check("the red key asks for confirmation", !!document.querySelector("#confirm .modal-card"))
    checkClasses("the modal uses the classes the CSS styles", [
        [".modal-card", "card"],
        ["#confirmText", "texto"],
        ["#confirmOk.btn.danger", "borrar"],
    ])
    document.getElementById("confirmOk").click()
    await wait(60)
    check(
        "the source is deleted and it returns home",
        !!document.getElementById("screen-home") &&
            document.querySelectorAll("#sourceList .row.source").length === 0,
    )

    const cssFiles = fs.readdirSync(path.join(root, "css")).filter((name) => {
        return /\.css$/.test(name)
    })
    const htmlSource = fs.readFileSync(path.join(root, "index.html"), "utf8")
    const unlinked = cssFiles.filter((name) => {
        return htmlSource.indexOf(`css/${name}`) === -1
    })
    check("index.html links all the stylesheets", unlinked.length === 0, unlinked.join(", "))
    const inlineCss = Array.from(htmlSource.matchAll(/<style>([\s\S]*?)<\/style>/g))
        .map((match) => {
            return match[1]
        })
        .join("\n")
    const css = `${cssFiles
        .map((name) => {
            return fs.readFileSync(path.join(root, "css", name), "utf8")
        })
        .join("\n")}\n${inlineCss}`
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "")
    const styleEl = document.createElement("style")
    styleEl.textContent = css
    document.head.appendChild(styleEl)
    const rules = document.styleSheets[document.styleSheets.length - 1].cssRules.length
    check("the stylesheet parses fully", rules >= 120, `${rules} rules`)
    check(
        "the identity trio is in the sheet",
        ["#febc06", "#cc4207", "#15e9a4"].every((hex) => {
            return code.indexOf(hex) !== -1
        }),
    )
    check(
        "the screen entrance is a fade, not a slide",
        (function () {
            const rule = code.match(/@keyframes screen-in\s*\{[^@]*?\}\s*\}/)
            return !!rule && rule[0].indexOf("transform") === -1 && /opacity/.test(rule[0])
        })(),
    )
    check(
        "and the multicolor only peeks through the header (blackout on top)",
        (function () {
            const rule = code.match(/--grad-fade:[^;]*;/)
            return (
                !!rule && /rgba\(5,\s*5,\s*5,\s*0\)/.test(rule[0]) && /var\(--black\)/.test(rule[0])
            )
        })(),
    )
    check(
        "the background carries the brand gradient with the three colors",
        (function () {
            const rule = code.match(/--grad-bg:\s*linear-gradient\([^;]*;/)
            if (!rule) return false
            return (
                /rgba\(254,\s*188,\s*6,/.test(rule[0]) &&
                /rgba\(204,\s*66,\s*7,[^)]*\)\s*48%/.test(rule[0]) &&
                /rgba\(21,\s*233,\s*164,/.test(rule[0])
            )
        })(),
    )
    check(
        "the AVPlay surface is measured in pixels, not percentage",
        (function () {
            const rule = code.match(/\.av-surface\s*\{[^}]*\}/)
            return !!rule && /width:\s*1920px/.test(rule[0]) && /height:\s*1080px/.test(rule[0])
        })(),
    )
    check(
        "the loading row cannot break into several lines",
        (function () {
            function rule(selector) {
                const match = code.match(new RegExp(`\\${selector}\\s*\\{[^}]*\\}`))
                return match ? match[0] : ""
            }
            return (
                /white-space:\s*nowrap/.test(rule(".loading-name")) &&
                /white-space:\s*nowrap/.test(rule(".loading-phase")) &&
                /flex:\s*none/.test(rule(".loading-phase")) &&
                /display:\s*flex/.test(rule(".loading-row"))
            )
        })(),
    )
    check(
        "all the CSS variables are defined",
        (function () {
            const defined = {}
            Array.from(code.matchAll(/(--[a-z0-9-]+)\s*:/g)).forEach((m) => {
                defined[m[1]] = 1
            })
            const used = {}
            Array.from(code.matchAll(/var\((--[a-z0-9-]+)/g)).forEach((m) => {
                used[m[1]] = 1
            })
            const missing = Object.keys(used).filter((name) => {
                return !defined[name]
            })
            return missing.length === 0 ? true : missing.join(", ")
        })() === true,
        "undefined variables",
    )
    check(
        "without dangling declarations in the sheet",
        (function () {
            const dangling = code.match(/\b(box-shadow|background|border|color):\s*\n\s*\1:/g)
            return !dangling
        })(),
    )
    check(
        "the form fields show the focus",
        (function () {
            const rules = code.match(/\.panel (input|textarea)\.focused[^{]*\{[^}]*\}/g) || []
            return (
                rules.length >= 2 &&
                rules.every((rule) => {
                    return rule.indexOf("inset 0 0 0 2px var(--ring)") !== -1
                })
            )
        })(),
    )
    check("no background blur (on TV it repaints in software)", !/backdrop-filter\s*:/.test(code))
    check(
        "the splash does not render the background in html (or the preview video would not be visible)",
        !/<style>[\s\S]*?html\s*,\s*body\s*\{[^}]*background/.test(htmlSource),
        "there is an html, body rule with background",
    )

    const styles = ["index.html"]
        .concat(scripts)
        .filter((file) => {
            return file.indexOf("vendor/") !== 0
        })
        .map((file) => {
            return fs.readFileSync(path.join(root, file), "utf8")
        })
        .join("\n")
    const used = new Set()
    Array.from(styles.matchAll(/class="([^"$]*)"/g)).forEach((match) => {
        match[1]
            .trim()
            .split(/\s+/)
            .forEach((name) => {
                if (name) used.add(name)
            })
    })
    ;["overlay", "visible", "focused", "active", "selected", "on"].forEach((name) => {
        used.add(name)
    })
    ;["channel", "source"].forEach((name) => {
        used.delete(name)
    })
    const unstyled = Array.from(used).filter((name) => {
        return code.indexOf(`.${name}`) === -1
    })
    check("every markup class has a rule in the sheet", unstyled.length === 0, unstyled.join(", "))

    window.webapis = {
        avplay: {
            open: function () {},
            setDisplayRect: function () {},
            setDisplayMethod: function () {},
            setListener: function () {},
            prepareAsync: function () {},
            play: function () {},
            getState: function () {
                return "PLAYING"
            },
            stop: function () {},
            close: function () {},
        },
    }
    const avStore = window.App.store
    avStore.play({ name: "Sin eventos", group: "X", url: "https://x/live/u/p/1.ts" }, "l1", [])
    await wait(200)
    check(
        "with AVPlay opening the boot notice is shown (that is the point)",
        !!document.getElementById("playerStatus"),
    )

    check(
        "no screen mode button in the player",
        !document.getElementById("ovAspect") &&
            !window.App.store.nextAspect &&
            !window.App.store.aspectLabel,
    )
    check("the player has a key legend", !!document.getElementById("ovKeys"))
    const legend = (document.getElementById("ovKeys").textContent || "").replace(/\s+/g, " ")
    ;["channel", "LEFT or OK", "favorites", "exit", "favorite", "jump"].forEach((key) => {
        check(`the legend explains "${key}"`, legend.indexOf(key) !== -1, legend.slice(0, 80))
    })
    await wait(4200)
    check(
        "and it is removed on its own after 4 s even if AVPlay says nothing",
        !document.getElementById("playerStatus"),
        "still on screen",
    )
    avStore.exitPlayer()
    window.webapis = undefined

    window.App.store.openAdd()
    await wait(60)
    document.querySelector('#addTypes .typecard[data-type="auto"]').click()
    await wait(120)
    const area = document.getElementById("field-text")
    check("the Detect add brings a text area", !!area && area.tagName === "TEXTAREA")
    area.focus()
    await wait(60)
    press(10009)
    await wait(80)
    check(
        "Back with the text area focused does not leave the add",
        window.App.store.state.screen === "add" && !!document.getElementById("field-text"),
        window.App.store.state.screen,
    )
    area.focus()
    await wait(40)
    press(53)
    await wait(60)
    check(
        "and a number typed in the text area does not jump channel",
        !window.App.store.state.numBuffer,
        window.App.store.state.numBuffer,
    )
    document.getElementById("formCancel").click()
    await wait(80)

    await movies()
    await series()

    check("without errors after the whole session", errors.length === 0, errors.join(" | "))

    report.done()
}

run().catch((error) => {
    report.fail("the suite crashed", error.stack)
    report.done()
})
