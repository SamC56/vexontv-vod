var App = App || {};

// Fuentes: gestionar las listas (entrar, editar, añadir).

App.uiScreens = App.uiScreens || {};

(function () {
    var kit = App.uiKit;
    var store = App.store;
    var html = kit.html;
    var Bar = kit.Bar;
    var SourceRow = kit.SourceRow;
    var AddRow = kit.AddRow;

    App.uiScreens.home = // ------------------------------------------------------------------ pantallas
    function Home() {
        var state = store.state;
        var sources = store.sources();
        return html`<section class="screen" id="screen-home">
            <${Bar} title="Sources" titleId="homeTitle" meta=${store.stats().counts} metaId="listCounts"
                actions=${html`<div class="bar-actions" id="homeActions">
                    <button class="btn" id="addSourceBtn" tabindex="-1" onClick=${function () { store.openAdd(); }}>Add source</button>
                </div>`} />
            <div class="columns">
                <div class="col-groups" id="typeList">
                    ${sources.types.map(function (type) {
                        return html`<button class=${'row group type' + (type.selected ? ' selected' : '')} tabindex="-1"
                            onClick=${function () { store.setFilter(type.id); }}>
                            <span class="row-name">${type.label}</span>
                            <span class="row-count">${store.formatCount(type.count)}</span>
                        </button>`;
                    })}
                </div>
                <div class="rows" id="sourceList">
                    ${sources.items.length ? null : html`<p class="empty">
                        ${state.lists.length ? 'No sources of that type.' : 'Add your first source: an M3U link, an Xtream portal, Stalker, or the playlist text.'}
                    </p>`}
                    ${sources.items.map(function (list) {
                        return html`<${SourceRow} key=${list.id} list=${list} channels=${state.channels[list.id]} />`;
                    })}
                    <${AddRow} />
                </div>
            </div>
        </section>`;
    };

})();
