var App = App || {}

App.uiScreens = App.uiScreens || {}

;(function () {
    var kit = App.uiKit
    var store = App.store
    var html = kit.html
    var Bar = kit.Bar
    var Search = kit.Search
    var ChannelList = kit.ChannelList

    App.uiScreens.favs = function Favs() {
        var view = store.visibleFavorites()
        return html`<section class="screen" id="screen-favs">
            <${Bar}
                title="Favorites"
                meta=${view.label}
                metaId="favsMeta"
                titleId="favsTitle"
                search=${html`<${Search}
                    id="favsSearch"
                    countId="favsSearchCount"
                    scope="favorites"
                    resetKey="favorites"
                    placeholder="Search favorites"
                    count=${view.count}
                    onInput=${function (value) {
                        store.setSearch("favorites", value)
                    }}
                />`}
            />
            ${view.total ? null : html`<p class="empty">Mark channels with the red key while you watch them and they will show up here.</p>`}
            <${ChannelList} id="favList" view=${view} />
        </section>`
    }
})()
