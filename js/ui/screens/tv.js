var App = App || {};

// TV: las categorías y, dentro de una, sus canales.

App.uiScreens = App.uiScreens || {};

(function () {
    var kit = App.uiKit;
    var store = App.store;
    var html = kit.html;
    var Bar = kit.Bar;
    var Search = kit.Search;
    var ChannelList = kit.ChannelList;

    App.uiScreens.tv = // TV: primero las categorias que quedan despues de filtrar, y dentro de cada
    // una sus canales (openTvCategory). Antes se volcaban los 56.000 canales en
    // una lista plana, que es justo lo que no se puede navegar con un mando.
    function TvScreen() {
        var state = store.state;
        var view = store.tvCategories();
        var pending = store.loadingRows();
        return html`<section class="screen" id="screen-tv">
            <${Bar} title="TV" meta=${view.label} metaId="tvMeta" titleId="tvTitle"
                actions=${html`<div class="bar-actions" id="tvActions">
                    <button class="btn" id="catsBtn" tabindex="-1"
                        onClick=${function () { store.openCategories(); }}>Categories</button>
                </div>`}
                search=${html`<${Search} id="tvSearch" countId="tvSearchCount" scope="tv" resetKey="tv"
                    placeholder="Search categories" count=${view.count}
                    onInput=${function (value) { store.setSearch('tv', value); }} />`} />
            ${state.lists.length ? null : html`<p class="empty">Every source's channels meet here. Add one to start.</p>`}
            <div class="rows" id="tvCats">
                ${pending.map(function (row) {
                    return html`<div class="row pending" key=${'load-' + row.key}>
                        <span class="pending-dot"></span>
                        <span class="row-main">
                            <span class="row-name">${row.name}</span>
                            <span class="row-sub">${row.label}${row.count !== undefined
                                ? ' · ' + store.formatCount(row.count) + ' channels' : '…'}</span>
                        </span>
                    </div>`;
                })}
                ${view.rows.length || pending.length ? null : html`<p class="empty">
                    ${view.total ? 'No category matches your search.' : 'No categories yet.'}
                </p>`}
                ${view.rows.map(function (row) {
                    return html`<button class="row tvcat" tabindex="-1" data-group=${row.name}
                        onClick=${function () { store.openTvCategory(row.name); }}>
                        <span class="row-main">
                            <span class="row-name">${row.name}</span>
                            ${row.sources > 1 ? html`<span class="row-sub">${row.sources} fuentes</span>` : null}
                        </span>
                        <span class="row-count">${store.formatCount(row.count)}</span>
                    </button>`;
                })}
            </div>
        </section>`;
    };

    App.uiScreens.tvcat = // Los canales de una categoria, en su propia pagina.
    function TvCategoryScreen() {
        var state = store.state;
        var view = store.visibleTvCategory();
        return html`<section class="screen" id="screen-tvcat">
            <${Bar} title=${state.catName} titleId="tvcatTitle" meta=${view.label} metaId="tvcatMeta"
                actions=${html`<div class="bar-actions" id="tvcatActions">
                    <button class="btn" id="tvcatBack" tabindex="-1"
                        onClick=${function () { store.backToTv(); }}>Categories</button>
                </div>`}
                search=${html`<${Search} id="tvcatSearch" countId="tvcatSearchCount" scope="tvcat" resetKey=${state.catName}
                    placeholder="Search in this category" count=${view.count}
                    onInput=${function (value) { store.setSearch('tvcat', value); }} />`} />
            <${ChannelList} id="tvChannels" view=${view} />
        </section>`;
    };

})();
