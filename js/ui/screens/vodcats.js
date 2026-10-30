var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

App.uiScreens = App.uiScreens || {}

;(function () {
    const kit = App.uiKit
    const store = App.store
    const vod = App.vod
    const html = kit.html
    const Bar = kit.Bar
    const Search = kit.Search
    const iconCheck = kit.iconCheck

    // Which Movies or Series categories to show. Ticked ones stay; Save keeps the change, Back
    // leaves without it.
    App.uiScreens.vodCats = function VodCategories() {
        const view = vod.categoriesDraft()
        const series = vod.ui.kind === "series"
        return html`<section class="screen" id="screen-vodcats">
            <${Bar}
                title=${series ? "Series categories" : "Movie categories"}
                titleId="vodCatsTitle"
                meta=${`${view.on} of ${view.total} shown`}
                metaId="vodCatsMeta"
                actions=${html`<div class="bar-actions" id="vodCatActions">
                    <button
                        class="btn"
                        id="vodCatAll"
                        tabindex="-1"
                        onClick=${function () {
                            vod.setAllHidden(true)
                        }}
                    >
                        All
                    </button>
                    <button
                        class="btn"
                        id="vodCatNone"
                        tabindex="-1"
                        onClick=${function () {
                            vod.setAllHidden(false)
                        }}
                    >
                        None
                    </button>
                    <button
                        class="btn primary"
                        id="vodCatSave"
                        tabindex="-1"
                        onClick=${function () {
                            vod.saveCategories()
                        }}
                    >
                        Save
                    </button>
                </div>`}
                search=${html`<${Search}
                    id="vodCatSearch"
                    countId="vodCatSearchCount"
                    scope="vodcats"
                    value=${vod.ui.catSearch}
                    placeholder="Search categories"
                    onInput=${function (value) {
                        vod.setCatSearch(value)
                    }}
                />`}
            />
            <div class="rows" id="vodCatList">
                ${view.rows.map((row) => {
                    return html`<button
                        class=${`row cat${row.enabled ? " on" : ""}`}
                        key=${row.name}
                        tabindex="-1"
                        data-group=${row.name}
                        onClick=${function () {
                            vod.toggleHidden(row.name)
                        }}
                    >
                        <span class="check">${row.enabled ? iconCheck : null}</span>
                        <span class="row-name">${row.name}</span>
                        <span class="row-count">${store.formatCount(row.count)}</span>
                    </button>`
                })}
                ${view.total ? null : html`<p class="empty">The catalog is still loading.</p>`}
            </div>
        </section>`
    }
})()
