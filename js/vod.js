var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

// Movies and series. Kept apart from the store: the catalogs are fetched only when their
// section is opened, live in memory only, and a panel can send tens of thousands of titles.
// The one thing saved is how far each title was watched.
App.vod = (function () {
    const KEYS = {
        progress: "ts.progress",
        sort: "ts.vod.sort.",
    }

    const KINDS = ["movie", "series"]
    const PAGE = 60
    const MAX_PROGRESS = 300
    // Watched: past this share of the runtime, or with less than this many seconds left.
    const WATCHED_RATIO = 0.92
    const WATCHED_TAIL_S = 180
    // Saved this often while a title plays, and once more on the way out.
    const SAVE_EVERY_S = 15
    // Scrubbing: the arrows move a mark, OK jumps there, Back or a long pause drops it.
    const SEEK_IDLE_MS = 10000
    const SEEK_CHAIN_MS = 500
    // The controls show on any key and hide on their own after this.
    const OSD_MS = 5000
    // A subtitle line with no duration, or a wrong one, still goes away.
    const SUBTITLE_MAX_MS = 10000

    // Track languages arrive as ISO 639-2 (eng, spa, fre) or 639-1 (en, es) codes.
    const ISO3 = {
        eng: "en",
        spa: "es",
        fre: "fr",
        fra: "fr",
        ger: "de",
        deu: "de",
        ita: "it",
        por: "pt",
        dut: "nl",
        nld: "nl",
        ara: "ar",
        chi: "zh",
        zho: "zh",
        jpn: "ja",
        kor: "ko",
        rus: "ru",
        pol: "pl",
        tur: "tr",
        swe: "sv",
        dan: "da",
        nor: "no",
        nob: "no",
        fin: "fi",
        gre: "el",
        ell: "el",
        heb: "he",
        hin: "hi",
        hun: "hu",
        cze: "cs",
        ces: "cs",
        rum: "ro",
        ron: "ro",
        tha: "th",
        vie: "vi",
        ind: "id",
        may: "ms",
        msa: "ms",
    }
    const LANGS = {
        en: "English",
        es: "Spanish",
        fr: "French",
        de: "German",
        it: "Italian",
        pt: "Portuguese",
        nl: "Dutch",
        ar: "Arabic",
        zh: "Chinese",
        ja: "Japanese",
        ko: "Korean",
        ru: "Russian",
        pl: "Polish",
        tr: "Turkish",
        sv: "Swedish",
        da: "Danish",
        no: "Norwegian",
        fi: "Finnish",
        el: "Greek",
        he: "Hebrew",
        hi: "Hindi",
        hu: "Hungarian",
        cs: "Czech",
        ro: "Romanian",
        th: "Thai",
        vi: "Vietnamese",
        id: "Indonesian",
        ms: "Malay",
    }
    const CONTINUE = "@continue"
    // Many panels allow one stream per account and free it a few seconds after the last one
    // stops: the first refusal is retried once on its own after this long.
    const RETRY_MS = 3000

    const state = {
        catalogs: {},
        pending: {},
        errors: {},
        info: {},
        progress: {},
    }

    // A source edited or removed while its catalog downloads must not get it back.
    const generations = {}
    let merged = {}
    // Two saves in the same millisecond still have an order: the trim keeps the newest.
    let lastAt = 0

    function read(key, fallback) {
        try {
            const raw = localStorage.getItem(key)
            return raw ? JSON.parse(raw) : fallback
        } catch {
            return fallback
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value))
        } catch {}
    }

    function changed() {
        merged = {}
        if (App.store && App.store.emit) App.store.emit()
    }

    function init() {
        state.progress = read(KEYS.progress, {})
    }

    function sourcesWithVod() {
        return App.store.state.lists.filter((list) => {
            return list.vod !== false && list.kind !== "stalker"
        })
    }

    function catalogKey(kind) {
        return kind === "series" ? "series" : "movies"
    }

    // A playlist answers both kinds with one download, so it is waited on once.
    function pendingKey(list, kind) {
        return list.kind === "m3u" && !list.user ? list.id : `${list.id}:${kind}`
    }

    function has(listId, kind) {
        const catalog = state.catalogs[listId]
        return !!(catalog && catalog[catalogKey(kind)])
    }

    function tag(items, listId) {
        items.forEach((item) => {
            item.listId = listId
        })
        return items
    }

    function ensureList(list, kind) {
        if (has(list.id, kind)) return Promise.resolve(state.catalogs[list.id][catalogKey(kind)])
        const key = pendingKey(list, kind)
        if (state.pending[key]) return state.pending[key]

        const generation = generations[list.id] || 0
        delete state.errors[`${list.id}:${kind}`]
        const promise = App.api
            .loadCatalog(list, kind)
            .then((result) => {
                delete state.pending[key]
                if ((generations[list.id] || 0) !== generation) return []
                const catalog = state.catalogs[list.id] || {}
                if (result.movies) catalog.movies = tag(result.movies, list.id)
                if (result.series) catalog.series = tag(result.series, list.id)
                state.catalogs[list.id] = catalog
                changed()
                return catalog[catalogKey(kind)] || []
            })
            .catch((error) => {
                delete state.pending[key]
                if ((generations[list.id] || 0) === generation)
                    state.errors[`${list.id}:${kind}`] = error.message || String(error)
                changed()
                throw error
            })
        state.pending[key] = promise
        changed()
        return promise
    }

    // Every source at once; one that fails leaves its error behind and the rest still show.
    function ensure(kind) {
        return Promise.all(
            sourcesWithVod().map((list) => {
                return ensureList(list, kind).catch(() => {
                    return []
                })
            }),
        ).then(() => {
            return items(kind)
        })
    }

    function status(kind) {
        let loading = 0
        const errors = []
        sourcesWithVod().forEach((list) => {
            if (state.pending[pendingKey(list, kind)]) loading++
            const error = state.errors[`${list.id}:${kind}`]
            if (error) errors.push({ listId: list.id, name: list.name, message: error })
        })
        return { loading, errors }
    }

    function items(kind) {
        if (merged[kind]) return merged[kind]
        let all = []
        sourcesWithVod().forEach((list) => {
            const catalog = state.catalogs[list.id]
            const part = catalog && catalog[catalogKey(kind)]
            if (part) all = all.concat(part)
        })
        merged[kind] = all
        return all
    }

    function categories(kind) {
        const counts = {}
        const lists = {}
        items(kind).forEach((item) => {
            const group = item.group || "Otros"
            counts[group] = (counts[group] || 0) + 1
            lists[group] = lists[group] || {}
            lists[group][item.listId] = 1
        })
        return Object.keys(counts)
            .sort((a, b) => {
                return a.localeCompare(b, "en")
            })
            .map((name) => {
                return { name, count: counts[name], sources: Object.keys(lists[name]).length }
            })
    }

    const SORTS = {
        added: function (a, b) {
            return (b.added || 0) - (a.added || 0) || a.name.localeCompare(b.name, "en")
        },
        name: function (a, b) {
            return a.name.localeCompare(b.name, "en")
        },
        rating: function (a, b) {
            const left = a.rating === null ? -1 : a.rating
            const right = b.rating === null ? -1 : b.rating
            return right - left || a.name.localeCompare(b.name, "en")
        },
    }

    // What a section shows: one category or all of them, narrowed by the search, in order.
    function view(kind, options) {
        const opts = options || {}
        let list = items(kind)
        if (opts.category)
            list = list.filter((item) => {
                return (item.group || "Otros") === opts.category
            })
        list = App.api.match(list, opts.query)
        return list.slice().sort(SORTS[opts.sort] || SORTS.added)
    }

    // The grid is drawn a page at a time: a TV does not lay out five thousand posters.
    function page(list, index) {
        const pages = Math.max(1, Math.ceil(list.length / PAGE))
        const at = Math.min(Math.max(0, index || 0), pages - 1)
        return {
            items: list.slice(at * PAGE, (at + 1) * PAGE),
            index: at,
            pages,
            total: list.length,
        }
    }

    function keyOf(item) {
        return `${item.listId}:${item.kind}:${item.id}`
    }

    function info(item) {
        const key = keyOf(item)
        if (!state.info[key]) {
            state.info[key] = App.api
                .loadInfo(App.store.listById(item.listId), item)
                .catch((error) => {
                    delete state.info[key]
                    throw error
                })
        }
        return state.info[key]
    }

    function isWatched(position, duration) {
        if (!(duration > 0)) return false
        return position / duration >= WATCHED_RATIO || duration - position < WATCHED_TAIL_S
    }

    function progressOf(item) {
        return state.progress[keyOf(item)] || null
    }

    // An episode remembers its show, which is how a series finds its way into Continue
    // watching without the episode list at hand.
    function saveProgress(item, position, duration, show) {
        const entry = {
            pos: Math.max(0, Math.round(position || 0)),
            dur: Math.max(0, Math.round(duration || 0)),
            at: Math.max(Date.now(), lastAt + 1),
        }
        lastAt = entry.at
        entry.done = isWatched(entry.pos, entry.dur)
        if (show) entry.show = keyOf(show)
        state.progress[keyOf(item)] = entry

        const keys = Object.keys(state.progress)
        if (keys.length > MAX_PROGRESS) {
            keys.sort((a, b) => {
                return state.progress[b].at - state.progress[a].at
            })
                .slice(MAX_PROGRESS)
                .forEach((key) => {
                    delete state.progress[key]
                })
        }
        write(KEYS.progress, state.progress)
        changed()
        return entry
    }

    function continueWatching(kind) {
        const latest = {}
        Object.keys(state.progress).forEach((key) => {
            const entry = state.progress[key]
            const target = kind === "series" ? entry.show : key
            if (!target) return
            if (!latest[target] || latest[target].at < entry.at) latest[target] = entry
        })
        return items(kind)
            .filter((item) => {
                const entry = latest[keyOf(item)]
                return entry && !entry.done
            })
            .sort((a, b) => {
                return latest[keyOf(b)].at - latest[keyOf(a)].at
            })
    }

    function forget(listId) {
        generations[listId] = (generations[listId] || 0) + 1
        delete state.catalogs[listId]
        Object.keys(state.pending).forEach((key) => {
            if (key === listId || key.indexOf(`${listId}:`) === 0) delete state.pending[key]
        })
        Object.keys(state.errors).forEach((key) => {
            if (key.indexOf(`${listId}:`) === 0) delete state.errors[key]
        })
        Object.keys(state.info).forEach((key) => {
            if (key.indexOf(`${listId}:`) === 0) delete state.info[key]
        })
        merged = {}
    }

    // What the Movies screen, the details page and the player are showing.
    const ui = {
        kind: "movie",
        category: "",
        sort: "added",
        query: "",
        page: 0,
        title: null,
        details: null,
        detailsError: null,
        playing: null,
        paused: false,
        seek: null,
        presses: 0,
        error: null,
        tracks: null,
        menu: false,
        trackMenu: null,
        subtitle: "",
        osd: false,
    }
    let seekTimer = null
    let osdTimer = null
    let subtitleTimer = null
    let lastSaved = 0

    function store() {
        return App.store
    }

    function formatTime(seconds) {
        const total = Math.max(0, Math.floor(seconds || 0))
        const h = Math.floor(total / 3600)
        const m = Math.floor((total % 3600) / 60)
        const sec = `0${total % 60}`.slice(-2)
        return h ? `${h}:${`0${m}`.slice(-2)}:${sec}` : `${m}:${sec}`
    }

    function formatRuntime(seconds) {
        if (!(seconds > 0)) return ""
        const h = Math.floor(seconds / 3600)
        const m = Math.round((seconds % 3600) / 60)
        return h ? `${h}h ${`0${m}`.slice(-2)}m` : `${m}m`
    }

    function openMovies() {
        ui.kind = "movie"
        ui.sort = read(KEYS.sort + ui.kind, "added") || "added"
        store().set({ screen: "movies" })
        store().focus("vodCats", 0, 0)
        ensure(ui.kind)
    }

    function browse() {
        const kind = ui.kind
        const resume = continueWatching(kind)
        const rows = []
        if (resume.length)
            rows.push({
                id: CONTINUE,
                name: "Continue watching",
                count: resume.length,
                pinned: true,
            })
        rows.push({
            id: "",
            name: kind === "series" ? "All series" : "All movies",
            count: items(kind).length,
        })
        categories(kind).forEach((row) => {
            rows.push({ id: row.name, name: row.name, count: row.count, sources: row.sources })
        })

        const category = ui.category === CONTINUE && !resume.length ? "" : ui.category
        const known = rows.some((row) => {
            return row.id === category
        })
        const selected = known ? category : ""
        const list =
            selected === CONTINUE
                ? App.api.match(resume, ui.query)
                : view(kind, { category: selected, query: ui.query, sort: ui.sort })
        const shown = page(list, ui.page)
        ui.page = shown.index
        const name = rows.filter((row) => {
            return row.id === selected
        })[0].name
        const count = store().formatCount(shown.total)
        let label = `${name} · ${count} ${shown.total === 1 ? "title" : "titles"}`
        if (shown.pages > 1) label += ` · page ${shown.index + 1} of ${shown.pages}`
        return { rows, category: selected, page: shown, label, sort: ui.sort, status: status(kind) }
    }

    function setCategory(id) {
        ui.category = id
        ui.page = 0
        changed()
        store().focus("vodGrid", 0, 0)
    }

    function setSort(id) {
        if (!SORTS[id]) return
        ui.sort = id
        ui.page = 0
        write(KEYS.sort + ui.kind, id)
        changed()
    }

    function setQuery(value) {
        ui.query = value || ""
        ui.page = 0
        changed()
    }

    // The grid's edges turn the page. Answers whether there was a page to turn to.
    function turnPage(delta) {
        const shown = browse().page
        const next = shown.index + delta
        if (next < 0 || next >= shown.pages) return false
        ui.page = next
        changed()
        return true
    }

    function openTitle(item) {
        if (!item) return
        ui.title = item
        ui.details = null
        ui.detailsError = null
        store().set({ screen: "title" })
        store().focus("titleActions", 0, 0)
        info(item)
            .then((details) => {
                if (ui.title !== item) return
                ui.details = details
                changed()
            })
            .catch((error) => {
                if (ui.title !== item) return
                ui.details = {}
                ui.detailsError = error.message || "The panel sent no details for this title"
                changed()
            })
    }

    function backFromTitle() {
        const item = ui.title
        store().set({ screen: "movies" })
        if (item) {
            const key = keyOf(item).replace(/["\\]/g, "\\$&")
            const selector = `#vodGrid .poster[data-key="${key}"]`
            store().focus("vodGrid", 0, 0, selector)
        } else store().focus("vodCats", 0, 0)
    }

    function resumePoint(item) {
        const entry = progressOf(item)
        return entry && !entry.done && entry.pos > 0 ? entry.pos : 0
    }

    function playTitle(item, fromStart) {
        if (!item) return
        const details = ui.title === item ? ui.details : null
        const url = (details && details.url) || item.url
        // An MKV says in its first bytes what each track is; the player opens once that is
        // read, or once it gives up after a few seconds.
        const mkv = item.ext === "mkv" || /\.mkv(?:[?#]|$)/i.test(url || "")
        ui.playing = {
            item,
            url,
            start: fromStart ? 0 : resumePoint(item),
            origin: store().state.screen,
            ready: !mkv,
            hint: null,
        }
        if (mkv) {
            App.api.loadMkvTracks(url).then((hint) => {
                if (!ui.playing || ui.playing.item !== item || ui.playing.ready) return
                ui.playing = Object.assign({}, ui.playing, { ready: true, hint })
                changed()
            })
        }
        ui.paused = false
        clearSeek()
        resetTracks()
        ui.error = null
        lastSaved = 0
        store().set({ screen: "vodplayer" })
        store().focus("vodIdle", 0, 0)
    }

    function saveCurrent() {
        const playing = ui.playing
        if (!playing) return null
        const duration = App.player.duration()
        const position = App.player.position()
        if (!(duration > 0) || !(position > 0)) return null
        return saveProgress(playing.item, position, duration)
    }

    // Called by the player screen every second while a title plays.
    function tick() {
        const position = App.player.position()
        if (ui.playing && !ui.paused && position - lastSaved >= SAVE_EVERY_S) {
            lastSaved = position
            saveCurrent()
        }
    }

    function exitPlayer() {
        if (!ui.playing) return
        if (!ui.playing.ended) saveCurrent()
        const origin = ui.playing.origin
        clearSeek()
        resetTracks()
        if (osdTimer) clearTimeout(osdTimer)
        osdTimer = null
        ui.osd = false
        ui.playing = null
        ui.error = null
        if (origin === "title" && ui.title) {
            store().set({ screen: "title" })
            store().focus("titleActions", 0, 0)
        } else backFromTitle()
    }

    function playEnded() {
        const playing = ui.playing
        if (!playing) return
        const duration = App.player.duration()
        if (duration > 0) saveProgress(playing.item, duration, duration)
        ui.playing = Object.assign({}, playing, { ended: true })
        exitPlayer()
    }

    function playFailed(message) {
        const playing = ui.playing
        if (!playing) return
        if (!playing.retried) {
            ui.playing = Object.assign({}, playing, { retried: true })
            setTimeout(() => {
                if (ui.playing && ui.playing.item === playing.item && !ui.error) retry()
            }, RETRY_MS)
            return
        }
        ui.error = message || "Could not open the title"
        changed()
        store().focus("vodError", 0, 0)
    }

    function retry() {
        if (!ui.playing) return
        const position = App.player.position()
        ui.playing = Object.assign({}, ui.playing, {
            start: position > 0 ? position : ui.playing.start,
            attempt: (ui.playing.attempt || 0) + 1,
        })
        resetTracks()
        ui.error = null
        changed()
        store().focus("vodIdle", 0, 0)
    }

    // paused: true to pause, false to play, undefined to toggle.
    function setPaused(paused) {
        if (!ui.playing || ui.error) return
        const pause = paused === undefined ? !ui.paused : paused
        if (pause === ui.paused) return
        const result = App.player.toggle()
        ui.paused = result === "PAUSED" || (result !== "PLAYING" && pause)
        if (ui.paused) saveCurrent()
        changed()
    }

    function seekStep(presses) {
        if (presses < 5) return 10
        return presses < 15 ? 30 : 60
    }

    function seekBy(direction) {
        if (!ui.playing || ui.error) return
        const now = Date.now()
        const chained =
            ui.seek && ui.seek.direction === direction && now - ui.seek.at < SEEK_CHAIN_MS
        ui.presses = chained ? ui.presses + 1 : 0
        const from = ui.seek ? ui.seek.target : App.player.position()
        const duration = App.player.duration()
        let target = Math.max(0, from + direction * seekStep(ui.presses))
        if (duration > 0) target = Math.min(target, Math.max(0, duration - 1))
        ui.seek = { target, at: now, direction }
        if (seekTimer) clearTimeout(seekTimer)
        seekTimer = setTimeout(cancelSeek, SEEK_IDLE_MS)
        changed()
    }

    function cancelSeek() {
        if (!ui.seek) return
        clearSeek()
        changed()
    }

    function clearSeek() {
        if (seekTimer) clearTimeout(seekTimer)
        seekTimer = null
        ui.seek = null
        ui.presses = 0
    }

    function commitSeek() {
        if (!ui.seek) return
        const target = ui.seek.target
        clearSeek()
        App.player.seekTo(target)
        lastSaved = target
        changed()
    }

    function langCode(value) {
        const code = String(value || "")
            .toLowerCase()
            .split(/[-_]/)[0]
        if (code === "english") return "en"
        return ISO3[code] || code
    }

    function langName(value) {
        const code = langCode(value)
        if (!code || code === "und") return "Unknown"
        return LANGS[code] || code.toUpperCase()
    }

    // English audio when there is any. Subtitles: English ones under foreign audio; under
    // English audio only a track marked forced, which subtitles the foreign parts alone.
    function chooseTracks(tracks) {
        const english = (list) => {
            return list.filter((track) => {
                return langCode(track.lang) === "en"
            })
        }
        const englishAudio = english(tracks.audio)[0]
        const current =
            tracks.audio.filter((track) => {
                return track.index === tracks.audioIndex
            })[0] || tracks.audio[0]
        const audio = englishAudio || current
        const englishText = english(tracks.text)
        const forced = englishText.filter((track) => {
            return track.forced || /forced/i.test(track.name || "")
        })[0]
        let text = -1
        // Unknown audio is not foreign: most files that do not say are English.
        const hearing = audio ? langCode(audio.lang) : ""
        const foreign = hearing && hearing !== "und" && hearing !== "en"
        if (foreign && englishText.length) text = englishText[0].index
        else if (forced) text = forced.index
        return { audio: audio ? audio.index : null, text }
    }

    // "English", "English (forced)", "English · SDH"; tracks that say nothing are numbered.
    function labelled(list) {
        const seen = {}
        return list.map((track, index) => {
            const code = langCode(track.lang)
            let label = !code || code === "und" ? `Track ${index + 1}` : langName(track.lang)
            if (track.forced) label += " (forced)"
            else if (track.name && track.name.toLowerCase() !== label.toLowerCase())
                label += ` · ${track.name}`
            seen[label] = (seen[label] || 0) + 1
            return Object.assign({}, track, {
                label: seen[label] > 1 ? `${label} ${seen[label]}` : label,
            })
        })
    }

    // The file's own description, laid over AVPlay's list when both count the same tracks.
    function withHint(list, hint) {
        if (!hint || hint.length !== list.length) return list
        return list.map((track, index) => {
            return Object.assign({}, track, {
                lang: hint[index].lang || track.lang,
                name: hint[index].name || "",
                forced: !!hint[index].forced,
            })
        })
    }

    function showOsd() {
        if (osdTimer) clearTimeout(osdTimer)
        osdTimer = setTimeout(() => {
            osdTimer = null
            ui.osd = false
            changed()
        }, OSD_MS)
        if (ui.osd) return
        ui.osd = true
        changed()
    }

    // Back's first press while the controls show: they go, the film stays.
    function hideOsd() {
        if (osdTimer) clearTimeout(osdTimer)
        osdTimer = null
        ui.osd = false
        changed()
    }

    function resetTracks() {
        ui.tracks = null
        ui.menu = false
        ui.trackMenu = null
        ui.subtitle = ""
        if (subtitleTimer) clearTimeout(subtitleTimer)
        subtitleTimer = null
    }

    // Once a title has started: read its tracks and apply the English defaults.
    function tracksReady() {
        if (!ui.playing || ui.tracks) return
        const reported = App.player.tracks()
        const hint = ui.playing.hint
        const found = Object.assign({}, reported, {
            audio: withHint(reported.audio, hint && hint.audio),
            text: withHint(reported.text, hint && hint.text),
        })
        const choice = chooseTracks(found)
        if (choice.audio !== null && choice.audio !== found.audioIndex)
            App.player.selectTrack("AUDIO", choice.audio)
        if (choice.text !== -1) App.player.selectTrack("TEXT", choice.text)
        App.player.silenceSubtitles(choice.text === -1)
        ui.tracks = {
            audio: labelled(found.audio),
            text: labelled(found.text),
            audioIndex: choice.audio,
            textIndex: choice.text,
        }
        changed()
    }

    function trackLabel(type) {
        const tracks = ui.tracks
        if (!tracks) return type === "audio" ? "Default" : "Off"
        const list = type === "audio" ? tracks.audio : tracks.text
        const index = type === "audio" ? tracks.audioIndex : tracks.textIndex
        const track = list.filter((item) => {
            return item.index === index
        })[0]
        if (track) return track.label
        return type === "audio" ? "Default" : "Off"
    }

    function openMenu() {
        if (!ui.playing || ui.error) return
        ui.menu = true
        changed()
        store().focus("vodMenu", 0, 0)
    }

    function closeMenu() {
        ui.menu = false
        ui.trackMenu = null
        changed()
        store().focus("vodIdle", 0, 0)
    }

    function openTracks(type) {
        ui.trackMenu = type
        changed()
        const options = trackOptions(type)
        let at = 0
        options.forEach((option, index) => {
            if (option.selected) at = index
        })
        store().focus("vodTracks", at, 0)
    }

    function closeTracks() {
        const type = ui.trackMenu
        ui.trackMenu = null
        changed()
        store().focus("vodMenu", type === "text" ? 1 : 0, 0)
    }

    function trackOptions(type) {
        const tracks = ui.tracks || { audio: [], text: [], audioIndex: null, textIndex: -1 }
        if (type === "audio") {
            return tracks.audio.map((track) => {
                return {
                    index: track.index,
                    label: track.label,
                    selected: track.index === tracks.audioIndex,
                }
            })
        }
        return [{ index: -1, label: "Off", selected: tracks.textIndex === -1 }].concat(
            tracks.text.map((track) => {
                return {
                    index: track.index,
                    label: track.label,
                    selected: track.index === tracks.textIndex,
                }
            }),
        )
    }

    function pickTrack(type, index) {
        const tracks = ui.tracks
        if (!tracks) return
        if (type === "audio") {
            if (App.player.selectTrack("AUDIO", index)) tracks.audioIndex = index
        } else {
            if (index !== -1) App.player.selectTrack("TEXT", index)
            App.player.silenceSubtitles(index === -1)
            tracks.textIndex = index
            if (index === -1) showSubtitle("", 0)
        }
        closeTracks()
    }

    // Subtitle markup (SRT italics, ASS overrides) is dropped: the page draws plain lines.
    function showSubtitle(text, duration) {
        if (subtitleTimer) clearTimeout(subtitleTimer)
        subtitleTimer = null
        const clean = String(text || "")
            .replace(/\{\\[^}]*\}/g, "")
            .replace(/<[^>]+>/g, "")
            .replace(/\\N/g, "\n")
            .trim()
        ui.subtitle = ui.tracks && ui.tracks.textIndex !== -1 ? clean : ""
        if (ui.subtitle) {
            const ms = duration > 0 ? Math.min(duration, SUBTITLE_MAX_MS) : SUBTITLE_MAX_MS
            subtitleTimer = setTimeout(() => {
                ui.subtitle = ""
                subtitleTimer = null
                changed()
            }, ms)
        }
        changed()
    }

    return {
        KINDS,
        PAGE,
        state,
        init,
        ensure,
        status,
        items,
        categories,
        view,
        page,
        keyOf,
        info,
        isWatched,
        progressOf,
        saveProgress,
        continueWatching,
        forget,
        CONTINUE,
        ui,
        formatTime,
        formatRuntime,
        openMovies,
        browse,
        setCategory,
        setSort,
        setQuery,
        turnPage,
        openTitle,
        backFromTitle,
        resumePoint,
        playTitle,
        tick,
        exitPlayer,
        playEnded,
        playFailed,
        retry,
        setPaused,
        seekBy,
        commitSeek,
        cancelSeek,
        showOsd,
        hideOsd,
        langCode,
        langName,
        chooseTracks,
        tracksReady,
        trackLabel,
        trackOptions,
        openMenu,
        closeMenu,
        openTracks,
        closeTracks,
        pickTrack,
        showSubtitle,
    }
})()
