var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

App.uiScreens = App.uiScreens || {}

;(function () {
    const kit = App.uiKit
    const store = App.store
    const vod = App.vod
    const html = kit.html
    const Bar = kit.Bar
    const Search = kit.Search
    const ChannelList = kit.ChannelList

    const TABS = [
        { id: "live", label: "Live" },
        { id: "movie", label: "Movies" },
        { id: "series", label: "Series" },
    ]

    function count(value, one, many) {
        return value === 1 ? `1 ${one}` : `${store.formatCount(value)} ${many}`
    }

    // Saved channels, films and shows, a tab each. Red adds and removes wherever a channel or
    // a poster has the focus.
    App.uiScreens.favs = function Favs() {
        const tab = store.state.favTab || "live"
        const live = tab === "live"
        const view = live ? store.visibleFavorites() : null
        const titles = live ? [] : vod.favorites(tab)
        const meta = live
            ? view.label
            : tab === "movie"
              ? count(titles.length, "film", "films")
              : count(titles.length, "show", "shows")
        return html`<section class="screen" id="screen-favs">
            <${Bar}
                title="Favorites"
                meta=${meta}
                metaId="favsMeta"
                titleId="favsTitle"
                actions=${html`<div class="bar-actions seg fav-tabs" id="favTabs">
                    ${TABS.map((item) => {
                        return html`<button
                            class=${`btn seg-btn${item.id === tab ? " on" : ""}`}
                            data-tab=${item.id}
                            tabindex="-1"
                            onClick=${function () {
                                store.setFavTab(item.id)
                            }}
                        >
                            ${item.label}
                        </button>`
                    })}
                </div>`}
                search=${
                    live
                        ? html`<${Search}
                              id="favsSearch"
                              countId="favsSearchCount"
                              scope="favorites"
                              resetKey="favorites"
                              placeholder="Search favorites"
                              count=${view.count}
                              onInput=${function (value) {
                                  store.setSearch("favorites", value)
                              }}
                          />`
                        : null
                }
            />
            ${
                live
                    ? html`${view.total ? null : html`<p class="empty">Mark channels with the red key while you watch them and they will show up here.</p>`}
                          <${ChannelList} id="favList" view=${view} />`
                    : html`<div class="vod-grid fav-grid" id="favGrid">
                          ${
                              titles.length
                                  ? titles.map((item) => {
                                        return html`<${App.uiScreens.Poster}
                                            key=${vod.keyOf(item)}
                                            item=${item}
                                            from="favs"
                                        />`
                                    })
                                  : html`<p class="empty">
                                        Press the red key on a poster, or Add to favorites on its
                                        page, and it will show up here.
                                    </p>`
                          }
                      </div>`
            }
        </section>`
    }
})()
