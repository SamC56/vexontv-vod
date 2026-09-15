var App = App || {};

// Fuentes en, lista plana de canales out: { name, group, logo, url }.
//
// ponytail: no hay tope de tamano a proposito. Lo hubo (40 MB) porque una lista
// de reseller de 500 MB tumbaba el WebView; el usuario pidio quitarlo para
// ajustarlo en su TV. Lo que SI se mantiene es leer en streaming, que es lo que
// evita el pico de memoria (no se guarda el texto entero ni un array de lineas).
// Si vuelve a colgarse: poner el tope otra vez es una linea en readStream.
//
// Una fuente tiene kind (m3u | xtream | stalker) y source (url | text | creds |
// mac), que es lo que permite luego filtrarlas por tipo:
//   m3u + url    una dirección .m3u / .m3u8
//   m3u + text   contenido pegado (o leido de un fichero)
//   xtream       portal + usuario + contraseña, o una URL que ya los trae
//   stalker      portal + MAC
App.api = (function () {
    var MOVIE_OR_SERIES = /\/(?:movie|series)\//i;
    var TIMEOUT_MS = 60000;
    var STALKER_UA = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';

    function enc(value) { return encodeURIComponent(value); }

    function originOf(url) {
        var match = (url || '').match(/^https?:\/\/[^\/?#]+/i);
        return match ? match[0] : null;
    }

    function hostOf(url) {
        var match = (url || '').match(/^https?:\/\/([^\/?#]+)/i);
        return match ? match[1] : 'Lista';
    }

    // ------------------------------------------------------------------ m3u
    function lineFeeder(emit) {
        var pending = null;
        var attrRe = /([a-zA-Z0-9-]+)="([^"]*)"/g;
        return function (line) {
            line = line.trim();
            if (!line) return;
            if (line.indexOf('#EXTINF') === 0) {
                var map = {}, match;
                attrRe.lastIndex = 0;
                while ((match = attrRe.exec(line)) !== null) map[match[1].toLowerCase()] = match[2];
                var name = line.match(/,(.*)$/);
                pending = {
                    name: name ? name[1].trim() : 'Canal',
                    group: map['group-title'] || 'Otros',
                    logo: map['tvg-logo'] || ''
                };
                return;
            }
            if (line.charAt(0) === '#' || !pending) return;
            if (MOVIE_OR_SERIES.test(line)) { pending = null; return; }
            pending.url = line;
            emit(pending);
            pending = null;
        };
    }

    function parseM3u(text) {
        var channels = [];
        var feed = lineFeeder(function (channel) { channels.push(channel); });
        var lines = text.split('\n');
        for (var i = 0; i < lines.length; i++) feed(lines[i]);
        return channels;
    }

    function withTimeout(promise, message) {
        return new Promise(function (resolve, reject) {
            var settled = false;
            var timer = setTimeout(function () {
                if (settled) return;
                settled = true;
                reject(new Error(message));
            }, TIMEOUT_MS);
            promise.then(function (value) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(value);
            }, function (error) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    function fetchJson(url, headers) {
        return fetch(url, headers ? { headers: headers } : undefined).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        });
    }

    function readStream(res, onProgress) {
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var channels = [];
        var tail = '';
        var feed = lineFeeder(function (channel) { channels.push(channel); });

        function step() {
            return reader.read().then(function (result) {
                if (result.done) {
                    if (tail) feed(tail);
                    return channels;
                }
                var chunk = tail + decoder.decode(result.value, { stream: true });
                var lines = chunk.split('\n');
                tail = lines.pop();
                for (var i = 0; i < lines.length; i++) feed(lines[i]);
                if (onProgress) onProgress({ label: 'Downloading', count: channels.length });
                return step();
            });
        }
        return step();
    }

    // M3U por URL: se lee en streaming y con tope, porque una lista de reseller
    // puede ser de cientos de MB.
    function loadM3uUrl(url, onProgress) {
        if (onProgress) onProgress({ label: 'Connecting' });
        return withTimeout(fetch(url), 'The playlist is not responding').then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);

            var canStream = res.body && res.body.getReader && typeof TextDecoder !== 'undefined';
            if (canStream) return readStream(res, onProgress);

            return res.text().then(parseM3u);
        });
    }

    function loadM3uText(text, onProgress) {
        if (onProgress) onProgress({ label: 'Reading' });
        var channels = parseM3u(text);
        if (!channels.length) throw new Error('That text has no channels (missing #EXTM3U?)');
        return Promise.resolve(channels);
    }

    // ------------------------------------------------------------------ xtream
    function parseXtreamUrl(url) {
        if (!url || !/^https?:\/\/[^\/?#]+\/(?:get|player_api|panel_api)\.php/i.test(url)) return null;
        var origin = originOf(url);
        var user = url.match(/[?&]username=([^&]*)/i);
        var pass = url.match(/[?&]password=([^&]*)/i);
        if (!origin || !user || !pass || !user[1] || !pass[1]) return null;
        return { origin: origin, user: decodeURIComponent(user[1]), pass: decodeURIComponent(pass[1]) };
    }

    function parsePortal(url, user, pass) {
        var parsed = parseXtreamUrl(url);
        if (parsed) return parsed;
        var origin = originOf(url);
        if (!origin || !user || !pass) return null;
        return { origin: origin, user: user, pass: pass };
    }

    function loadXtream(portal, onProgress) {
        var base = portal.origin + '/player_api.php?username=' + enc(portal.user) + '&password=' + enc(portal.pass);
        var groups = {};
        var streams = null;

        if (onProgress) onProgress({ label: 'Fetching categories' });
        return withTimeout(fetchJson(base + '&action=get_live_categories').catch(function () { return []; }), 'The panel is not responding')
            .then(function (categories) {
                (categories || []).forEach(function (category) {
                    groups[category.category_id] = category.category_name;
                });
                if (onProgress) onProgress({ label: 'Downloading' });
                return withTimeout(fetchJson(base + '&action=get_live_streams'), 'The panel is not responding');
            })
            .then(function (list) {
                if (!list || !list.length) throw new Error('The playlist has no live channels');
                streams = list;
                if (onProgress) onProgress({ label: 'Preparing', count: streams.length });
                return streams.map(function (stream) {
                    return {
                        name: stream.name || 'Canal',
                        group: groups[stream.category_id] || 'Otros',
                        logo: stream.stream_icon || '',
                        streamId: String(stream.stream_id),
                        url: portal.origin + '/live/' + enc(portal.user) + '/' + enc(portal.pass) + '/' + stream.stream_id + '.ts'
                    };
                });
            });
    }

    // De una URL de directo .../live/<user>/<pass>/<id>.ts saca lo necesario para
    // volver a hablar con la API del panel (por ejemplo para el EPG).
    function parseLiveUrl(url) {
        var match = (url || '').match(/^(https?:\/\/[^\/?#]+)\/live\/([^\/]+)\/([^\/]+)\/([^\/.]+)\.(?:ts|m3u8)/i);
        if (!match) return null;
        return {
            origin: match[1],
            user: decodeURIComponent(match[2]),
            pass: decodeURIComponent(match[3]),
            id: match[4]
        };
    }

    // "Ahora" en ese canal, si el panel lo sabe. Falla en silencio: el EPG es un
    // extra, no algo por lo que haya que molestar al que esta viendo.
    function loadNowPlaying(url) {
        var live = parseLiveUrl(url);
        if (!live) return Promise.resolve(null);
        var api = live.origin + '/player_api.php?username=' + enc(live.user) + '&password=' + enc(live.pass) +
            '&action=get_short_epg&stream_id=' + enc(live.id) + '&limit=1';
        return Promise.resolve().then(function () { return fetchJson(api); }).then(function (data) {
            var list = data && data.epg_listings;
            if (!list || !list.length) return null;
            var item = list[0];
            return {
                title: decodeBase64(item.title) || item.title || '',
                description: decodeBase64(item.description) || '',
                start: decodeBase64(item.start) || '',
                end: decodeBase64(item.end) || ''
            };
        }).catch(function () { return null; });
    }

    function decodeBase64(value) {
        if (!value) return '';
        try { return decodeURIComponent(escape(atob(value))); } catch (error) { return ''; }
    }

    // ------------------------------------------------------------------ stalker
    // Portal Ministra/Stalker: handshake con la MAC, catalogo de canales y, para
    // reproducir, create_link (devuelve el comando con la URL real).
    function stalkerCall(portal, mac, params, token) {
        var query = 'type=stb&mac=' + enc(mac) + '&token=' + enc(token || '') + '&' + params;
        var headers = {
            'User-Agent': STALKER_UA,
            'Cookie': 'mac=' + mac + '; stb_lang=es; timezone=Europe/Madrid',
            'Referer': portal + '/c/'
        };
        if (token) headers.Authorization = 'Bearer ' + token;
        return withTimeout(fetchJson(portal + '/portal.php?' + query, headers), 'The Stalker portal is not responding');
    }

    function loadStalker(list, onProgress) {
        var portal = (list.origin || '').replace(/\/+$/, '');
        var mac = list.mac;
        if (!portal || !mac) return Promise.reject(new Error('Portal or MAC missing'));

        if (onProgress) onProgress({ label: 'Fetching categories' });
        return stalkerCall(portal, mac, 'action=handshake&prehash=0').then(function (hello) {
            var token = (hello && hello.js && hello.js.token) || '';
            if (!token) throw new Error('The portal gave no token (MAC not authorised?)');
            if (onProgress) onProgress({ label: 'Downloading' });
            return stalkerCall(portal, mac, 'action=get_all_channels', token).then(function (data) {
                var genres = {};
                return stalkerCall(portal, mac, 'action=get_genres', token)
                    .then(function (genresData) {
                        (genresData && genresData.js ? genresData.js : []).forEach(function (genre) {
                            genres[String(genre.id)] = genre.title;
                        });
                    })
                    .catch(function () { /* sin generos: todos a "Otros" */ })
                    .then(function () {
                        var rows = data && data.js && data.js.data ? data.js.data : (data && data.js) || [];
                        if (!rows.length) throw new Error('The portal returned no channels');
                        return rows.map(function (row) {
                            return {
                                name: row.name || 'Canal',
                                group: genres[String(row.tv_genre_id)] || 'Otros',
                                logo: row.logo || row.tv_icon || '',
                                cmd: row.cmd || row.cmds || '',
                                streamId: String(row.id || ''),
                                url: ''
                            };
                        });
                    });
            });
        });
    }

    // Stalker no da la URL en el catalogo: hay que pedirla al vuelo.
    function resolveStalkerUrl(list, channel) {
        var portal = (list.origin || '').replace(/\/+$/, '');
        return stalkerCall(portal, list.mac, 'action=create_link&cmd=' + enc(channel.cmd), list.token)
            .then(function (data) {
                var cmd = data && data.js && data.js.cmd;
                if (!cmd) throw new Error('The portal returned no stream address');
                return cmd.replace(/^ffmpeg\s+/i, '').replace(/^auto\s+/i, '');
            });
    }

    // ------------------------------------------------------------------ tipos
    // Auto-detección: lo que pegue el usuario, sea una URL, unas credenciales o
    // el mensaje entero del proveedor.
    function parseAuto(text, name) {
        var value = (text || '').trim();
        if (!value) return { error: 'Paste the address, the credentials or the playlist text' };

        if (/^#EXTM3U/i.test(value) || /#EXTINF/i.test(value)) {
            return { list: { kind: 'm3u', source: 'text', text: value, name: name || 'Pasted list' } };
        }

        var macMatch = value.match(/\b(?:[0-9A-F]{2}:){5}[0-9A-F]{2}\b/i);
        var urlMatch = value.match(/https?:\/\/[^\s"'<>]+/i);
        var userMatch = value.match(/(?:user(?:name)?|usuario)\s*[:=]\s*([^\s,;]+)/i);
        var passMatch = value.match(/(?:pass(?:word)?|contrase(?:n|ñ)a|clave)\s*[:=]\s*([^\s,;]+)/i);

        if (macMatch && urlMatch) {
            return {
                list: {
                    kind: 'stalker', source: 'mac', mac: macMatch[0].toUpperCase(),
                    origin: originOf(urlMatch[0]) || urlMatch[0].replace(/\/+$/, ''),
                    name: name || hostOf(urlMatch[0])
                }
            };
        }

        if (urlMatch) {
            var url = urlMatch[0];
            var inline = parseXtreamUrl(url);
            if (inline) {
                return { list: { kind: 'xtream', source: 'url', url: url, name: name || hostOf(url), user: inline.user, pass: inline.pass, origin: inline.origin } };
            }
            if (userMatch && passMatch) {
                var origin = originOf(url) || url;
                return { list: { kind: 'xtream', source: 'creds', origin: origin, user: userMatch[1], pass: passMatch[1], name: name || hostOf(origin) } };
            }
            return { list: { kind: 'm3u', source: 'url', url: url, name: name || hostOf(url) } };
        }

        return { error: 'No playlist, portal or MAC found in that text' };
    }

    // ------------------------------------------------------------------ carga
    function load(list, onProgress) {
        if (!list) return Promise.reject(new Error('Unknown source'));

        if (list.kind === 'stalker') {
            return loadStalker(list, onProgress).then(function (channels) {
                return channels;
            });
        }

        if (list.kind === 'xtream' || list.user) {
            var portal = list.origin
                ? { origin: list.origin, user: list.user, pass: list.pass }
                : parsePortal(list.url, list.user, list.pass);
            if (!portal) return Promise.reject(new Error('Server, username or password missing'));
            return loadXtream(portal, onProgress);
        }

        if (list.source === 'text') return loadM3uText(list.text, onProgress);
        if (list.source === 'url' || list.url) return loadM3uUrl(list.url, onProgress);
        return Promise.reject(new Error('I do not know how to load that source'));
    }

    // Filtra por nombre. La copia en minúsculas se cachea en el canal porque la
    // búsqueda corre en cada tecla sobre listas de decenas de miles.
    function match(channels, query) {
        var needle = (query || '').trim().toLowerCase();
        if (!needle) return channels;
        var found = [];
        for (var i = 0; i < channels.length; i++) {
            var channel = channels[i];
            if (channel.searchKey === undefined) channel.searchKey = channel.name.toLowerCase();
            if (channel.searchKey.indexOf(needle) !== -1) found.push(channel);
        }
        return found;
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
        originOf: originOf
    };
})();
