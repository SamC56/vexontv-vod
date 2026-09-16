var App = App || {};

// Categorías por proveedor: cuáles se ven y cuáles no.

App.uiScreens = App.uiScreens || {};

(function () {
    var kit = App.uiKit;
    var store = App.store;
    var html = kit.html;
    var Bar = kit.Bar;
    var Search = kit.Search;
    var iconCheck = kit.iconCheck;

    App.uiScreens.cats = // Categorías por proveedor: se eligen las que se ven y se guardan.
    function Categories() {
        var state = store.state;
        var view = store.categoriesView();
        return html`<section class="screen" id="screen-cats">
            <${Bar} title="Categories" titleId="catsTitle"
                meta=${view.selected + ' of ' + view.total + ' on'} metaId="catsMeta"
                actions=${html`<div class="bar-actions" id="catActions">
                    <button class="btn" id="catAll" tabindex="-1" onClick=${function () { store.setAllCategories(true); }}>All</button>
                    <button class="btn" id="catNone" tabindex="-1" onClick=${function () { store.setAllCategories(false); }}>None</button>
                    <button class="btn primary" id="catSave" tabindex="-1" onClick=${function () { store.saveCategories(); }}>Save</button>
                </div>`}
                search=${html`<${Search} id="catSearch" countId="catSearchCount" scope="cats" resetKey="cats"
                    placeholder="Search categories" value=${state.catSearch}
                    onInput=${function (value) { store.setCatSearch(value); }} />`} />
            <div class="rows" id="catList">
                ${view.sections.map(function (section) {
                    return html`<div class="cat-source" key=${section.list.id}>
                        <span class="cat-source-name">${section.list.name}</span>
                        <span class="row-count">${store.listLabel(section.list)}</span>
                    </div>
                    ${section.groups.map(function (group) {
                        return html`<button class=${'row cat' + (group.enabled ? ' on' : '')} tabindex="-1" data-group=${group.name}
                            data-list=${group.listId}
                            onClick=${function () { store.toggleCategory(group.listId, group.name); }}>
                            <span class="check">${group.enabled ? iconCheck : null}</span>
                            <span class="row-name">${group.name}</span>
                            <span class="row-count">${store.formatCount(group.count)}</span>
                        </button>`;
                    })}`;
                })}
                ${view.total ? null : html`<p class="empty">${state.lists.length ? 'Nothing to show.' : 'Add a source to choose categories.'}</p>`}
            </div>
        </section>`;
    };

})();
