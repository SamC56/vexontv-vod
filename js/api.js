var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

App.api = (function () {
    // Xtream builds every address as /live/, /movie/ or /series/; for anything else the file
    // extension tells on-demand from a stream, and the title tells an episode from a movie.
    const MOVIE_PATH = /\/movie\//i
    const SERIES_PATH = /\/series\//i
    const LIVE_PATH = /\/live\//i
    const VOD_FILE = /\.(?:mp4|mkv|avi|mov|m4v|wmv|webm)(?:[?#]|$)/i
    const SERIES_GROUP = /(?:^|[^a-z])(?:series|séries|tv shows)(?:[^a-z]|$)/i
    const EPISODE_SE = /^(.*?)[\s._-]*\bS(\d{1,2})[\s._-]*E(\d{1,3})\b(.*)$/i
    const EPISODE_X = /^(.*?)[\s._-]*\b(\d{1,2})x(\d{2,3})\b(.*)$/i
    const SEASON_ONLY = /^(.*?)[\s._-]*\bS(\d{1,2})\s*$/i
    const YEAR = /\s*[([]((?:19|20)\d{2})[)\]]\s*$/
    // Scene names put the quality where the episode title would be.
    const RELEASE_TAG = /^(?:\d{3,4}p|4k|uhd|fhd|hdtv|web(?:-?dl|rip)?|x26[45]|hevc|bluray)\b/i
    const TIMEOUT_MS = 60000
    const STALKER_UA =
        "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3"

    function enc(value) {
        return encodeURIComponent(value)
    }

    function originOf(url) {
        const match = (url || "").match(/^https?:\/\/[^\/?#]+/i)
        return match ? match[0] : null
    }

    function hostOf(url) {
        const match = (url || "").match(/^https?:\/\/([^\/?#]+)/i)
        return match ? match[1] : "Lista"
    }

    function lineFeeder(emit) {
        let pending = null
        const attrRe = /([a-zA-Z0-9-]+)="([^"]*)"/g
        return function (line) {
            line = line.trim()
            if (!line) return
            if (line.indexOf("#EXTINF") === 0) {
                const map = {}
                let match
                attrRe.lastIndex = 0
                while ((match = attrRe.exec(line)) !== null) map[match[1].toLowerCase()] = match[2]
                const name = line.match(/,(.*)$/)
                pending = {
                    name: name ? name[1].trim() : "Canal",
                    group: map["group-title"] || "Otros",
                    logo: map["tvg-logo"] || "",
                }
                return
            }
            if (line.charAt(0) === "#" || !pending) return
            pending.url = line
            emit(pending, classify(line, pending.group, pending.name))
            pending = null
        }
    }

    function classify(url, group, name) {
        if (MOVIE_PATH.test(url)) return "movie"
        if (SERIES_PATH.test(url)) return "episode"
        // Group names are not trusted on their own: "Cine" is as often a live channel pack.
        if (LIVE_PATH.test(url) || !VOD_FILE.test(url)) return "live"
        return parseEpisode(name) || SERIES_GROUP.test(group || "") ? "episode" : "movie"
    }

    function cleanShow(value) {
        let show = (value || "").replace(/^[\s._:|-]+|[\s._:|-]+$/g, "")
        if (show.indexOf(" ") === -1) show = show.replace(/[._]+/g, " ")
        return show.trim()
    }

    function parseEpisode(name) {
        const value = name || ""
        const match = value.match(EPISODE_SE) || value.match(EPISODE_X)
        if (!match || !cleanShow(match[1])) return null
        return {
            show: cleanShow(match[1]),
            season: Number(match[2]),
            episode: Number(match[3]),
            title: RELEASE_TAG.test(cleanShow(match[4])) ? "" : cleanShow(match[4]),
        }
    }

    function parseTitle(name) {
        const value = (name || "").trim()
        const match = value.match(YEAR)
        if (!match) return { title: value, year: null }
        return { title: value.slice(0, match.index).trim() || value, year: Number(match[1]) }
    }

    function liveCollector() {
        const channels = []
        return {
            add(entry, kind) {
                if (kind === "live") channels.push(entry)
            },
            count() {
                return channels.length
            },
            result() {
                return channels
            },
        }
    }

    function catalogCollector() {
        const movies = []
        const episodes = []
        return {
            add(entry, kind) {
                if (kind === "movie") movies.push(entry)
                else if (kind === "episode") episodes.push(entry)
            },
            count() {
                return movies.length + episodes.length
            },
            result() {
                return buildCatalog(movies, episodes)
            },
        }
    }

    function parseWith(text, collector) {
        const feed = lineFeeder(collector.add)
        const lines = text.split("\n")
        for (let i = 0; i < lines.length; i++) feed(lines[i])
        return collector.result()
    }

    function parseM3u(text) {
        return parseWith(text, liveCollector())
    }

    function parseM3uCatalog(text) {
        return parseWith(text, catalogCollector())
    }

    function asMovie(entry) {
        const parsed = parseTitle(entry.name)
        return {
            kind: "movie",
            id: entry.url,
            name: parsed.title,
            year: parsed.year,
            group: entry.group,
            logo: entry.logo,
            rating: null,
            added: 0,
            url: entry.url,
        }
    }

    // A playlist has no series, only episodes: they are gathered under the show their title
    // names. One with no season or episode in it is a show of its own.
    function buildCatalog(movies, episodes) {
        const shows = {}
        const order = []
        episodes.forEach((entry) => {
            const parsed = parseEpisode(entry.name)
            const season = entry.name.match(SEASON_ONLY)
            const show = parsed
                ? parsed.show
                : season
                  ? cleanShow(season[1]) || entry.name
                  : entry.name
            const title = parseTitle(show)
            const key = title.title.toLowerCase()
            if (!shows[key]) {
                shows[key] = {
                    kind: "series",
                    id: `m3u:${key}`,
                    name: title.title,
                    year: title.year,
                    group: entry.group,
                    logo: entry.logo,
                    rating: null,
                    added: 0,
                    episodes: [],
                }
                order.push(key)
            }
            shows[key].episodes.push({
                kind: "episode",
                id: entry.url,
                season: parsed ? parsed.season : season ? Number(season[2]) : null,
                episode: parsed ? parsed.episode : null,
                title: (parsed && parsed.title) || entry.name,
                logo: entry.logo,
                url: entry.url,
            })
        })
        return {
            movies: movies.map(asMovie),
            series: order.map((key) => {
                return shows[key]
            }),
        }
    }

    // Seasons in order, episodes in order inside each; the unnumbered ones keep the order the
    // provider gave them and go in a season 0 of their own.
    function seasonsOf(episodes) {
        const seasons = {}
        ;(episodes || []).forEach((episode, index) => {
            const number = episode.season || 0
            seasons[number] = seasons[number] || { number, episodes: [] }
            seasons[number].episodes.push({ episode, index })
        })
        return Object.keys(seasons)
            .map(Number)
            .sort((a, b) => {
                return a - b
            })
            .map((number) => {
                const season = seasons[number]
                season.episodes.sort((a, b) => {
                    const left = a.episode.episode === null ? Infinity : a.episode.episode
                    const right = b.episode.episode === null ? Infinity : b.episode.episode
                    return left - right || a.index - b.index
                })
                season.episodes = season.episodes.map((item) => {
                    return item.episode
                })
                return season
            })
    }

    function withTimeout(promise, message) {
        return new Promise((resolve, reject) => {
            let settled = false
            const timer = setTimeout(() => {
                if (settled) return
                settled = true
                reject(new Error(message))
            }, TIMEOUT_MS)
            promise.then(
                (value) => {
                    if (settled) return
                    settled = true
                    clearTimeout(timer)
                    resolve(value)
                },
                (error) => {
                    if (settled) return
                    settled = true
                    clearTimeout(timer)
                    reject(error)
                },
            )
        })
    }

    function fetchJson(url, headers) {
        return fetch(url, headers ? { headers } : undefined).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json()
        })
    }

    function readStream(res, onProgress, collector) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let tail = ""
        const feed = lineFeeder(collector.add)

        function step() {
            return reader.read().then((result) => {
                if (result.done) {
                    if (tail) feed(tail)
                    return collector.result()
                }
                const chunk = tail + decoder.decode(result.value, { stream: true })
                const lines = chunk.split("\n")
                tail = lines.pop()
                for (let i = 0; i < lines.length; i++) feed(lines[i])
                if (onProgress) onProgress({ label: "Downloading", count: collector.count() })
                return step()
            })
        }
        return step()
    }

    function loadM3uUrl(url, onProgress, collector) {
        const into = collector || liveCollector()
        if (onProgress) onProgress({ label: "Connecting" })
        return withTimeout(fetch(url), "The playlist is not responding").then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            const canStream = res.body && res.body.getReader && typeof TextDecoder !== "undefined"
            if (canStream) return readStream(res, onProgress, into)

            return res.text().then((text) => {
                return parseWith(text, into)
            })
        })
    }

    function loadM3uText(text, onProgress) {
        if (onProgress) onProgress({ label: "Reading" })
        const channels = parseM3u(text)
        if (!channels.length) throw new Error("That text has no channels (missing #EXTM3U?)")
        return Promise.resolve(channels)
    }

    function parseXtreamUrl(url) {
        if (!url || !/^https?:\/\/[^\/?#]+\/(?:get|player_api|panel_api)\.php/i.test(url))
            return null
        const origin = originOf(url)
        const user = url.match(/[?&]username=([^&]*)/i)
        const pass = url.match(/[?&]password=([^&]*)/i)
        if (!origin || !user || !pass || !user[1] || !pass[1]) return null
        return {
            origin,
            user: decodeURIComponent(user[1]),
            pass: decodeURIComponent(pass[1]),
        }
    }

    function parsePortal(url, user, pass) {
        const parsed = parseXtreamUrl(url)
        if (parsed) return parsed
        const origin = originOf(url)
        if (!origin || !user || !pass) return null
        return { origin, user, pass }
    }

    function loadXtream(portal, onProgress) {
        const base = `${portal.origin}/player_api.php?username=${enc(portal.user)}&password=${enc(
            portal.pass,
        )}`
        const groups = {}
        let streams = null

        if (onProgress) onProgress({ label: "Fetching categories" })
        return withTimeout(
            fetchJson(`${base}&action=get_live_categories`).catch(() => {
                return []
            }),
            "The panel is not responding",
        )
            .then((categories) => {
                ;(categories || []).forEach((category) => {
                    groups[category.category_id] = category.category_name
                })
                if (onProgress) onProgress({ label: "Downloading" })
                return withTimeout(
                    fetchJson(`${base}&action=get_live_streams`),
                    "The panel is not responding",
                )
            })
            .then((list) => {
                if (!list || !list.length) throw new Error("The playlist has no live channels")
                streams = list
                if (onProgress) onProgress({ label: "Preparing", count: streams.length })
                return streams.map((stream) => {
                    return {
                        name: stream.name || "Canal",
                        group: groups[stream.category_id] || "Otros",
                        logo: stream.stream_icon || "",
                        streamId: String(stream.stream_id),
                        url: `${portal.origin}/live/${enc(portal.user)}/${enc(portal.pass)}/${
                            stream.stream_id
                        }.ts`,
                    }
                })
            })
    }

    function xtreamBase(portal) {
        return `${portal.origin}/player_api.php?username=${enc(portal.user)}&password=${enc(
            portal.pass,
        )}`
    }

    function categoryNames(base, action) {
        return withTimeout(
            fetchJson(`${base}&action=${action}`).catch(() => {
                return []
            }),
            "The panel is not responding",
        ).then((categories) => {
            const names = {}
            ;(Array.isArray(categories) ? categories : []).forEach((category) => {
                names[category.category_id] = category.category_name
            })
            return names
        })
    }

    // Panels send the rating as "7.4", 7.4, "" or 0, and some only the five-star one.
    function ratingOf(item) {
        const ten = parseFloat(item && item.rating)
        if (ten > 0) return Math.round(ten * 10) / 10
        const five = parseFloat(item && item.rating_5based)
        return five > 0 ? Math.round(five * 20) / 10 : null
    }

    function secondsOf(info) {
        const exact = Number(info && info.duration_secs)
        if (exact > 0) return exact
        const parts = String((info && info.duration) || "").match(/^(\d+):(\d{2}):(\d{2})$/)
        return parts ? Number(parts[1]) * 3600 + Number(parts[2]) * 60 + Number(parts[3]) : null
    }

    function yearOf(value) {
        const match = String(value || "").match(/\b((?:19|20)\d{2})\b/)
        return match ? Number(match[1]) : null
    }

    function vodUrl(portal, path, id, ext) {
        return `${portal.origin}/${path}/${enc(portal.user)}/${enc(portal.pass)}/${id}.${
            ext || "mp4"
        }`
    }

    function loadXtreamMovies(portal, onProgress) {
        const base = xtreamBase(portal)
        let groups = {}
        if (onProgress) onProgress({ label: "Fetching categories" })
        return categoryNames(base, "get_vod_categories")
            .then((names) => {
                groups = names
                if (onProgress) onProgress({ label: "Downloading" })
                return withTimeout(
                    fetchJson(`${base}&action=get_vod_streams`),
                    "The panel is not responding",
                )
            })
            .then((list) => {
                const streams = Array.isArray(list) ? list : []
                if (onProgress) onProgress({ label: "Preparing", count: streams.length })
                return streams.map((stream) => {
                    const id = String(stream.stream_id)
                    const parsed = parseTitle(stream.name || "")
                    return {
                        kind: "movie",
                        id,
                        name: parsed.title || "Movie",
                        year: parsed.year || yearOf(stream.year),
                        group: groups[stream.category_id] || "Otros",
                        logo: stream.stream_icon || "",
                        rating: ratingOf(stream),
                        added: Number(stream.added) || 0,
                        ext: stream.container_extension || "mp4",
                        url: vodUrl(portal, "movie", id, stream.container_extension),
                    }
                })
            })
    }

    function loadXtreamSeries(portal, onProgress) {
        const base = xtreamBase(portal)
        let groups = {}
        if (onProgress) onProgress({ label: "Fetching categories" })
        return categoryNames(base, "get_series_categories")
            .then((names) => {
                groups = names
                if (onProgress) onProgress({ label: "Downloading" })
                return withTimeout(
                    fetchJson(`${base}&action=get_series`),
                    "The panel is not responding",
                )
            })
            .then((list) => {
                const shows = Array.isArray(list) ? list : []
                if (onProgress) onProgress({ label: "Preparing", count: shows.length })
                return shows.map((show) => {
                    const parsed = parseTitle(show.name || "")
                    return {
                        kind: "series",
                        id: String(show.series_id),
                        name: parsed.title || "Series",
                        year: parsed.year || yearOf(show.releaseDate || show.release_date),
                        group: groups[show.category_id] || "Otros",
                        logo: show.cover || "",
                        rating: ratingOf(show),
                        added: Number(show.last_modified) || 0,
                        plot: show.plot || "",
                    }
                })
            })
    }

    function firstOf(value) {
        return Array.isArray(value) ? value[0] || "" : value || ""
    }

    // An empty info comes back as [] on some panels: every field is optional here.
    function infoFields(info) {
        const data = info && !Array.isArray(info) ? info : {}
        return {
            plot: data.plot || data.description || "",
            cast: data.cast || data.actors || "",
            director: data.director || "",
            genre: data.genre || "",
            year: yearOf(data.releasedate || data.releaseDate || data.release_date),
            duration: secondsOf(data),
            rating: ratingOf(data),
            backdrop: firstOf(data.backdrop_path),
            poster: data.movie_image || data.cover || data.cover_big || "",
        }
    }

    function loadXtreamMovieInfo(portal, item) {
        const api = `${xtreamBase(portal)}&action=get_vod_info&vod_id=${enc(item.id)}`
        return withTimeout(fetchJson(api), "The panel is not responding").then((data) => {
            const fields = infoFields(data && data.info)
            const movie = (data && data.movie_data) || {}
            if (movie.container_extension && movie.container_extension !== item.ext)
                fields.url = vodUrl(portal, "movie", item.id, movie.container_extension)
            return fields
        })
    }

    function loadXtreamSeriesInfo(portal, item) {
        const api = `${xtreamBase(portal)}&action=get_series_info&series_id=${enc(item.id)}`
        return withTimeout(fetchJson(api), "The panel is not responding").then((data) => {
            const fields = infoFields(data && data.info)
            const raw = (data && data.episodes) || {}
            const episodes = []
            // Keyed by season number, or a plain array when the panel's keys ran 0..n.
            Object.keys(raw).forEach((key) => {
                ;(Array.isArray(raw[key]) ? raw[key] : [raw[key]]).forEach((episode) => {
                    if (!episode || episode.id === undefined) return
                    const info = episode.info && !Array.isArray(episode.info) ? episode.info : {}
                    const id = String(episode.id)
                    episodes.push({
                        kind: "episode",
                        id,
                        season: Number(episode.season || key) || null,
                        episode: Number(episode.episode_num) || null,
                        title: episode.title || "",
                        plot: info.plot || "",
                        duration: secondsOf(info),
                        logo: info.movie_image || "",
                        url: vodUrl(portal, "series", id, episode.container_extension),
                    })
                })
            })
            fields.seasons = seasonsOf(episodes)
            return fields
        })
    }

    function portalOf(list) {
        return list.origin
            ? { origin: list.origin, user: list.user, pass: list.pass }
            : parsePortal(list.url, list.user, list.pass)
    }

    function isXtream(list) {
        return list.kind === "xtream" || !!list.user
    }

    // Movies and series, fetched apart from the channels and only when asked for. A playlist
    // holds both kinds in one download, so it answers with both; a panel, with the one asked.
    function loadCatalog(list, kind, onProgress) {
        if (!list) return Promise.reject(new Error("Unknown source"))
        if (list.kind === "stalker")
            return Promise.reject(new Error("Movies and series from Stalker are not supported yet"))

        if (isXtream(list)) {
            const portal = portalOf(list)
            if (!portal) return Promise.reject(new Error("Server, username or password missing"))
            if (kind === "series")
                return loadXtreamSeries(portal, onProgress).then((series) => {
                    return { series }
                })
            return loadXtreamMovies(portal, onProgress).then((movies) => {
                return { movies }
            })
        }

        if (list.source === "text") {
            if (onProgress) onProgress({ label: "Reading" })
            return Promise.resolve(parseM3uCatalog(list.text || ""))
        }
        if (list.source === "url" || list.url)
            return loadM3uUrl(list.url, onProgress, catalogCollector())
        return Promise.reject(new Error("I do not know how to load that source"))
    }

    // What the catalog row does not carry. A playlist knows nothing more than its titles,
    // except the episodes it already gathered.
    function loadInfo(list, item) {
        if (!list || !item) return Promise.reject(new Error("Unknown title"))
        if (isXtream(list)) {
            const portal = portalOf(list)
            if (!portal) return Promise.reject(new Error("Server, username or password missing"))
            return item.kind === "series"
                ? loadXtreamSeriesInfo(portal, item)
                : loadXtreamMovieInfo(portal, item)
        }
        if (item.kind === "series") return Promise.resolve({ seasons: seasonsOf(item.episodes) })
        return Promise.resolve({})
    }

    function parseLiveUrl(url) {
        const match = (url || "").match(
            /^(https?:\/\/[^\/?#]+)\/live\/([^\/]+)\/([^\/]+)\/([^\/.]+)\.(?:ts|m3u8)/i,
        )
        if (!match) return null
        return {
            origin: match[1],
            user: decodeURIComponent(match[2]),
            pass: decodeURIComponent(match[3]),
            id: match[4],
        }
    }

    function loadNowPlaying(url) {
        const live = parseLiveUrl(url)
        if (!live) return Promise.resolve(null)
        const api = `${live.origin}/player_api.php?username=${enc(live.user)}&password=${enc(
            live.pass,
        )}&action=get_short_epg&stream_id=${enc(live.id)}&limit=3`
        return Promise.resolve()
            .then(() => {
                return fetchJson(api)
            })
            .then((data) => {
                const list = data && data.epg_listings
                if (!list || !list.length) return []
                return list.map((item) => {
                    return {
                        title: decodeBase64(item.title) || item.title || "",
                        description: decodeBase64(item.description) || "",
                        start: decodeBase64(item.start) || "",
                        end: decodeBase64(item.end) || "",
                    }
                })
            })
            .catch(() => {
                return []
            })
    }

    function decodeBase64(value) {
        if (!value) return ""
        try {
            return decodeURIComponent(escape(atob(value)))
        } catch {
            return ""
        }
    }

    function stalkerCall(endpoint, mac, params, token) {
        const query = `type=stb&mac=${enc(mac)}&token=${enc(token || "")}&${params}`
        const headers = {
            "User-Agent": STALKER_UA,
            Cookie: `mac=${mac}; stb_lang=es; timezone=Europe/Madrid`,
            Referer: `${originOf(endpoint)}/c/`,
        }
        if (token) headers.Authorization = `Bearer ${token}`
        return withTimeout(
            fetchJson(`${endpoint}?${query}`, headers),
            "The Stalker portal is not responding",
        )
    }

    const STALKER_PATHS = ["/portal.php", "/stalker_portal/server/load.php", "/server/load.php"]

    function stalkerEndpoints(portal) {
        if (/\.php$/i.test(portal)) return [portal]
        return STALKER_PATHS.map((path) => {
            return portal + path
        })
    }

    function firstEndpoint(endpoints, run) {
        let index = 0
        function step() {
            if (index >= endpoints.length)
                return Promise.reject(new Error("The Stalker portal is not responding"))
            const endpoint = endpoints[index++]
            return run(endpoint).then((value) => {
                return { endpoint, value }
            }, step)
        }
        return step()
    }

    function loadStalker(list, onProgress) {
        const portal = (list.origin || "").replace(/\/+$/, "")
        const mac = list.mac
        if (!portal || !mac) return Promise.reject(new Error("Portal or MAC missing"))

        if (onProgress) onProgress({ label: "Fetching categories" })
        return firstEndpoint(stalkerEndpoints(portal), (endpoint) => {
            return stalkerCall(endpoint, mac, "action=handshake&prehash=0")
        }).then((hello) => {
            const token = (hello.value && hello.value.js && hello.value.js.token) || ""
            if (!token) throw new Error("The portal gave no token (MAC not authorised?)")
            // What a real set-top box does, and strict portals refuse the content calls
            // until the session is opened here. Both the token and the endpoint that
            // answered are kept on the list: create_link needs them later.
            list.token = token
            list.endpoint = hello.endpoint
            if (onProgress) onProgress({ label: "Downloading" })
            return stalkerCall(hello.endpoint, mac, "action=get_profile", token)
                .catch(() => {})
                .then(() => {
                    return stalkerCall(hello.endpoint, mac, "action=get_all_channels", token)
                })
                .then((data) => {
                    const genres = {}
                    return stalkerCall(hello.endpoint, mac, "action=get_genres", token)
                        .then((genresData) => {
                            ;(genresData && genresData.js ? genresData.js : []).forEach((genre) => {
                                genres[String(genre.id)] = genre.title
                            })
                        })
                        .catch(() => {})
                        .then(() => {
                            const rows =
                                data && data.js && data.js.data
                                    ? data.js.data
                                    : (data && data.js) || []
                            if (!rows.length) throw new Error("The portal returned no channels")
                            return rows.map((row) => {
                                return {
                                    name: row.name || "Canal",
                                    group: genres[String(row.tv_genre_id)] || "Otros",
                                    logo: row.logo || row.tv_icon || "",
                                    cmd: row.cmd || row.cmds || "",
                                    streamId: String(row.id || ""),
                                    url: "",
                                }
                            })
                        })
                })
        })
    }

    function resolveStalkerUrl(list, channel) {
        const endpoint = list.endpoint || `${(list.origin || "").replace(/\/+$/, "")}/portal.php`
        return stalkerCall(
            endpoint,
            list.mac,
            `action=create_link&cmd=${enc(channel.cmd)}`,
            list.token,
        ).then((data) => {
            const cmd = data && data.js && data.js.cmd
            if (!cmd) throw new Error("The portal returned no stream address")
            return cmd.replace(/^ffmpeg\s+/i, "").replace(/^auto\s+/i, "")
        })
    }

    function parseAuto(text, name) {
        const value = (text || "").trim()
        if (!value) return { error: "Paste the address, the credentials or the playlist text" }

        if (/^#EXTM3U/i.test(value) || /#EXTINF/i.test(value)) {
            return {
                list: { kind: "m3u", source: "text", text: value, name: name || "Pasted list" },
            }
        }

        const macMatch = value.match(/\b(?:[0-9A-F]{2}:){5}[0-9A-F]{2}\b/i)
        const urlMatch = value.match(/https?:\/\/[^\s"'<>]+/i)
        const userMatch = value.match(/(?:user(?:name)?|usuario)\s*[:=]\s*([^\s,;]+)/i)
        const passMatch = value.match(
            /(?:pass(?:word)?|contrase(?:n|ñ)a|clave)\s*[:=]\s*([^\s,;]+)/i,
        )

        if (macMatch && urlMatch) {
            return {
                list: {
                    kind: "stalker",
                    source: "mac",
                    mac: macMatch[0].toUpperCase(),
                    origin: originOf(urlMatch[0]) || urlMatch[0].replace(/\/+$/, ""),
                    name: name || hostOf(urlMatch[0]),
                },
            }
        }

        if (urlMatch) {
            const url = urlMatch[0]
            const inline = parseXtreamUrl(url)
            if (inline) {
                return {
                    list: {
                        kind: "xtream",
                        source: "url",
                        url,
                        name: name || hostOf(url),
                        user: inline.user,
                        pass: inline.pass,
                        origin: inline.origin,
                    },
                }
            }
            if (userMatch && passMatch) {
                const origin = originOf(url) || url
                return {
                    list: {
                        kind: "xtream",
                        source: "creds",
                        origin,
                        user: userMatch[1],
                        pass: passMatch[1],
                        name: name || hostOf(origin),
                    },
                }
            }
            return { list: { kind: "m3u", source: "url", url, name: name || hostOf(url) } }
        }

        return { error: "No playlist, portal or MAC found in that text" }
    }

    function load(list, onProgress) {
        if (!list) return Promise.reject(new Error("Unknown source"))

        if (list.kind === "stalker") {
            return loadStalker(list, onProgress).then((channels) => {
                return channels
            })
        }

        if (isXtream(list)) {
            const portal = portalOf(list)
            if (!portal) return Promise.reject(new Error("Server, username or password missing"))
            return loadXtream(portal, onProgress)
        }

        if (list.source === "text") return loadM3uText(list.text, onProgress)
        if (list.source === "url" || list.url) return loadM3uUrl(list.url, onProgress)
        return Promise.reject(new Error("I do not know how to load that source"))
    }

    function match(channels, query) {
        const needle = (query || "").trim().toLowerCase()
        if (!needle) return channels
        const found = []
        for (let i = 0; i < channels.length; i++) {
            const channel = channels[i]
            if (channel.searchKey === undefined) channel.searchKey = channel.name.toLowerCase()
            if (channel.searchKey.indexOf(needle) !== -1) found.push(channel)
        }
        return found
    }

    return {
        load,
        loadCatalog,
        loadInfo,
        match,
        parseM3u,
        parseM3uCatalog,
        classify,
        parseEpisode,
        parseTitle,
        seasonsOf,
        parseXtreamUrl,
        parsePortal,
        parseLiveUrl,
        parseAuto,
        loadNowPlaying,
        resolveStalkerUrl,
        hostOf,
        originOf,
    }
})()
