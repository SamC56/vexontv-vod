var App = App || {};

// TV: tres columnas, como un reproductor de escritorio. Categorias a la izquierda,
// los canales de la categoria elegida en medio y el preview a la derecha: si no hay
// canal elegido, un estado vacio que explica que hacer; si lo hay, su ficha con logo,
// guia y barra, y OK la abre a pantalla completa.
App.uiScreens = App.uiScreens || {};
(function () {
    var kit = App.uiKit;
    var store = App.store;
    var html = kit.html;
    var clock = kit.clock;
    var useEffect = kit.useEffect;
    var Bar = kit.Bar;
    var Search = kit.Search;
    var ChannelList = kit.ChannelList;

    var player = App.player;

    // El video de AVPlay va DETRAS del webview, asi que para verlo dentro del preview
    // hay que dejar un agujero: se pinta el fondo de la app (negro + grilla) en una
    // capa enmascarada y se recorta justo el rectangulo del preview. Si el firmware no
    // soporta la mascara no se activa y queda la ficha, nunca un hueco negro.
    function supportsHole() {
        return !!(window.CSS && window.CSS.supports && window.CSS.supports('-webkit-mask-composite', 'xor'));
    }

    // El agujero es el escenario, no la columna entera: la columna es alta (675x888) y
    // el video de 16:9 se veia encajado entre dos franjas negras enormes.
    function previewBox() {
        var element = document.getElementById('previewStage');
        return element && element.getBoundingClientRect ? element.getBoundingClientRect() : null;
    }

    // Rect del video: la TV lo mide en su rejilla de 1920x1080, sea cual sea el viewport.
    function videoRect() {
        var box = previewBox();
        if (!box || box.width < 2) return null;
        var scale = 1920 / (window.innerWidth || 1920);
        return { x: box.left * scale, y: box.top * scale, w: box.width * scale, h: box.height * scale };
    }

    function setHole() {
        var box = previewBox();
        var layer = document.getElementById('backdrop');
        if (!box || !layer) return;
        layer.style.setProperty('--hole-x', Math.round(box.left) + 'px');
        layer.style.setProperty('--hole-y', Math.round(box.top) + 'px');
        layer.style.setProperty('--hole-w', Math.round(box.width) + 'px');
        layer.style.setProperty('--hole-h', Math.round(box.height) + 'px');
    }

    var iconTvBig = kit.svg(html`<rect x="2.5" y="5" width="19" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8.5 21h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`, 64);

    // El preview es escenario 16:9 arriba (el logo, y con el canal en marcha el video
    // por el agujero) y la ficha debajo. La ficha se queda mientras se ve: no tapa el
    // agujero y sigue diciendo que esta dando y que viene despues.
    function Preview() {
        var state = store.state;
        var channel = state.preview;
        if (!channel) {
            return html`<div class="preview-card" id="previewCard">
                <div class="preview-stage" id="previewStage">
                    <div class="preview-empty" id="previewEmpty">
                        <span class="preview-icon">${iconTvBig}</span>
                        <p class="preview-hint">Select a channel to see it here</p>
                    </div>
                </div>
            </div>`;
        }
        var program = store.programOf(channel);
        var next = store.nextOf(channel);
        var progress = store.programProgress(program);
        return html`<div class="preview-card" id="previewCard">
            <div class="preview-stage" id="previewStage">
                <span class="preview-logo" style=${kit.logoStyle(channel.logo)}>
                    ${channel.logo ? null : html`<span class="preview-letter">${kit.initial(channel.name)}</span>`}
                </span>
            </div>
            <div class="preview-info">
                <h2 class="preview-name">${channel.name}</h2>
                <p class="preview-group">${channel.group || ''}</p>
                ${program ? html`<div class="preview-guide">
                    <p class="preview-program">${program.title}
                        <span class="ov-time">${clock(program.start)} – ${clock(program.end)}</span></p>
                    ${progress !== null ? html`<div class="ov-progress">
                        <span class="ov-progress-fill" style=${'width:' + progress + '%'}></span>
                    </div>` : null}
                </div>` : null}
                ${next ? html`<p class="preview-next">
                    <span class="ov-next-tag">Next</span>${next.title}
                    ${next.start ? html`<span class="ov-time">${clock(next.start)} – ${clock(next.end)}</span>` : null}
                </p>` : null}
                <p class="preview-open">Press OK to watch full screen</p>
            </div>
        </div>`;
    }

    function TvScreen() {
        var state = store.state;

        // El canal elegido se ve aqui mismo, en el agujero del preview. A pantalla
        // completa se pasa pulsando encima del preview.
        useEffect(function () {
            if (!state.preview || !state.preview.url) { player.stop(); return; }
            setHole();
            // Solo se deja el agujero si la mascara funciona: si no, el fondo se
            // quedaria tapando el video y es mejor la ficha.
            if (supportsHole()) document.body.classList.add('previewing');
            player.play(state.preview.url, store.aspectMode(), videoRect());
            function onResize() { setHole(); player.play(state.preview.url, store.aspectMode(), videoRect()); }
            window.addEventListener('resize', onResize);
            return function () {
                window.removeEventListener('resize', onResize);
                document.body.classList.remove('previewing');
                player.stop();
            };
        }, [state.preview]);

        var view = store.tvCategories();
        var channels = store.visibleTvCategory();
        var pending = store.loadingRows();
        var rows = store.tvCategories().rows;

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
            <div class="browse" id="browse">
                <div class="browse-cats" id="tvCats">
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
                    ${rows.length || pending.length ? null : html`<p class="empty">
                        ${view.total ? 'No category matches your search.' : 'No categories yet.'}
                    </p>`}
                    ${rows.map(function (row) {
                        return html`<button class=${'row tvcat' + (row.name === state.catName ? ' selected' : '')}
                            tabindex="-1" data-group=${row.name}
                            onClick=${function () { store.openTvCategory(row.name); }}>
                            <span class="row-main">
                                <span class="row-name">${row.name}</span>
                                ${row.sources > 1 ? html`<span class="row-sub">${row.sources} sources</span>` : null}
                            </span>
                            <span class="row-count">${store.formatCount(row.count)}</span>
                        </button>`;
                    })}
                </div>
                <div class="browse-channels">
                    <${ChannelList} id="tvChannels" view=${channels} detail=${true} />
                </div>
                <div class="browse-preview" id="tvPreview" tabindex="-1"
                    onClick=${function () { if (state.preview) store.play(state.preview, state.preview.listId, store.zapChannels()); }}>
                    <${Preview} />
                </div>
            </div>
        </section>`;
    }

    App.uiScreens.tv = TvScreen;
})();
