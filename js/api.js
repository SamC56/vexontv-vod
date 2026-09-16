var App = App || {}

App.api = (function () {
    var MOVIE_OR_SERIES = /\/(?:movie|series)\//i
    var TIMEOUT_MS = 60000
    var STALKER_UA =
        "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3"

    function enc(value) {
        return encodeURIComponent(value)
    }

    function originOf(url) {
        var match = (url || "").match(/^https?:\/\/[^\/?#]+/i)
        return match ? match[0] : null
    }

    function hostOf(url) {
        var match = (url || "").match(/^https?:\/\/([^\/?#]+)/i)
        return match ? match[1] : "Lista"
    }

    function lineFeeder(emit) {
        var pending = null
        var attrRe = /([a-zA-Z0-9-]+)="([^"]*)"/g
        return function (line) {
            line = line.trim()
            if (!line) return
            if (line.indexOf("#EXTINF") === 0) {
                var map = {},
                    match
                attrRe.lastIndex = 0
                while ((match = attrRe.exec(line)) !== null) map[match[1].toLowerCase()] = match[2]
                var name = line.match(/,(.*)$/)
                pending = {
                    name: name ? name[1].trim() : "Canal",
                    group: map["group-title"] || "Otros",
                    logo: map["tvg-logo"] || "",
                }
                return
            }
            if (line.charAt(0) === "#" || !pending) return
            if (MOVIE_OR_SERIES.test(line)) {
                pending = null
                return
            }
            pending.url = line
            emit(pending)
            pending = null
        }
    }

    function parseM3u(text) {
        var channels = []
        var feed = lineFeeder(function (channel) {
            channels.push(channel)
        })
        var lines = text.split("\n")
        for (var i = 0; i < lines.length; i++) feed(lines[i])
        return channels
    }

    function withTimeout(promise, message) {
        return new Promise(function (resolve, reject) {
            var settled = false
            var timer = setTimeout(function () {
                if (settled) return
                settled = true
                reject(new Error(message))
            }, TIMEOUT_MS)
            promise.then(
                function (value) {
                    if (settled) return
                    settled = true
                    clearTimeout(timer)
                    resolve(value)
                },
                function (error) {
                    if (settled) return
                    settled = true
                    clearTimeout(timer)
                    reject(error)
                },
            )
        })
    }

    function fetchJson(url, headers) {
        return fetch(url, headers ? { headers: headers } : undefined).then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status)
            return res.json()
        })
    }

    function readStream(res, onProgress) {
        var reader = res.body.getReader()
        var decoder = new TextDecoder()
        var channels = []
        var tail = ""
        var feed = lineFeeder(function (channel) {
            channels.push(channel)
        })

        function step() {
            return reader.read().then(function (result) {
                if (result.done) {
                    if (tail) feed(tail)
                    return channels
                }
                var chunk = tail + decoder.decode(result.value, { stream: true })
                var lines = chunk.split("\n")
                tail = lines.pop()
                for (var i = 0; i < lines.length; i++) feed(lines[i])
                if (onProgress) onProgress({ label: "Downloading", count: channels.length })
                return step()
            })
        }
        return step()
    }

    function loadM3uUrl(url, onProgress) {
        if (onProgress) onProgress({ label: "Connecting" })
        return withTimeout(fetch(url), "The playlist is not responding").then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status)

            var canStream = res.body && res.body.getReader && typeof TextDecoder !== "undefined"
            if (canStream) return readStream(res, onProgress)

            return res.text().then(parseM3u)
        })
    }

    function loadM3uText(text, onProgress) {
        if (onProgress) onProgress({ label: "Reading" })
        var channels = parseM3u(text)
        if (!channels.length) throw new Error("That text has no channels (missing #EXTM3U?)")
        return Promise.resolve(channels)
    }

    function parseXtreamUrl(url) {
        if (!url || !/^https?:\/\/[^\/?#]+\/(?:get|player_api|panel_api)\.php/i.test(url))
            return null
        var origin = originOf(url)
        var user = url.match(/[?&]username=([^&]*)/i)
        var pass = url.match(/[?&]password=([^&]*)/i)
        if (!origin || !user || !pass || !user[1] || !pass[1]) return null
        return {
            origin: origin,
            user: decodeURIComponent(user[1]),
            pass: decodeURIComponent(pass[1]),
        }
    }

    function parsePortal(url, user, pass) {
        var parsed = parseXtreamUrl(url)
        if (parsed) return parsed
        var origin = originOf(url)
        if (!origin || !user || !pass) return null
        return { origin: origin, user: user, pass: pass }
    }

    function loadXtream(portal, onProgress) {
        var base =
            portal.origin +
            "/player_api.php?username=" +
            enc(portal.user) +
            "&password=" +
            enc(portal.pass)
        var groups = {}
        var streams = null

        if (onProgress) onProgress({ label: "Fetching categories" })
        return withTimeout(
            fetchJson(base + "&action=get_live_categories").catch(function () {
                return []
            }),
            "The panel is not responding",
        )
            .then(function (categories) {
                ;(categories || []).forEach(function (category) {
                    groups[category.category_id] = category.category_name
                })
                if (onProgress) onProgress({ label: "Downloading" })
                return withTimeout(
                    fetchJson(base + "&action=get_live_streams"),
                    "The panel is not responding",
                )
            })
            .then(function (list) {
                if (!list || !list.length) throw new Error("The playlist has no live channels")
                streams = list
                if (onProgress) onProgress({ label: "Preparing", count: streams.length })
                return streams.map(function (stream) {
                    return {
                        name: stream.name || "Canal",
                        group: groups[stream.category_id] || "Otros",
                        logo: stream.stream_icon || "",
                        streamId: String(stream.stream_id),
                        url:
                            portal.origin +
                            "/live/" +
                            enc(portal.user) +
                            "/" +
                            enc(portal.pass) +
                            "/" +
                            stream.stream_id +
                            ".ts",
                    }
                })
            })
    }

    function parseLiveUrl(url) {
        var match = (url || "").match(
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
        var live = parseLiveUrl(url)
        if (!live) return Promise.resolve(null)
        var api =
            live.origin +
            "/player_api.php?username=" +
            enc(live.user) +
            "&password=" +
            enc(live.pass) +
            "&action=get_short_epg&stream_id=" +
            enc(live.id) +
            "&limit=3"
        return Promise.resolve()
            .then(function () {
                return fetchJson(api)
            })
            .then(function (data) {
                var list = data && data.epg_listings
                if (!list || !list.length) return []
                return list.map(function (item) {
                    return {
                        title: decodeBase64(item.title) || item.title || "",
                        description: decodeBase64(item.description) || "",
                        start: decodeBase64(item.start) || "",
                        end: decodeBase64(item.end) || "",
                    }
                })
            })
            .catch(function () {
                return []
            })
    }

    function decodeBase64(value) {
        if (!value) return ""
        try {
            return decodeURIComponent(escape(atob(value)))
        } catch (error) {
            return ""
        }
    }

    function stalkerCall(endpoint, mac, params, token) {
        var query = "type=stb&mac=" + enc(mac) + "&token=" + enc(token || "") + "&" + params
        var headers = {
            "User-Agent": STALKER_UA,
            Cookie: "mac=" + mac + "; stb_lang=es; timezone=Europe/Madrid",
            Referer: originOf(endpoint) + "/c/",
        }
        if (token) headers.Authorization = "Bearer " + token
        return withTimeout(
            fetchJson(endpoint + "?" + query, headers),
            "The Stalker portal is not responding",
        )
    }

    var STALKER_PATHS = ["/portal.php", "/stalker_portal/server/load.php", "/server/load.php"]

    function stalkerEndpoints(portal) {
        if (/\.php$/i.test(portal)) return [portal]
        return STALKER_PATHS.map(function (path) {
            return portal + path
        })
    }

    function firstEndpoint(endpoints, run) {
        var index = 0
        function step() {
            if (index >= endpoints.length)
                return Promise.reject(new Error("The Stalker portal is not responding"))
            var endpoint = endpoints[index++]
            return run(endpoint).then(function (value) {
                return { endpoint: endpoint, value: value }
            }, step)
        }
        return step()
    }

    function loadStalker(list, onProgress) {
        var portal = (list.origin || "").replace(/\/+$/, "")
        var mac = list.mac
        if (!portal || !mac) return Promise.reject(new Error("Portal or MAC missing"))

        if (onProgress) onProgress({ label: "Fetching categories" })
        return firstEndpoint(stalkerEndpoints(portal), function (endpoint) {
            return stalkerCall(endpoint, mac, "action=handshake&prehash=0")
        }).then(function (hello) {
            var token = (hello.value && hello.value.js && hello.value.js.token) || ""
            if (!token) throw new Error("The portal gave no token (MAC not authorised?)")
            // What a real set-top box does, and strict portals refuse the content calls
            // until the session is opened here. Both the token and the endpoint that
            // answered are kept on the list: create_link needs them later.
            list.token = token
            list.endpoint = hello.endpoint
            if (onProgress) onProgress({ label: "Downloading" })
            return stalkerCall(hello.endpoint, mac, "action=get_profile", token)
                .catch(function () {})
                .then(function () {
                    return stalkerCall(hello.endpoint, mac, "action=get_all_channels", token)
                })
                .then(function (data) {
                    var genres = {}
                    return stalkerCall(hello.endpoint, mac, "action=get_genres", token)
                        .then(function (genresData) {
                            ;(genresData && genresData.js ? genresData.js : []).forEach(
                                function (genre) {
                                    genres[String(genre.id)] = genre.title
                                },
                            )
                        })
                        .catch(function () {})
                        .then(function () {
                            var rows =
                                data && data.js && data.js.data
                                    ? data.js.data
                                    : (data && data.js) || []
                            if (!rows.length) throw new Error("The portal returned no channels")
                            return rows.map(function (row) {
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
        var endpoint = list.endpoint || (list.origin || "").replace(/\/+$/, "") + "/portal.php"
        return stalkerCall(
            endpoint,
            list.mac,
            "action=create_link&cmd=" + enc(channel.cmd),
            list.token,
        ).then(function (data) {
            var cmd = data && data.js && data.js.cmd
            if (!cmd) throw new Error("The portal returned no stream address")
            return cmd.replace(/^ffmpeg\s+/i, "").replace(/^auto\s+/i, "")
        })
    }

    function parseAuto(text, name) {
        var value = (text || "").trim()
        if (!value) return { error: "Paste the address, the credentials or the playlist text" }

        if (/^#EXTM3U/i.test(value) || /#EXTINF/i.test(value)) {
            return {
                list: { kind: "m3u", source: "text", text: value, name: name || "Pasted list" },
            }
        }

        var macMatch = value.match(/\b(?:[0-9A-F]{2}:){5}[0-9A-F]{2}\b/i)
        var urlMatch = value.match(/https?:\/\/[^\s"'<>]+/i)
        var userMatch = value.match(/(?:user(?:name)?|usuario)\s*[:=]\s*([^\s,;]+)/i)
        var passMatch = value.match(/(?:pass(?:word)?|contrase(?:n|ñ)a|clave)\s*[:=]\s*([^\s,;]+)/i)

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
            var url = urlMatch[0]
            var inline = parseXtreamUrl(url)
            if (inline) {
                return {
                    list: {
                        kind: "xtream",
                        source: "url",
                        url: url,
                        name: name || hostOf(url),
                        user: inline.user,
                        pass: inline.pass,
                        origin: inline.origin,
                    },
                }
            }
            if (userMatch && passMatch) {
                var origin = originOf(url) || url
                return {
                    list: {
                        kind: "xtream",
                        source: "creds",
                        origin: origin,
                        user: userMatch[1],
                        pass: passMatch[1],
                        name: name || hostOf(origin),
                    },
                }
            }
            return { list: { kind: "m3u", source: "url", url: url, name: name || hostOf(url) } }
        }

        return { error: "No playlist, portal or MAC found in that text" }
    }

    function load(list, onProgress) {
        if (!list) return Promise.reject(new Error("Unknown source"))

        if (list.kind === "stalker") {
            return loadStalker(list, onProgress).then(function (channels) {
                return channels
            })
        }

        if (list.kind === "xtream" || list.user) {
            var portal = list.origin
                ? { origin: list.origin, user: list.user, pass: list.pass }
                : parsePortal(list.url, list.user, list.pass)
            if (!portal) return Promise.reject(new Error("Server, username or password missing"))
            return loadXtream(portal, onProgress)
        }

        if (list.source === "text") return loadM3uText(list.text, onProgress)
        if (list.source === "url" || list.url) return loadM3uUrl(list.url, onProgress)
        return Promise.reject(new Error("I do not know how to load that source"))
    }

    function match(channels, query) {
        var needle = (query || "").trim().toLowerCase()
        if (!needle) return channels
        var found = []
        for (var i = 0; i < channels.length; i++) {
            var channel = channels[i]
            if (channel.searchKey === undefined) channel.searchKey = channel.name.toLowerCase()
            if (channel.searchKey.indexOf(needle) !== -1) found.push(channel)
        }
        return found
    }

    return {
        load: load,
        match: match,
        parseM3u: parseM3u,
        parseXtreamUrl: parseXtreamUrl,
        parsePortal: parsePortal,
        parseLiveUrl: parseLiveUrl,
        parseAuto: parseAuto,
        loadNowPlaying: loadNowPlaying,
        resolveStalkerUrl: resolveStalkerUrl,
        hostOf: hostOf,
        originOf: originOf,
    }
})()
