var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

// Movies and series. Kept apart from the store: the catalogs are fetched only when their
// section is opened, live in memory only, and a panel can send tens of thousands of titles.
// The one thing saved is how far each title was watched.
App.vod = (function () {
    const KEYS = {
        progress: "ts.progress",
    }

    const KINDS = ["movie", "series"]
    const PAGE = 60
    const MAX_PROGRESS = 300
    // Watched: past this share of the runtime, or with less than this many seconds left.
    const WATCHED_RATIO = 0.92
    const WATCHED_TAIL_S = 180

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
    }
})()
