var App = App || {};

// Panel de zapeo: la lista encima del video. A la izquierda las categorias, a la
// derecha los canales de la categoria elegida, con logo, lo que estan dando ahora
// y su barra. Moverse por la columna de canales cambia de canal (con freno), como
// en cualquier IPTV.
App.uiScreens = App.uiScreens || {};
(function () {
    var kit = App.uiKit;
    var store = App.store;
    var html = kit.html;
    var clock = kit.clock;

    function ZapPanel() {
        var state = store.state;
        var categories = store.zapCategories();
        var channels = store.zapChannels().slice(0, 200);
        var playing = state.playing && state.playing.channel ? state.playing.channel.url : '';

        return html`<div class="zap" id="zapPanel">
            <div class="zap-cats" id="zapCats">
                ${categories.map(function (category) {
                    return html`<button class=${'row zapcat' + (category.selected ? ' selected' : '')}
                        tabindex="-1" data-group=${category.name}
                        onClick=${function () { store.setZapCategory(category.name); }}>
                        <span class="row-name">${category.name}</span>
                        ${category.playing ? html`<span class="zap-dot"></span>` : null}
                        <span class="row-count">${store.formatCount(category.count)}</span>
                    </button>`;
                })}
            </div>
            <div class="zap-list" id="zapChannels">
                <p class="zap-head" id="zapHead"><span>${state.zapCategory}</span>
                    <span class="zap-hint">OK watch · BACK close</span></p>
                ${channels.map(function (channel) {
                    var program = store.programOf(channel);
                    var progress = store.programProgress(program);
                    var saved = store.isFavorite(channel.listId, channel.url);
                    return html`<button class=${'row zapch' + (channel.url === playing ? ' playing' : '')}
                        tabindex="-1" data-url=${channel.url} data-list=${channel.listId}
                        onClick=${function () { store.zapTo(channel); }}>
                        <span class="thumb" style=${kit.logoStyle(channel.logo)}>
                            ${channel.logo ? null : html`<span class="thumb-letter">${kit.initial(channel.name)}</span>`}
                        </span>
                        <span class="zap-info">
                            <span class="zap-top">
                                <span class="row-name">${channel.name}</span>
                                ${saved ? html`<span class="saved">★</span>` : null}
                            </span>
                            ${program ? html`<span class="zap-guide">
                                <span class="zap-time">${clock(program.start)}</span>
                                ${progress !== null ? html`<span class="zap-bar">
                                    <span class="zap-bar-fill" style=${'width:' + progress + '%'}></span>
                                </span>` : html`<span class="zap-bar"></span>`}
                                <span class="zap-time">${clock(program.end)}</span>
                            </span>` : html`<span class="row-sub">${channel.group || ''}</span>`}
                        </span>
                        ${channel.url === playing ? html`<span class="zap-now" aria-label="playing">▶</span>` : null}
                    </button>`;
                })}
            </div>
        </div>`;
    }

    App.uiScreens.zap = ZapPanel;
})();
