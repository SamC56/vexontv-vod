var App = App || {};

App.uiScreens = App.uiScreens || {};

(function () {
    var kit = App.uiKit;
    var store = App.store;
    var html = kit.html;
    var Bar = kit.Bar;
    var Search = kit.Search;
    var ChannelList = kit.ChannelList;

    App.uiScreens.recents = function Recents() {
        var view = store.visibleRecents();
        return html`<section class="screen" id="screen-recents">
            <${Bar} title="Recent" meta=${view.label} metaId="recentsMeta" titleId="recentsTitle"
                search=${html`<${Search} id="recentsSearch" countId="recentsSearchCount" scope="recents"
                    resetKey="recents" placeholder="Search recents" count=${view.count}
                    onInput=${function (value) { store.setSearch('recents', value); }} />`} />
            <${ChannelList} id="recentsList" view=${view} />
        </section>`;
    };

})();
