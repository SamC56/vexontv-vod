var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

// Movies and series. Kept apart from the store: the catalogs are fetched only when their
// section is opened, live in memory only, and a panel can send tens of thousands of titles.
// The one thing saved is how far each title was watched.
App.vod = (function () {
    const KEYS = {
        progress: "ts.progress",
        sort: "ts.vod.sort.",
        trackPrefs: "ts.vod.tracks",
        hidden: "ts.vod.hidden.",
    }
    const MAX_TRACK_PREFS = 200

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
    // Up Next: shown this close to an episode's end, and it plays the next one after the count,
    // so the next episode starts with 30 seconds of credits left.
    const UP_NEXT_S = 45
    const UP_NEXT_MS = 15000

    const state = {
        catalogs: {},
        pending: {},
        refreshed: {},
        trackPrefs: {},
        hidden: { movie: [], series: [] },
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
        state.trackPrefs = read(KEYS.trackPrefs, {})
        KINDS.forEach((kind) => {
            state.hidden[kind] = read(KEYS.hidden + kind, []) || []
        })
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

    function storeResult(listId, result) {
        const catalog = state.catalogs[listId] || {}
        if (result.movies) catalog.movies = tag(result.movies, listId)
        if (result.series) catalog.series = tag(result.series, listId)
        state.catalogs[listId] = catalog
    }

    function cacheKey(listId, kind) {
        return `${listId}:${catalogKey(kind)}`
    }

    // Kept for the next launch, one entry per kind: a playlist fills both at once.
    function saveResult(listId, result) {
        const at = Date.now()
        if (result.movies) App.cache.set(cacheKey(listId, "movie"), { at, items: result.movies })
        if (result.series) App.cache.set(cacheKey(listId, "series"), { at, items: result.series })
    }

    // From the source. Quiet when a saved copy is already showing: a failure then leaves that
    // copy in place instead of an error.
    function fetchList(list, kind, quiet) {
        const generation = generations[list.id] || 0
        return App.api.loadCatalog(list, kind).then(
            (result) => {
                if ((generations[list.id] || 0) !== generation) return []
                storeResult(list.id, result)
                saveResult(list.id, result)
                changed()
                return state.catalogs[list.id][catalogKey(kind)] || []
            },
            (error) => {
                if (quiet) return null
                if ((generations[list.id] || 0) === generation)
                    state.errors[`${list.id}:${kind}`] = error.message || String(error)
                throw error
            },
        )
    }

    // The saved catalog shows at once and the source is asked again in the background, once
    // per launch; with nothing saved, the source is asked and waited on.
    function ensureList(list, kind) {
        if (has(list.id, kind)) return Promise.resolve(state.catalogs[list.id][catalogKey(kind)])
        const key = pendingKey(list, kind)
        if (state.pending[key]) return state.pending[key]

        const generation = generations[list.id] || 0
        delete state.errors[`${list.id}:${kind}`]
        function done(value) {
            delete state.pending[key]
            changed()
            return value
        }
        const promise = App.cache
            .get(cacheKey(list.id, kind))
            .then((saved) => {
                if ((generations[list.id] || 0) !== generation) return []
                if (saved && Array.isArray(saved.items)) {
                    storeResult(list.id, { [catalogKey(kind)]: saved.items })
                    if (!state.refreshed[key]) {
                        state.refreshed[key] = true
                        fetchList(list, kind, true)
                    }
                    return state.catalogs[list.id][catalogKey(kind)]
                }
                state.refreshed[key] = true
                return fetchList(list, kind, false)
            })
            .then(done, (error) => {
                done(null)
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

    function isHidden(kind, group) {
        return (state.hidden[kind] || []).indexOf(group || "Otros") !== -1
    }

    // What browsing shows: the catalog less the categories hidden in this section.
    function browsable(kind) {
        if (!(state.hidden[kind] || []).length) return items(kind)
        return items(kind).filter((item) => {
            return !isHidden(kind, item.group)
        })
    }

    function categories(kind, all) {
        const counts = {}
        const lists = {}
        ;(all ? items(kind) : browsable(kind)).forEach((item) => {
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
        let list = browsable(kind)
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
    function saveProgress(item, position, duration, show, more) {
        const entry = {
            pos: Math.max(0, Math.round(position || 0)),
            dur: Math.max(0, Math.round(duration || 0)),
            at: Math.max(Date.now(), lastAt + 1),
        }
        lastAt = entry.at
        entry.done = isWatched(entry.pos, entry.dur)
        if (show) entry.show = keyOf(show)
        // A finished episode with another after it keeps its show in Continue watching.
        if (show && more) entry.more = true
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

    // Takes a title out of Continue watching: a film's progress, or every episode of a show.
    function forgetProgress(item) {
        const key = keyOf(item)
        Object.keys(state.progress).forEach((entryKey) => {
            if (entryKey === key || state.progress[entryKey].show === key)
                delete state.progress[entryKey]
        })
        write(KEYS.progress, state.progress)
        changed()
    }

    function hasProgress(item) {
        const key = keyOf(item)
        return Object.keys(state.progress).some((entryKey) => {
            return entryKey === key || state.progress[entryKey].show === key
        })
    }

    function itemByKey(key) {
        const kind = key.split(":")[1]
        return (
            items(kind).filter((item) => {
                return keyOf(item) === key
            })[0] || null
        )
    }

    // Asked first: the progress cannot be brought back.
    function confirmForget(item, returnZone) {
        if (!item || !hasProgress(item)) return false
        const what = item.kind === "series" ? "its episodes' progress" : "where you stopped"
        store().askConfirm(
            `Remove “${item.name}” from Continue watching? This forgets ${what}.`,
            () => {
                forgetProgress(item)
                store().notify("Removed from Continue watching")
            },
            returnZone,
        )
        return true
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
                return entry && (!entry.done || entry.more)
            })
            .sort((a, b) => {
                return latest[keyOf(b)].at - latest[keyOf(a)].at
            })
    }

    function forget(listId) {
        generations[listId] = (generations[listId] || 0) + 1
        delete state.catalogs[listId]
        App.cache.remove(cacheKey(listId, "movie"))
        App.cache.remove(cacheKey(listId, "series"))
        Object.keys(state.refreshed).forEach((key) => {
            if (key === listId || key.indexOf(`${listId}:`) === 0) delete state.refreshed[key]
        })
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
        season: null,
        upNext: null,
        preferContinue: false,
    }
    let seekTimer = null
    let upNextTimer = null
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

    function sectionScreen(kind) {
        return kind === "series" ? "series" : "movies"
    }

    // Movies and Series share the browse screen; each opens with its own sort, from the top.
    function openSection(kind) {
        if (ui.kind !== kind) {
            ui.category = ""
            ui.page = 0
            ui.query = ""
        }
        ui.kind = kind
        ui.sort = read(KEYS.sort + kind, "added") || "added"
        // Continue watching is the first choice whenever there is something in it; the catalog
        // may still be loading, so browse() settles it once the titles are there.
        ui.preferContinue = true
        store().set({ screen: sectionScreen(kind) })
        store().focus("vodCats", 0, 0)
        ensure(kind)
    }

    function openMovies() {
        openSection("movie")
    }

    function openSeries() {
        openSection("series")
    }

    function episodeLabel(episode) {
        if (!episode) return ""
        if (episode.season && episode.episode) return `S${episode.season} · E${episode.episode}`
        if (episode.episode) return `Episode ${episode.episode}`
        return episode.season ? `Season ${episode.season}` : ""
    }

    function sameEpisode(a, b) {
        return !!a && !!b && a.id === b.id
    }

    // The next episode, into the next numbered season when this one ends. Specials (season
    // 0) only lead on to more specials.
    function nextEpisode(seasons, episode) {
        const list = seasons || []
        for (let s = 0; s < list.length; s++) {
            const episodes = list[s].episodes
            for (let e = 0; e < episodes.length; e++) {
                if (!sameEpisode(episodes[e], episode)) continue
                if (e + 1 < episodes.length) return episodes[e + 1]
                if (!list[s].number) return null
                for (let n = s + 1; n < list.length; n++)
                    if (list[n].number && list[n].episodes.length) return list[n].episodes[0]
                return null
            }
        }
        return null
    }

    // Where a show opens: the episode left halfway, else the one after the last finished,
    // else the first of season 1 (or of whatever there is).
    function nextToWatch(seasons) {
        const list = seasons || []
        let latest = null
        list.forEach((season) => {
            season.episodes.forEach((episode) => {
                const entry = progressOf(episode)
                if (entry && (!latest || entry.at > latest.entry.at)) latest = { episode, entry }
            })
        })
        if (latest && !latest.entry.done) return latest.episode
        if (latest) return nextEpisode(list, latest.episode) || latest.episode
        const first =
            list.filter((season) => {
                return season.number && season.episodes.length
            })[0] ||
            list.filter((season) => {
                return season.episodes.length
            })[0]
        return first ? first.episodes[0] : null
    }

    // Shuffle: any episode of the numbered seasons (specials only when there is nothing else),
    // the unfinished ones first, never the one just played.
    function randomEpisode(seasons, except) {
        const list = seasons || []
        const numbered = list.filter((season) => {
            return season.number && season.episodes.length
        })
        let pool = []
        ;(numbered.length ? numbered : list).forEach((season) => {
            pool = pool.concat(season.episodes)
        })
        pool = pool.filter((episode) => {
            return !sameEpisode(episode, except)
        })
        const fresh = pool.filter((episode) => {
            const entry = progressOf(episode)
            return !entry || !entry.done
        })
        const from = fresh.length ? fresh : pool
        return from.length ? from[Math.floor(Math.random() * from.length)] : null
    }

    function playRandom() {
        if (!ui.title || !ui.details) return
        const seasons = ui.details.seasons || []
        const episode = randomEpisode(seasons, null)
        if (!episode) return
        playTitle(episode, false, { show: ui.title, seasons, origin: "show", shuffle: true })
    }

    function seasonNumberOf(seasons, episode) {
        const list = seasons || []
        for (let s = 0; s < list.length; s++)
            if (
                list[s].episodes.some((item) => {
                    return sameEpisode(item, episode)
                })
            )
                return list[s].number
        return list.length ? list[0].number : null
    }

    function episodeSelector(episode) {
        const key = keyOf(episode).replace(/["\\]/g, "\\$&")
        return `#showEpisodes .episode[data-key="${key}"]`
    }

    function selectSeason(number) {
        ui.season = number
        changed()
        store().focus("showEpisodes", 0, 0)
    }

    // A show's episodes carry its source, so their progress is kept apart from other lists.
    function tagEpisodes(show, details) {
        ;(details.seasons || []).forEach((season) => {
            season.episodes.forEach((episode) => {
                episode.listId = show.listId
                episode.kind = "episode"
            })
        })
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
            count: browsable(kind).length,
        })
        categories(kind).forEach((row) => {
            rows.push({ id: row.name, name: row.name, count: row.count, sources: row.sources })
        })

        if (ui.preferContinue && resume.length) {
            ui.category = CONTINUE
            ui.page = 0
            ui.preferContinue = false
        } else if (ui.preferContinue && items(kind).length) ui.preferContinue = false
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
        if (selected === CONTINUE) label += " · RED removes one"
        return { rows, category: selected, page: shown, label, sort: ui.sort, status: status(kind) }
    }

    // Hiding categories: a draft, kept only on Save, as Live TV does.
    function openCategories() {
        ui.catDraft = (state.hidden[ui.kind] || []).slice()
        ui.catSearch = ""
        store().set({ screen: "vodcats" })
        store().focus("vodCatList", 0, 0)
    }

    function categoriesDraft() {
        const needle = (ui.catSearch || "").trim().toLowerCase()
        const draft = ui.catDraft || []
        const all = categories(ui.kind, true)
        const rows = all
            .filter((row) => {
                return !needle || row.name.toLowerCase().indexOf(needle) !== -1
            })
            .map((row) => {
                return { name: row.name, count: row.count, enabled: draft.indexOf(row.name) === -1 }
            })
        const on = all.filter((row) => {
            return draft.indexOf(row.name) === -1
        }).length
        return { rows, on, total: all.length }
    }

    function toggleHidden(name) {
        const draft = (ui.catDraft || []).slice()
        const at = draft.indexOf(name)
        if (at === -1) draft.push(name)
        else draft.splice(at, 1)
        ui.catDraft = draft
        changed()
    }

    function setAllHidden(enabled) {
        ui.catDraft = enabled
            ? []
            : categories(ui.kind, true).map((row) => {
                  return row.name
              })
        changed()
    }

    function setCatSearch(value) {
        ui.catSearch = value || ""
        changed()
    }

    function closeCategories() {
        ui.catDraft = null
        store().set({ screen: sectionScreen(ui.kind) })
        store().focus("vodCats", 0, 0)
    }

    function saveCategories() {
        state.hidden[ui.kind] = (ui.catDraft || []).slice()
        write(KEYS.hidden + ui.kind, state.hidden[ui.kind])
        if (isHidden(ui.kind, ui.category)) ui.category = ""
        ui.page = 0
        closeCategories()
        store().notify("Categories saved")
    }

    function setCategory(id) {
        ui.preferContinue = false
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
        const show = item.kind === "series"
        ui.title = item
        ui.details = null
        ui.detailsError = null
        ui.season = null
        store().set({ screen: show ? "show" : "title" })
        store().focus(show ? "showActions" : "titleActions", 0, 0)
        info(item)
            .then((details) => {
                if (ui.title !== item) return
                ui.details = details
                if (show) {
                    tagEpisodes(item, details)
                    const next = nextToWatch(details.seasons)
                    ui.season = seasonNumberOf(details.seasons, next)
                    if (next && store().state.screen === "show")
                        store().focus("showEpisodes", 0, 0, episodeSelector(next))
                }
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
        store().set({ screen: sectionScreen(ui.kind) })
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

    // An episode plays with its show and seasons at hand: for its progress, its labels and
    // what comes next.
    function playEpisode(episode, fromStart) {
        if (!episode || !ui.title) return
        playTitle(episode, fromStart, {
            show: ui.title,
            seasons: (ui.details && ui.details.seasons) || [],
            origin: "show",
        })
    }

    function playTitle(item, fromStart, context) {
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
            origin: (context && context.origin) || store().state.screen,
            show: (context && context.show) || null,
            seasons: (context && context.seasons) || null,
            shuffle: !!(context && context.shuffle),
            ready: !mkv,
            hint: null,
        }
        // Picked once, so the Up Next card and the end of the episode agree on what follows.
        if (ui.playing.shuffle) ui.playing.following = randomEpisode(ui.playing.seasons, item)
        clearUpNext()
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
        return saveProgress(playing.item, position, duration, playing.show, hasNext(playing))
    }

    function following(playing) {
        if (!playing || !playing.show) return null
        if (playing.shuffle) return playing.following || null
        return nextEpisode(playing.seasons, playing.item)
    }

    function hasNext(playing) {
        return !!following(playing)
    }

    // Called by the player screen every second while a title plays.
    function tick() {
        const playing = ui.playing
        const position = App.player.position()
        if (playing && !ui.paused && position - lastSaved >= SAVE_EVERY_S) {
            lastSaved = position
            saveCurrent()
        }
        const duration = App.player.duration()
        const nearEnd = duration > 0 && position > 0 && duration - position <= UP_NEXT_S
        if (playing && playing.show && nearEnd && !ui.upNext && !playing.upNextDone && !ui.error) {
            const next = following(playing)
            if (next) startUpNext(next)
            else ui.playing = Object.assign({}, playing, { upNextDone: true })
        }
    }

    function startUpNext(episode) {
        clearUpNext()
        ui.upNext = { episode, deadline: Date.now() + UP_NEXT_MS, total: UP_NEXT_MS }
        upNextTimer = setTimeout(playNext, UP_NEXT_MS)
        changed()
        store().focus("vodUpNext", 0, 0)
    }

    function clearUpNext() {
        if (upNextTimer) clearTimeout(upNextTimer)
        upNextTimer = null
        ui.upNext = null
    }

    // Cancel: this episode plays on to its end, and the card does not come back for it.
    function dismissUpNext() {
        if (!ui.playing) return
        clearUpNext()
        ui.playing = Object.assign({}, ui.playing, { upNextDone: true })
        changed()
        store().focus("vodIdle", 0, 0)
    }

    function playNext() {
        const playing = ui.playing
        if (!playing || !playing.show) return
        const next = ui.upNext ? ui.upNext.episode : following(playing)
        clearUpNext()
        if (!next) return
        if (!playing.ended) saveCurrent()
        playTitle(next, false, {
            show: playing.show,
            seasons: playing.seasons,
            origin: "show",
            shuffle: playing.shuffle,
        })
    }

    function exitPlayer() {
        if (!ui.playing) return
        if (!ui.playing.ended) saveCurrent()
        const origin = ui.playing.origin
        const episode = ui.playing.show ? ui.playing.item : null
        clearSeek()
        clearUpNext()
        resetTracks()
        if (osdTimer) clearTimeout(osdTimer)
        osdTimer = null
        ui.osd = false
        ui.playing = null
        ui.error = null
        if (origin === "title" && ui.title) {
            store().set({ screen: "title" })
            store().focus("titleActions", 0, 0)
        } else if (origin === "show" && ui.title) {
            // Back on the show, on the episode that was playing, in its season.
            if (episode) ui.season = seasonNumberOf(ui.details && ui.details.seasons, episode)
            store().set({ screen: "show" })
            if (episode) store().focus("showEpisodes", 0, 0, episodeSelector(episode))
            else store().focus("showActions", 0, 0)
        } else backFromTitle()
    }

    function playEnded() {
        const playing = ui.playing
        if (!playing) return
        const duration = App.player.duration()
        if (duration > 0)
            saveProgress(playing.item, duration, duration, playing.show, hasNext(playing))
        ui.playing = Object.assign({}, playing, { ended: true })
        if (hasNext(playing)) playNext()
        else exitPlayer()
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
            // Left on the audio or subtitle buttons, or their list, they go with the rest.
            if (ui.menu || ui.trackMenu) closeMenu()
            else changed()
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
        const choice = preferTracks(
            found,
            chooseTracks(found),
            ui.playing.show ? state.trackPrefs[keyOf(ui.playing.show)] : null,
        )
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

    function describeTrack(list, index) {
        const track = list.filter((item) => {
            return item.index === index
        })[0]
        if (!track) return null
        return { lang: track.lang || "", name: track.name || "", forced: !!track.forced, index }
    }

    // The same track in another episode: same language, name and forced flag if it has one,
    // else the same language. Tracks alike in all of those (two unnamed English ones) are told
    // apart by their position, which episodes of one show tend to share.
    function matchTrack(list, want) {
        if (!want) return null
        const lang = langCode(want.lang)
        const same = list.filter((track) => {
            return langCode(track.lang) === lang
        })
        const alike = same.filter((track) => {
            return (track.name || "") === (want.name || "") && !!track.forced === !!want.forced
        })
        const exact =
            alike.filter((track) => {
                return track.index === want.index
            })[0] || alike[0]
        const flagged = same.filter((track) => {
            return !!track.forced === !!want.forced
        })[0]
        return exact || flagged || same[0] || null
    }

    // A choice made for a show wins over the English defaults, in every later episode.
    function preferTracks(found, choice, pref) {
        if (!pref) return choice
        const result = { audio: choice.audio, text: choice.text }
        const audio = matchTrack(found.audio, pref.audio)
        if (audio) result.audio = audio.index
        if (pref.text === "off") result.text = -1
        else {
            const text = matchTrack(found.text, pref.text)
            if (text) result.text = text.index
        }
        return result
    }

    function rememberTrack(type, index) {
        const show = ui.playing && ui.playing.show
        if (!show || !ui.tracks) return
        const key = keyOf(show)
        const pref = Object.assign({}, state.trackPrefs[key] || {})
        if (type === "audio") pref.audio = describeTrack(ui.tracks.audio, index)
        else pref.text = index === -1 ? "off" : describeTrack(ui.tracks.text, index)
        pref.at = Date.now()
        state.trackPrefs[key] = pref
        const keys = Object.keys(state.trackPrefs)
        if (keys.length > MAX_TRACK_PREFS) {
            keys.sort((a, b) => {
                return (state.trackPrefs[b].at || 0) - (state.trackPrefs[a].at || 0)
            })
                .slice(MAX_TRACK_PREFS)
                .forEach((old) => {
                    delete state.trackPrefs[old]
                })
        }
        write(KEYS.trackPrefs, state.trackPrefs)
    }

    function pickTrack(type, index) {
        const tracks = ui.tracks
        if (!tracks) return
        rememberTrack(type, index)
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
        forgetProgress,
        hasProgress,
        itemByKey,
        confirmForget,
        saveProgress,
        continueWatching,
        forget,
        CONTINUE,
        ui,
        formatTime,
        formatRuntime,
        openMovies,
        openSeries,
        openCategories,
        categoriesDraft,
        toggleHidden,
        setAllHidden,
        setCatSearch,
        closeCategories,
        saveCategories,
        sectionScreen,
        episodeLabel,
        nextEpisode,
        nextToWatch,
        randomEpisode,
        playRandom,
        selectSeason,
        playEpisode,
        dismissUpNext,
        playNext,
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
        preferTracks,
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
