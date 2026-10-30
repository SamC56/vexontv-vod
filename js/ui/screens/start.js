var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

App.uiScreens = App.uiScreens || {}

;(function () {
    const kit = App.uiKit
    const store = App.store
    const vod = App.vod
    const html = kit.html

    // Material Design icons (live_tv, movie, video_library), Apache License 2.0, Google.
    function icon(path) {
        return kit.svg(html`<path d=${path} fill="currentColor" />`, 112)
    }
    const ICONS = {
        live: icon(
            "M21 6h-7.59l3.29-3.29L16 2l-4 4-4-4-.71.71L10.59 6H3c-1.1 0-2 .89-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.11-.9-2-2-2zm0 14H3V8h18v12zM9 10v8l7-4z",
        ),
        movies: icon(
            "M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z",
        ),
        series: icon(
            "M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z",
        ),
    }

    function count(value, one, many) {
        return value === 1 ? `1 ${one}` : `${store.formatCount(value)} ${many}`
    }

    // What each tile says under its name: what is there, once it is known.
    function liveLine() {
        const channels = store.stats().counts
        return store.state.lists.length ? channels : "Add a source to start"
    }

    function vodLine(kind, one, many) {
        const loaded = vod.items(kind).length
        const resume = vod.continueWatching(kind).length
        if (resume) return `${resume} to continue`
        if (loaded) return count(loaded, one, many)
        return kind === "series" ? "Shows and episodes" : "Films on demand"
    }

    // The first screen: the three ways in, large enough to read across the room.
    App.uiScreens.start = function Start() {
        const clock = kit.useClock()
        const tiles = [
            {
                id: "startLive",
                label: "Live TV",
                line: liveLine(),
                tone: "live",
                action: function () {
                    store.openTv()
                },
            },
            {
                id: "startMovies",
                label: "Movies",
                line: vodLine("movie", "film", "films"),
                tone: "movies",
                action: function () {
                    vod.openMovies()
                },
            },
            {
                id: "startSeries",
                label: "Series",
                line: vodLine("series", "show", "shows"),
                tone: "series",
                action: function () {
                    vod.openSeries()
                },
            },
        ]
        const links = [
            {
                id: "startRecents",
                label: "Recent",
                action: function () {
                    store.openRecents()
                },
            },
            {
                id: "startFavs",
                label: "Favorites",
                action: function () {
                    store.openFavorites()
                },
            },
            {
                id: "startSources",
                label: "Sources",
                action: function () {
                    store.goHome()
                },
            },
        ]
        return html`<section class="screen start" id="screen-start">
            <div class="start-top">
                <div class="start-brand">
                    <img class="brand-img" src="brand.png" alt="" />
                    <span class="wordmark">
                        <span class="wordmark-name">VexonTV</span>
                        <span class="wordmark-tag">IPTV Player</span>
                    </span>
                </div>
                <p class="start-clock" id="startClock">${clock}</p>
            </div>
            <div class="start-tiles" id="startTiles">
                ${tiles.map((tile) => {
                    return html`<div
                        class=${`start-tile tone-${tile.tone}`}
                        id=${tile.id}
                        tabindex="-1"
                        onClick=${tile.action}
                    >
                        <span class="start-tile-icon">${ICONS[tile.tone]}</span>
                        <span class="start-tile-label">${tile.label}</span>
                        <span class="start-tile-line">${tile.line}</span>
                    </div>`
                })}
            </div>
            <div class="start-links" id="startLinks">
                ${links.map((link) => {
                    return html`<button
                        class="btn start-link"
                        id=${link.id}
                        tabindex="-1"
                        onClick=${link.action}
                    >
                        ${link.label}
                    </button>`
                })}
            </div>
        </section>`
    }
})()
