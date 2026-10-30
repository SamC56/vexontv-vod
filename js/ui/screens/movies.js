var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

App.uiScreens = App.uiScreens || {}

;(function () {
    const kit = App.uiKit
    const store = App.store
    const vod = App.vod
    const html = kit.html
    const Bar = kit.Bar
    const Search = kit.Search

    const SORTS = [
        { id: "added", label: "Recently added" },
        { id: "name", label: "A–Z" },
        { id: "rating", label: "Rating" },
    ]

    // A cover that will not load is taken away, and the initial under it shows instead.
    function hideBroken(event) {
        event.target.style.display = "none"
    }

    // A cover from the panel when there is one, the initial when there is not. Only the
    // page on screen is drawn, so only its covers are downloaded. A div, not a button:
    // the TV lays a button's insides out its own way, and the cover box got no width.
    function Poster(props) {
        const item = props.item
        const progress = vod.progressOf(item)
        const ratio = progress && progress.dur > 0 ? Math.min(1, progress.pos / progress.dur) : 0
        return html`<div
            class="poster"
            data-key=${vod.keyOf(item)}
            tabindex="-1"
            onClick=${function () {
                vod.openTitle(item, props.from)
            }}
        >
            <span class="poster-art">
                ${vod.isFavorite(item) ? html`<span class="poster-fav">★</span>` : null}
                <span class="poster-letter">${kit.initial(item.name)}</span>
                ${
                    item.logo
                        ? html`<img
                              class="poster-img"
                              src=${item.logo}
                              alt=""
                              loading="lazy"
                              onError=${hideBroken}
                          />`
                        : null
                }
                ${item.rating ? html`<span class="poster-rating">★ ${item.rating.toFixed(1)}</span>` : null}
                ${progress && progress.done ? html`<span class="poster-seen">${kit.iconCheck}</span>` : null}
                ${
                    progress && !progress.done && ratio > 0
                        ? html`<span class="poster-progress"
                              ><span
                                  class="poster-progress-fill"
                                  style=${`width:${Math.round(ratio * 100)}%`}
                              ></span
                          ></span>`
                        : null
                }
            </span>
            <span class="poster-name">${item.name}</span>
            <span class="poster-sub">${item.year || ""}</span>
        </div>`
    }

    function Grid(props) {
        const view = props.view
        const status = view.status
        if (!view.page.total) {
            let message = "No titles in this category."
            if (status.loading) message = "Loading the catalog…"
            else if (!vod.items(vod.ui.kind).length)
                message = status.errors.length
                    ? status.errors[0].message
                    : vod.ui.kind === "series"
                      ? "None of your sources has series. Xtream panels and playlists with episodes do."
                      : "None of your sources has movies. Xtream panels and playlists with films do."
            else if (vod.ui.query) message = "No title matches your search."
            return html`<div class="vod-grid" id="vodGrid"><p class="empty">${message}</p></div>`
        }
        return html`<div class="vod-grid" id="vodGrid">
            ${view.page.items.map((item) => {
                return html`<${Poster} key=${vod.keyOf(item)} item=${item} />`
            })}
        </div>`
    }

    // Movies and Series: the same screen, told apart by the section that opened it.
    App.uiScreens.Poster = Poster

    App.uiScreens.movies = function Movies() {
        const view = vod.browse()
        const status = view.status
        const series = vod.ui.kind === "series"
        const noun = series ? "series" : "movies"
        return html`<section class="screen" id=${series ? "screen-series" : "screen-movies"}>
            <${Bar}
                title=${series ? "Series" : "Movies"}
                titleId="moviesTitle"
                meta=${view.label}
                metaId="moviesMeta"
                actions=${html`<div class="bar-actions seg" id="vodSort">
                    ${SORTS.map((sort) => {
                        return html`<button
                            class=${`btn seg-btn${view.sort === sort.id ? " on" : ""}`}
                            data-sort=${sort.id}
                            tabindex="-1"
                            onClick=${function () {
                                vod.setSort(sort.id)
                            }}
                        >
                            ${sort.label}
                        </button>`
                    })}
                    <button
                        class="btn vod-cats-btn"
                        id="vodCatsBtn"
                        tabindex="-1"
                        onClick=${function () {
                            vod.openCategories()
                        }}
                    >
                        Categories
                    </button>
                </div>`}
                search=${html`<${Search}
                    id="vodSearch"
                    countId="vodSearchCount"
                    scope="vod"
                    value=${vod.ui.query}
                    placeholder=${`Search ${noun}`}
                    resetKey=${noun}
                    count=${vod.ui.query ? store.formatCount(view.page.total) : ""}
                    onInput=${function (value) {
                        vod.setQuery(value)
                    }}
                />`}
            />
            <div class="vod-browse">
                <div class="browse-cats" id="vodCats">
                    ${
                        status.loading
                            ? html`<div class="row pending">
                                  <span class="pending-dot"></span>
                                  <span class="row-main">
                                      <span class="row-name">Loading ${noun}</span>
                                      <span class="row-sub"
                                          >${status.loading === 1 ? "1 source" : `${status.loading} sources`}…</span
                                      >
                                  </span>
                              </div>`
                            : null
                    }
                    ${view.rows.map((row) => {
                        return html`<button
                            class=${`row tvcat vodcat${row.id === view.category ? " selected" : ""}${
                                row.pinned ? " pinned" : ""
                            }`}
                            tabindex="-1"
                            data-cat=${row.id}
                            onClick=${function () {
                                vod.setCategory(row.id)
                            }}
                        >
                            <span class="row-main">
                                <span class="row-name">${row.name}</span>
                                ${row.sources > 1 ? html`<span class="row-sub">${row.sources} sources</span>` : null}
                            </span>
                            <span class="row-count">${store.formatCount(row.count)}</span>
                        </button>`
                    })}
                </div>
                <${Grid} view=${view} />
            </div>
        </section>`
    }
})()
