var App = App || {};

// Kit de la UI: iconos, piezas compartidas (barra, fila de canal, buscador) y las
// funciones de pintado comunes. Las pantallas viven en js/ui/screens/ y tiran de
// aqui; el orden de carga lo fija index.html.
App.uiKit = (function () {
    var preact = window.preact;
    var hooks = window.preactHooks;
    var html = window.htm.bind(preact.h);
    var useState = hooks.useState;
    var useEffect = hooks.useEffect;
    var useRef = hooks.useRef;
    var store = App.store;

    var SEARCH_DEBOUNCE_MS = 150;

    // Tipos de fuente del alta (los mismos que se pueden filtrar despues).
    var ADD_TYPES = [
        { id: 'url', title: 'M3U from URL', hint: 'An .m3u or .m3u8 address', icon: 'link' },
        { id: 'file', title: 'M3U from a file', hint: 'An .m3u on a USB drive', icon: 'file' },
        { id: 'xtream', title: 'Xtream', hint: 'Server, username and password', icon: 'key' },
        { id: 'stalker', title: 'Stalker', hint: 'Portal and MAC', icon: 'box' },
        { id: 'raw', title: 'Pasted M3U', hint: 'The playlist text', icon: 'text' },
        { id: 'auto', title: 'Detect', hint: 'Paste whatever your provider gave you', icon: 'wand' }
    ];

    var FIELD_SETS = {
        url: [{ id: 'url', label: 'Playlist address', placeholder: 'http://host:8080/list.m3u' }],
        file: [],
        xtream: [
            { id: 'origin', label: 'Server', placeholder: 'http://host:8080' },
            { id: 'user', label: 'Username' },
            { id: 'pass', label: 'Password' }
        ],
        stalker: [
            { id: 'origin', label: 'Portal', placeholder: 'http://host:8080/c' },
            { id: 'mac', label: 'MAC', placeholder: '00:1A:79:12:34:56' }
        ],
        raw: [{ id: 'text', label: 'Playlist contents', multiline: true, placeholder: '#EXTM3U…' }],
        auto: [{ id: 'text', label: 'Paste the address, the credentials or the whole message', multiline: true }]
    };

    // ------------------------------------------------------------------ iconos
    function svg(paths, size) {
        return html`<svg viewBox="0 0 24 24" width=${size || 22} height=${size || 22}>${paths}</svg>`;
    }

    var iconList = svg(html`<path d="M3 6h18M3 12h18M3 18h12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>`, 24);
    var iconTv = svg(html`<rect x="2.5" y="5" width="19" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 21h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`, 24);
    var iconClock = svg(html`<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`, 24);
    var iconStar = svg(html`<path d="M12 4.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2-4.6-2.5-4.6 2.5.9-5.2-3.8-3.6 5.2-.7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`, 24);
    var iconSearch = svg(html`<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`);
    var iconLink = svg(html`<path d="M10 13a4 4 0 006 .5l2-2a4 4 0 00-5.6-5.7L11 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M14 11a4 4 0 00-6-.5l-2 2A4 4 0 0011.6 18L13 16.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`);
    var iconFile = svg(html`<path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3v4h4" fill="none" stroke="currentColor" stroke-width="1.7"/>`);
    var iconKey = svg(html`<circle cx="8" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M11.5 12H21M18 12v3M15 12v2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`);
    var iconBox = svg(html`<rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7 10h6M7 14h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`);
    var iconText = svg(html`<path d="M5 7h14M5 12h14M5 17h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`);
    var iconWand = svg(html`<path d="M6 18L18 6M15 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`);
    var iconPencil = svg(html`<path d="M5 19h3L19 8l-3-3L5 16z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M15 6l3 3" fill="none" stroke="currentColor" stroke-width="1.7"/>`, 20);
    var iconCheck = svg(html`<path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`);

    var TYPE_ICONS = { link: iconLink, file: iconFile, key: iconKey, box: iconBox, text: iconText, wand: iconWand };

    function initial(name) {
        var match = (name || '').match(/[a-z0-9]/i);
        return match ? match[0].toUpperCase() : '?';
    }

    function logoStyle(url) {
        return url ? { backgroundImage: 'url(' + JSON.stringify(url) + ')' } : null;
    }

    function clock(value) {
        var match = (value || '').match(/(\d{1,2}:\d{2})/);
        return match ? match[1] : '';
    }

    function programText(program) {
        if (!program || !program.title) return '';
        var span = program.start && program.end ? ' ' + clock(program.start) + '–' + clock(program.end) : '';
        return program.title + span;
    }

    // ------------------------------------------------------------------ piezas
    function Rail(props) {
        var items = [
            { id: 'navHome', label: 'Sources', icon: iconList, screens: ['home'], action: function () { store.goHome(); } },
            { id: 'navTv', label: 'TV', icon: iconTv, screens: ['tv', 'tvcat', 'cats'], action: function () { store.openTv(); } },
            { id: 'navRecents', label: 'Recent', icon: iconClock, screens: ['recents'], action: function () { store.openRecents(); } },
            { id: 'navFavs', label: 'Favorites', icon: iconStar, screens: ['favs'], action: function () { store.openFavorites(); } }
        ];
        return html`<nav class="rail">
            <div class="brand" aria-hidden="true">
                <img class="brand-img" src="brand.png" alt="" />
            </div>
            <p class="wordmark"><span class="wordmark-name">VexonTV</span><span class="wordmark-tag">IPTV Player</span></p>
            ${items.map(function (item) {
                var active = item.screens.indexOf(props.screen) !== -1;
                return html`<button id=${item.id} class=${'rail-btn' + (active ? ' active' : '')} tabindex="-1"
                    onClick=${item.action}>${item.icon}<span>${item.label}</span></button>`;
            })}
        </nav>`;
    }

    // Fila de canal: numero, miniatura, nombre, grupo y lo que están dando ahora
    // (cuando el proveedor lo sabe y ya se ha mirado esa fila).
    function ChannelRow(props) {
        var channel = props.channel;
        var listId = props.listId || channel.listId;
        var now = programText(store.programOf(channel));
        function open() { store.play(channel, listId, props.source); }
        return html`<button class="row channel" data-url=${channel.url} data-list=${listId} tabindex="-1" onClick=${open}>
            <span class="num">${props.number}</span>
            <span class="thumb" style=${logoStyle(channel.logo)}>
                ${channel.logo ? null : html`<span class="thumb-letter">${initial(channel.name)}</span>`}
            </span>
            <span class="row-main">
                <span class="row-name">${channel.name}</span>
                ${props.showGroup ? html`<span class="row-sub">${channel.group || ''}</span>` : null}
            </span>
            ${now ? html`<span class="row-now">${now}</span>` : null}
            ${props.saved ? html`<span class="saved">\u2605</span>` : null}
        </button>`;
    }

    function ChannelList(props) {
        var view = props.view;
        // En la pantalla de lista hay que decir la fuente: el canal solo la trae
        // cuando viene de la pantalla TV.
        function listOf(channel) { return props.listId || channel.listId; }
        return html`<div class="rows" id=${props.id}>
            ${view.total ? null : html`<p class="empty">${view.empty || 'No channels.'}</p>`}
            ${view.items.map(function (channel, index) {
                return html`<${ChannelRow} key=${channel.url || channel.cmd || index} channel=${channel}
                    listId=${listOf(channel)} number=${index + 1} source=${view.items} showGroup=${view.showGroup}
                    saved=${store.isFavorite(listOf(channel), channel.url)} />`;
            })}
        </div>`;
    }

    // Ojo: es un div y no un button porque dentro va el boton de editar, y un
    // boton dentro de otro no es HTML valido. El motor de foco hace click() sobre
    // el elemento enfocado, que funciona igual en un div.
    function SourceRow(props) {
        var channels = props.channels;
        return html`<div class="row source" data-list=${props.list.id} tabindex="-1"
            onClick=${function () { store.openSource(props.list.id); }}>
            <span class="kind">${store.listLabel(props.list)}</span>
            <span class="row-main">
                <span class="row-name">${props.list.name}</span>
                <span class="row-sub">${props.list.url || props.list.origin || ''}</span>
            </span>
            <span class="row-count">${channels ? store.formatCount(channels.length) : '—'}</span>
            <button class="edit" data-list=${props.list.id} tabindex="-1" aria-label="Edit source"
                onClick=${function (event) {
                    event.stopPropagation();
                    store.openEdit(props.list.id);
                }}>${iconPencil}<span>Edit</span></button>
        </div>`;
    }

    function AddRow() {
        return html`<button class="row add" tabindex="-1" onClick=${function () { store.openAdd(); }}>
            <span class="kind">+</span>
            <span class="row-main">
                <span class="row-name">Add source</span>
                <span class="row-sub">M3U, Xtream, Stalker or pasted text</span>
            </span>
        </button>`;
    }

    function Search(props) {
        var inputRef = useRef(null);
        var timer = useRef(null);
        useEffect(function () {
            if (inputRef.current) inputRef.current.value = props.value !== undefined
                ? props.value
                : store.searchOf(props.scope);
        }, [props.scope, props.resetKey, props.value]);

        function onInput(event) {
            var value = event.target.value;
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(function () { props.onInput(value); }, SEARCH_DEBOUNCE_MS);
        }

        return html`<div class="search">
            ${iconSearch}
            <input id=${props.id} ref=${inputRef} type="text" placeholder=${props.placeholder}
                autocomplete="off" autocapitalize="off" spellcheck="false" tabindex="-1" onInput=${onInput} />
            <span class="search-count" id=${props.countId}>${props.count}</span>
        </div>`;
    }

    function Bar(props) {
        return html`<header class="bar">
            <div class="bar-text">
                <h1 id=${props.titleId}>${props.title}</h1>
                <p class="meta" id=${props.metaId}>${props.meta}</p>
            </div>
            ${props.actions || null}
            ${props.search || null}
        </header>`;
    }

    return {
        html: html,
        store: store,
        useState: useState,
        useEffect: useEffect,
        useRef: useRef,
        TYPE_ICONS: TYPE_ICONS,
        ADD_TYPES: ADD_TYPES,
        FIELD_SETS: FIELD_SETS,
        clock: clock,
        initial: initial,
        logoStyle: logoStyle,
        programText: programText,
        iconCheck: iconCheck,
        Rail: Rail,
        Bar: Bar,
        Search: Search,
        ChannelRow: ChannelRow,
        ChannelList: ChannelList,
        SourceRow: SourceRow,
        AddRow: AddRow
    };
})();
