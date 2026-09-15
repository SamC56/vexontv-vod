var App = App || {};

// UI en Preact + htm, vendorizados: componentes al estilo React sin build step
// (htm convierte las plantillas en vnodes en runtime) y sin una sola peticion de
// red en runtime.
//
// La estructura no es "tarjetas": listas de filas separadas por hairlines, que
// es como se lee una lista de canales en una TV, y toda la jerarquia se apoya en
// peso y tamano de tipo, no en rellenos de color.
App.ui = (function () {
    // htm no es HTML5: los elementos vacios (input, br, img...) tienen que ir
    // autocerrados o el parser se come el elemento que los contiene. Hay un
    // check en test/check.js que lo vigila.
    var preact = window.preact;
    var hooks = window.preactHooks;
    var html = window.htm.bind(preact.h);
    var useState = hooks.useState;
    var useEffect = hooks.useEffect;
    var useRef = hooks.useRef;

    var store = App.store;
    var player = App.player;
    var tv = App.tv;

    var OVERLAY_MS = 5000;
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

    // ------------------------------------------------------------------ pantallas
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
    }

    // TV: primero las categorias que quedan despues de filtrar, y dentro de cada
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
    }

    // Los canales de una categoria, en su propia pagina.
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
    }

    function Recents() {
        var view = store.visibleRecents();
        return html`<section class="screen" id="screen-recents">
            <${Bar} title="Recent" meta=${view.label} metaId="recentsMeta" titleId="recentsTitle"
                search=${html`<${Search} id="recentsSearch" countId="recentsSearchCount" scope="recents"
                    resetKey="recents" placeholder="Search recents" count=${view.count}
                    onInput=${function (value) { store.setSearch('recents', value); }} />`} />
            <${ChannelList} id="recentsList" view=${view} />
        </section>`;
    }

    function Favs() {
        var view = store.visibleFavorites();
        return html`<section class="screen" id="screen-favs">
            <${Bar} title="Favorites" meta=${view.label} metaId="favsMeta" titleId="favsTitle"
                search=${html`<${Search} id="favsSearch" countId="favsSearchCount" scope="favorites"
                    resetKey="favorites" placeholder="Search favorites" count=${view.count}
                    onInput=${function (value) { store.setSearch('favorites', value); }} />`} />
            ${view.total ? null : html`<p class="empty">Mark channels with the red key while you watch them and they will show up here.</p>`}
            <${ChannelList} id="favList" view=${view} />
        </section>`;
    }

    // Categorías por proveedor: se eligen las que se ven y se guardan.
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
    }

    // Alta (dos pasos: tipo y campos) y edición (un paso).
    function SourceForm(props) {
        var state = store.state;
        var editing = props.mode === 'edit';
        var list = editing ? store.listById(state.editId) : null;
        var type = editing ? fieldTypeOf(list) : state.addType;
        var fields = FIELD_SETS[type] || [];
        var refs = useRef({});
        var errorState = useState('');
        var error = errorState[0];
        var setError = errorState[1];
        var fileState = useState(null);
        var file = fileState[0];
        var setFile = fileState[1];

        useEffect(function () {
            var values = {};
            if (list) {
                values.url = list.url;
                values.origin = list.origin || (list.source === 'creds' || list.kind === 'xtream' ? list.url : '');
                values.user = list.user || '';
                values.pass = list.pass || '';
                values.mac = list.mac || '';
                values.text = list.text || '';
                values.name = list.name || '';
            }
            Object.keys(refs.current).forEach(function (key) {
                var element = refs.current[key];
                if (element) element.value = values[key] || '';
            });
        }, [props.mode, state.editId, state.addType]);

        function readFields() {
            var values = { name: '', user: '', pass: '', mac: '', text: '', url: '', origin: '' };
            Object.keys(refs.current).forEach(function (key) {
                var element = refs.current[key];
                if (element && element.value !== undefined) values[key] = element.value.trim();
            });
            if (file) {
                values.text = file.text;
                values.fileName = file.name;
            }
            return values;
        }

        function save() {
            var values = readFields();
            if (editing) {
                store.updateList(list.id, { type: type, url: values.url, origin: values.origin, user: values.user, pass: values.pass, mac: values.mac, text: values.text, name: values.name })
                    .catch(function (failure) { setError(failure.message); });
                return;
            }
            var built = store.buildSource(type, values);
            if (built.error) { setError(built.error); return; }
            setError('');
            store.addList(built.list).catch(function (failure) { setError(failure.message); });
        }

        function remove() {
            store.askConfirm('Delete “' + list.name + '”? Favorites are kept.', function () {
                store.removeList(list.id);
                store.notify('Source deleted');
                store.goHome();
            });
        }

        function readFile(event) {
            var chosen = event.target.files && event.target.files[0];
            if (!chosen) return;
            var reader = new FileReader();
            reader.onload = function () {
                setFile({ name: chosen.name, text: String(reader.result || '') });
                setError('');
            };
            reader.onerror = function () { setError('Could not read the file'); };
            reader.readAsText(chosen);
        }

        return html`<section class="screen" id=${editing ? 'screen-edit' : 'screen-add'}>
            <${Bar} title=${editing ? 'Edit source' : 'Add source'}
                titleId=${editing ? 'editTitle' : 'addTitle'}
                meta=${editing ? listLabelOrEmpty(list) : typeTitle(type)}
                actions=${editing ? null : html`<div class="bar-actions" id="addActions">
                    <button class="btn" id="changeTypeBtn" tabindex="-1" onClick=${function () { store.openAdd(); }}>Change type</button>
                </div>`} />
            <div class="panel" id="sourceForm">
                ${fields.map(function (field) {
                    return html`<label for=${'field-' + field.id}>${field.label}</label>
                    ${field.multiline
                        ? html`<textarea id=${'field-' + field.id} rows="4" ref=${function (element) { refs.current[field.id] = element; }}
                            placeholder=${field.placeholder || ''} spellcheck="false" tabindex="-1"></textarea>`
                        : html`<input id=${'field-' + field.id} ref=${function (element) { refs.current[field.id] = element; }}
                            type="text" placeholder=${field.placeholder || ''} autocomplete="off" autocapitalize="off" spellcheck="false" tabindex="-1" />`}`;
                })}
                ${type === 'file' ? html`<label for="pickFile">Fichero .m3u</label>
                    <button class="btn pick" id="pickFile" tabindex="-1" onClick=${function () {
                        if (refs.current.file) refs.current.file.click();
                    }}>Choose file</button>
                    <input class="file" id="field-file" type="file" accept=".m3u,.m3u8,text/plain"
                        ref=${function (element) { refs.current.file = element; }} tabindex="-1" onChange=${readFile} />
                    <p class="hint ${file ? 'ok' : ''}" id="fileHint">
                        ${file ? file.name + ' · ' + store.formatCount((file.text.match(/#EXTINF/g) || []).length) + ' entries' : 'Press OK to choose the file on the USB drive'}
                    </p>` : null}
                <label for="field-name">Name</label>
                <input id="field-name" ref=${function (element) { refs.current.name = element; }} type="text"
                    placeholder="Optional: taken from the address" autocomplete="off" tabindex="-1" />
                <p class="err" id="formError">${error}</p>
                <div class="actions">
                    <button class="btn primary" id="formSave" tabindex="-1" onClick=${save}>
                        ${editing ? 'Save changes' : 'Save source'}
                    </button>
                    ${editing ? html`<button class="btn danger" id="formDelete" tabindex="-1" onClick=${remove}>Delete source</button>` : null}
                    <button class="btn" id="formCancel" tabindex="-1"
                        onClick=${function () { store.goHome(); }}>Cancel</button>
                </div>
            </div>
        </section>`;
    }

    // Un M3U guardado puede venir de una URL o de texto pegado: se edita con el
    // juego de campos que le corresponde.
    function fieldTypeOf(list) {
        if (!list) return 'url';
        var kind = store.listKind(list);
        if (kind !== 'm3u') return kind;
        return list.source === 'text' ? 'raw' : 'url';
    }

    function listLabelOrEmpty(list) { return list ? store.listLabel(list) : ''; }

    function typeTitle(type) {
        for (var i = 0; i < ADD_TYPES.length; i++) {
            if (ADD_TYPES[i].id === type) return ADD_TYPES[i].hint;
        }
        return '';
    }

    // Primer paso del alta: cómo te quieres conectar (soporta todos los formatos).
    function AddTypePicker() {
        return html`<section class="screen" id="screen-add">
            <${Bar} title="Add source" titleId="addTitle"
                meta="Choose how to connect. You can rename it later." metaId="addMeta" />
            <div class="types" id="addTypes">
                ${ADD_TYPES.map(function (type) {
                    return html`<button class="typecard" data-type=${type.id} tabindex="-1"
                        onClick=${function () { store.chooseType(type.id); }}>
                        <span class="type-icon">${TYPE_ICONS[type.icon]}</span>
                        <span class="type-title">${type.title}</span>
                        <span class="type-hint">${type.hint}</span>
                    </button>`;
                })}
            </div>
        </section>`;
    }

    function Player() {
        var state = store.state;
        var videoRef = useRef(null);
        var overlayState = useState(true);
        var overlay = overlayState[0];
        var setOverlay = overlayState[1];
        var timer = useRef(null);

        useEffect(function () {
            player.init(videoRef.current, {
                onStart: function () { store.playStarted(); },
                onError: function (message) { store.playFailed(message); }
            });
            return function () { player.stop(); };
        }, []);

        useEffect(function () {
            if (state.playing) player.play(state.playing.channel.url);
        }, [state.playing]);

        useEffect(function () {
            function pulse() { show(); }
            document.addEventListener('keydown', pulse);
            return function () { document.removeEventListener('keydown', pulse); };
        }, []);

        function show() {
            setOverlay(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(function () { setOverlay(false); }, OVERLAY_MS);
        }

        var channel = state.playing ? state.playing.channel : null;
        if (!channel) return null;
        var saved = store.isFavorite(state.playing.listId, channel.url);
        var program = state.nowProgram;

        return html`<section class="screen player" id="screen-player">
            <video id="videoPlayer" ref=${videoRef} playsinline></video>
            ${state.playStatus === 'opening' ? html`<div class="player-status" id="playerStatus">
                <div class="spinner"></div>
                <p class="player-status-text">Opening “${channel.name}”…</p>
            </div>` : null}
            ${state.playError ? html`<div class="player-error" id="playError">
                <div class="play-card">
                    <p class="play-why" id="playErrorWhy">${state.playError.message}</p>
                    <h1 class="play-name" id="playErrorName">${channel.name}</h1>
                    <p class="play-hint">You can try again or pick another channel.</p>
                    <div class="play-actions" id="playActions">
                        <button class="btn primary" id="playRetry" tabindex="-1"
                            onClick=${function () { store.retryPlay(); }}>Retry</button>
                        <button class="btn" id="playClose" tabindex="-1"
                            onClick=${function () { store.exitPlayer(); }}>Back</button>
                    </div>
                </div>
            </div>` : null}
            <div class=${'overlay' + (overlay && !state.playError ? ' visible' : '')} id="playerOverlay">
                <div class="ov-info">
                    <p class="ov-live" id="ovLive"><span class="dot"></span>Live</p>
                    <h1 id="ovName">${channel.name}</h1>
                    <p class="ov-group" id="ovGroup">${channel.group || ''}</p>
                    ${program ? html`<p class="ov-program" id="ovProgram">
                        ${program.title}${program.start ? html`<span class="ov-time">${clock(program.start)} – ${clock(program.end)}</span>` : null}
                    </p>` : null}
                </div>
                <button class=${'btn' + (saved ? ' saved' : '')} id="ovFav" tabindex="-1" onClick=${function () {
                    store.toggleFavorite(channel, state.playing.listId);
                    show();
                }}>${saved ? 'Remove from favorites' : 'Add to favorites'}</button>
            </div>
        </section>`;
    }

    // Aviso de carga: dice QUE se esta cargando, en QUE fase esta cada fuente y
    // cuanto lleva, para que una lista grande no parezca una app colgada.
    function Loader() {
        var state = store.state;
        var rows = store.loadingRows();
        return html`<div class="loading" id="loading">
            <div class="spinner"></div>
            <h1 class="loading-title" id="loadingTitle">${state.loading.title}<span
                class="loading-time" id="loadingTime">${store.elapsedOf(state.loading)} s</span></h1>
            <div class="loading-list" id="loadingList">
                ${rows.map(function (row) {
                    // Con una sola fuente, el nombre ya esta en el titular: la fila
                    // se queda solo con el progreso y no lo repite.
                    return html`<div class="loading-row" key=${row.key}>
                        ${rows.length > 1 ? html`<span class="loading-name">${row.name}</span>` : null}
                        <span class="loading-phase">${row.label}${row.count !== undefined
                            ? ' · ' + store.formatCount(row.count) + ' channels' : ''}</span>
                    </div>`;
                })}
            </div>
            <p class="loading-hint" id="loadingHint">Very large playlists take a while.</p>
        </div>`;
    }

    function Toast(props) {
        return html`<div class="toast" id="toast">${props.message}</div>`;
    }

    function NumBuffer(props) {
        return html`<div class="numbuffer" id="numBuffer">${props.value}</div>`;
    }

    function Confirm() {
        var confirm = store.state.confirm;
        return html`<div class="modal" id="confirm">
            <div class="modal-card">
                <p id="confirmText">${confirm.message}</p>
                <div class="actions">
                    <button class="btn" id="confirmCancel" tabindex="-1"
                        onClick=${function () { store.closeConfirm(); }}>Cancel</button>
                    <button class="btn danger" id="confirmOk" tabindex="-1" onClick=${function () {
                        var action = confirm.onAccept;
                        store.closeConfirm();
                        if (action) action();
                    }}>Delete</button>
                </div>
            </div>
        </div>`;
    }

    // Ojo con el nombre: una funcion llamada App aqui dentro sombrearia el App
    // global (hoisting) y store/player/tv se leerian undefined. De ahi "Root".
    function Root() {
        useEffect(function () {
            var request = store.takeFocus();
            if (request) tv.set(request.zone, request.row, request.col);
            else tv.refresh();
        });

        var state = store.state;
        return html`<div class="app">
            <${Rail} screen=${state.screen} />
            <main class="main">
                ${state.screen === 'home' ? html`<${Home} />` : null}
                ${state.screen === 'tv' ? html`<${TvScreen} />` : null}
                ${state.screen === 'tvcat' ? html`<${TvCategoryScreen} />` : null}
                ${state.screen === 'recents' ? html`<${Recents} />` : null}
                ${state.screen === 'favs' ? html`<${Favs} />` : null}
                ${state.screen === 'cats' ? html`<${Categories} />` : null}
                ${state.screen === 'add'
                    ? (state.addType ? html`<${SourceForm} mode="add" />` : html`<${AddTypePicker} />`)
                    : null}
                ${state.screen === 'edit' ? html`<${SourceForm} mode="edit" />` : null}
                ${state.screen === 'player' ? html`<${Player} />` : null}
            </main>
            ${state.numBuffer ? html`<${NumBuffer} value=${state.numBuffer} />` : null}
            ${state.loading ? html`<${Loader} />` : null}
            ${state.confirm ? html`<${Confirm} />` : null}
            ${state.toast ? html`<${Toast} message=${state.toast.message} />` : null}
        </div>`;
    }

    function qsa(selector) {
        return Array.prototype.slice.call(document.querySelectorAll(selector));
    }

    function render() {
        preact.render(html`<${Root} />`, document.getElementById('app'));
    }

    // El store es la fuente de verdad: cada cambio repinta. Se renderiza desde
    // fuera del ciclo de Preact a proposito, para no depender de que un dispatch
    // de hooks lanzado desde un callback externo llegue a propagarse.
    store.subscribe(render);

    return { render: render, qsa: qsa };
})();
