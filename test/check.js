// node test/check.js
//
// Capa lógica: carga los fuentes reales (sin DOM) y comprueba parseo, tipos de
// fuente, auto-detección, filtros, categorías, búsqueda, favoritos, recientes,
// números de canal, EPG, alta/edición/borrado y los ids que enlazan el JS con la
// UI. La UI (Preact) se valida con node --check y con el test de DOM.
const fs = require('fs');
const path = require('path');

// localStorage de mentira: el store guarda ahi lo que no debe perderse entre
// arranques (fuentes, favoritos y la senal de "ya se sembro la fuente de fabrica").
global.localStorage = (function () {
    const data = {};
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
        setItem: function (key, value) { data[key] = String(value); },
        removeItem: function (key) { delete data[key]; },
        clear: function () { Object.keys(data).forEach(function (key) { delete data[key]; }); }
    };
})();

const root = path.join(__dirname, '..');
let failed = 0;

function check(label, condition, detail) {
    if (condition) {
        console.log('ok    ' + label);
        return;
    }
    failed++;
    console.log('FALLO ' + label + (detail ? '  ->  ' + detail : ''));
}

function source(relative) {
    return fs.readFileSync(path.join(root, relative), 'utf8');
}

// --- módulos sin DOM ---------------------------------------------------------
const App = {};
function load(file) {
    try {
        new Function('App', source(file))(App);
    } catch (error) {
        failed++;
        console.log('FALLO ' + file + ' no carga: ' + error.message);
    }
}
['js/api.js', 'js/store.js', 'js/player.js'].forEach(load);

const api = App.api;
const store = App.store;
const player = App.player;

// Red simulada: api.load() recibe la playlist de ejemplo, así que alta, edición
// y carga se prueban de verdad (parseo incluido) sin salir de node.
const b64 = value => Buffer.from(value, 'utf8').toString('base64');
global.fetch = function () {
    return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: function () { return null; } },
        text: function () { return Promise.resolve(source('test/sample.m3u')); },
        json: function () {
            return Promise.resolve({
                epg_listings: [{
                    title: b64('Programa de prueba'),
                    description: b64('Descripción'),
                    start: b64('2026-09-16 21:00:00'),
                    end: b64('2026-09-16 22:00:00')
                }]
            });
        }
    });
};

function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// --- M3U ---------------------------------------------------------------------
const playlist = [
    '#EXTM3U',
    '#EXTINF:-1 tvg-id="la1" tvg-logo="http://cdn/logo.png" group-title="España",La 1 HD',
    'https://panel.example/live/user/pass/1.ts',
    '#EXTINF:-1 group-title="VOD | Acción",Una película (2024)',
    'https://panel.example/movie/user/pass/99.mp4',
    '#EXTINF:-1 group-title="Series",Una serie S01E01',
    'https://panel.example/series/user/pass/77.mp4',
    ''
].join('\r\n');

const channels = api.parseM3u(playlist);
check('parseM3u descarta películas y series', channels.length === 1, 'quedaron ' + channels.length);
check('parseM3u lee nombre, grupo y logo',
    !!channels[0] && channels[0].name === 'La 1 HD' && channels[0].group === 'España' && channels[0].logo === 'http://cdn/logo.png',
    JSON.stringify(channels[0]));
check('parseM3u lee la url del canal', !!channels[0] && channels[0].url === 'https://panel.example/live/user/pass/1.ts');
check('parseM3u aguanta una lista vacía', api.parseM3u('#EXTM3U\r\n').length === 0);
check('parseM3u con el fichero de ejemplo deja 9 canales', api.parseM3u(source('test/sample.m3u')).length === 9);

// --- Xtream ------------------------------------------------------------------
const xtreamCases = [
    ['https://operator2.barfik.org/get.php?username=abc&password=def&type=m3u_plus',
        { origin: 'https://operator2.barfik.org', user: 'abc', pass: 'def' }],
    ['http://host.ddns.net:8080/player_api.php?username=a&password=b',
        { origin: 'http://host.ddns.net:8080', user: 'a', pass: 'b' }],
    ['https://x.tv/panel_api.php?username=u&password=p', { origin: 'https://x.tv', user: 'u', pass: 'p' }],
    ['https://x.tv/get.php?username=a%40b&password=p%3A1', { origin: 'https://x.tv', user: 'a@b', pass: 'p:1' }],
    ['https://iptv-org.github.io/iptv/index.country.m3u', null],
    ['https://x.tv/lists/mine.m3u?username=u&password=p', null],
    ['https://x.tv/get.php?username=u', null],
    ['https://x.tv/get.php?username=&password=p', null],
    ['', null], [null, null], [undefined, null]
];
xtreamCases.forEach(function (item) {
    const got = api.parseXtreamUrl(item[0]);
    check('parseXtreamUrl ' + JSON.stringify(item[0]),
        JSON.stringify(got) === JSON.stringify(item[1]),
        'esperaba ' + JSON.stringify(item[1]) + ', salió ' + JSON.stringify(got));
});
check('parsePortal acepta portal + credenciales',
    JSON.stringify(api.parsePortal('http://host:8080', 'u', 'p')) ===
    JSON.stringify({ origin: 'http://host:8080', user: 'u', pass: 'p' }));

// --- tipos de fuente ---------------------------------------------------------
var built = store.buildSource('url', { url: 'http://panel.tv/list.m3u' });
check('M3U por URL', built.list.kind === 'm3u' && built.list.source === 'url');
check('el nombre se deduce de la dirección', built.list.name === 'list', built.list.name);

built = store.buildSource('url', { url: 'http://panel.tv/get.php?username=a&password=b' });
check('una URL con credenciales se guarda como Xtream',
    built.list.kind === 'xtream' && built.list.user === 'a' && built.list.pass === 'b', JSON.stringify(built.list));

built = store.buildSource('raw', { text: '#EXTM3U\n#EXTINF:-1,Algo\nhttp://x/1.ts' });
check('M3U pegado como texto', built.list.kind === 'm3u' && built.list.source === 'text');
check('el texto que no es M3U se rechaza', !!store.buildSource('raw', { text: 'hola' }).error);
check('un fichero sin elegir se rechaza', !!store.buildSource('file', { name: 'x' }).error);

built = store.buildSource('xtream', { origin: 'http://host:8080', user: 'u', pass: 'p', name: 'Mi panel' });
check('Xtream con servidor y credenciales',
    built.list.kind === 'xtream' && built.list.source === 'creds' && built.list.name === 'Mi panel');
check('Xtream sin credenciales se rechaza', !!store.buildSource('xtream', { origin: 'http://host:8080' }).error);

built = store.buildSource('stalker', { origin: 'http://portal.tv/c', mac: 'aa:bb:cc:dd:ee:ff' });
check('Stalker con portal y MAC', built.list.kind === 'stalker' && built.list.mac === 'AA:BB:CC:DD:EE:FF');
check('una MAC con formato raro se rechaza', !!store.buildSource('stalker', { origin: 'http://p', mac: 'nope' }).error);

// --- auto-detección ----------------------------------------------------------
let guess = api.parseAuto('URL: http://panel.tv:8080\nUser: pepe\nPass: 1234');
check('detecta Xtream en el mensaje del proveedor', guess.list && guess.list.kind === 'xtream'
    && guess.list.user === 'pepe' && guess.list.pass === '1234', JSON.stringify(guess));

guess = api.parseAuto('MAC: 00:1A:79:AA:BB:CC\nPortal: http://portal.tv/c');
check('detecta Stalker por la MAC', guess.list && guess.list.kind === 'stalker'
    && guess.list.mac === '00:1A:79:AA:BB:CC', JSON.stringify(guess));

guess = api.parseAuto('http://panel.tv/lista.m3u8');
check('detecta una lista por la dirección', guess.list && guess.list.kind === 'm3u');
guess = api.parseAuto('#EXTM3U\n#EXTINF:-1,Canal\nhttp://x/1.ts');
check('detecta el texto pegado', guess.list && guess.list.source === 'text');
check('avisa cuando no reconoce nada', !!api.parseAuto('buenas tardes').error);
check('una URL de get.php con credenciales se detecta como Xtream',
    api.parseAuto('http://h/get.php?username=u&password=p').list.kind === 'xtream');

// --- búsqueda ----------------------------------------------------------------
const sample = [{ name: 'La 1 HD' }, { name: 'laSexta' }, { name: 'TVE Internacional' }];
check('match ignora mayúsculas', api.match(sample, 'LA 1').length === 1);
check('match busca en cualquier posición', api.match(sample, 'nacional').length === 1);
check('match sin consulta devuelve todo', api.match(sample, '   ').length === 3);
check('match sin resultados', api.match(sample, 'no-existe').length === 0);

// --- fuente de fábrica --------------------------------------------------------
global.localStorage.clear();
store.init();
check('una instalación nueva trae una fuente pública de fábrica', (function () {
    var list = store.state.lists[0];
    return store.state.lists.length === 1 && list.name === 'Free channels of the world'
        && list.url === 'https://iptv-org.github.io/iptv/index.country.m3u'
        && list.kind === 'm3u' && list.source === 'url';
})(), JSON.stringify(store.state.lists));
check('y no se duplica al volver a arrancar', (function () {
    store.init();
    return store.state.lists.length === 1;
})());
check('si el usuario la borra, no vuelve', (function () {
    store.removeList(store.state.lists[0].id);
    store.init();
    return store.state.lists.length === 0;
})());
check('y a quien ya tiene fuentes no se le añade nada', (function () {
    global.localStorage.setItem('ts.lists', JSON.stringify([{ id: 'x1', name: 'Mía', kind: 'm3u', source: 'url', url: 'http://h/x.m3u' }]));
    global.localStorage.removeItem('ts.seeded');
    store.init();
    var ok = store.state.lists.length === 1 && store.state.lists[0].id === 'x1';
    global.localStorage.clear();
    return ok;
})());

// --- store: fuentes, filtro y categorías --------------------------------------
store.init();
store.state.lists = [
    { id: 'l1', name: 'panel', kind: 'xtream', source: 'creds', origin: 'http://h', user: 'u', pass: 'p' },
    { id: 'l2', name: 'lista', kind: 'm3u', source: 'url', url: 'http://h2/list.m3u' },
    { id: 'l3', name: 'portal', kind: 'stalker', source: 'mac', origin: 'http://p', mac: '00:1A:79:00:00:01' }
];
store.state.channels.l1 = [
    { name: 'La 1', group: 'España', url: 'u1' },
    { name: 'La 2', group: 'España', url: 'u2' },
    { name: 'DAZN 1', group: 'Deportes', url: 'u3' }
];
store.state.channels.l2 = [{ name: 'Teledeporte', group: 'Deportes', url: 'u4' }];
store.state.groups.l1 = store.groupNames(store.state.channels.l1);
store.state.groups.l2 = store.groupNames(store.state.channels.l2);
store.state.screen = 'home';

check('groupNames ordena y no repite', JSON.stringify(store.groupsOf('l1')) === JSON.stringify(['Deportes', 'España']));

const sources = store.sources();
check('el filtro por tipo cuenta cada tipo', sources.types.length === 4 && sources.types[1].count === 1 && sources.types[2].count === 1,
    JSON.stringify(sources.types));
store.setFilter('xtream');
check('filtrar por Xtream deja solo esa fuente', store.sources().items.length === 1 && store.sources().items[0].id === 'l1');
store.setFilter('all');
check('sin filtro salen todas', store.sources().items.length === 3);

// --- TV por categorías --------------------------------------------------------
check('la TV agrupa por categoría, no vuelca los canales sueltos', (function () {
    var view = store.tvCategories();
    return view.rows.length === 2 && view.rows[0].name === 'Deportes' && view.rows[1].name === 'España';
})(), JSON.stringify(store.tvCategories().rows));
var shared = store.tvCategories().rows.filter(function (row) { return row.name === 'Deportes'; })[0];
check('una categoría de dos fuentes se junta y cuenta las dos',
    shared.count === 2 && shared.sources === 2, JSON.stringify(shared));
check('la búsqueda de TV filtra categorías', (function () {
    store.setSearch('tv', 'esp');
    var hit = store.tvCategories().rows;
    store.setSearch('tv', '');
    return hit.length === 1 && hit[0].name === 'España';
})());

store.state.muted = undefined;
store.openCategories();
store.toggleCategory('l1', 'Deportes');
store.saveCategories();
check('una categoría silenciada deja de aportar canales',
    JSON.stringify(store.groupsOf('l1').filter(function (group) {
        return (store.listById('l1').muted || []).indexOf(group) === -1;
    })) === JSON.stringify(['España']));
check('la pantalla TV salta los canales de categorías silenciadas',
    store.allChannels().filter(function (channel) { return channel.name === 'DAZN 1'; }).length === 0);
check('los grupos siguen estando para poder reactivarlos', store.groupsOf('l1').length === 2);

store.openCategories();
const catView = store.categoriesView();
// l1 aporta 2 categorías (una silenciada), l2 una; l3 todavía no tiene canales.
check('la vista de categorías cuenta activas y totales',
    catView.selected === 2 && catView.total === 3, catView.selected + '/' + catView.total);
check('la vista de categorías se agrupa por proveedor',
    catView.sections.length === 2 && catView.sections[0].list.id === 'l1');
store.toggleCategory('l1', 'Deportes');
check('volver a marcar una categoría la reactiva', store.categoriesView().selected === 3);
store.setAllCategories(false);
check('"ninguna" desactiva todas', store.categoriesView().selected === 0);
store.setAllCategories(true);
store.setCatSearch('depor');
check('las categorías se pueden buscar', store.categoriesView().total === 2, String(store.categoriesView().total));
store.setCatSearch('');
store.toggleCategory('l1', 'Deportes');
store.saveCategories();
check('al guardar se persiste la categoría silenciada',
    JSON.stringify(store.groupsOf('l1').filter(function (group) {
        return (store.listById('l1').muted || []).indexOf(group) === -1;
    })) === JSON.stringify(['España']));

// --- TV de una sola fuente ----------------------------------------------------
store.openSource('l1');
check('la TV de una fuente solo ofrece sus categorías', (function () {
    var view = store.tvCategories();
    return store.state.tvSource === 'l1' && view.rows.length === 1 && view.rows[0].name === 'España'
        && view.rows[0].count === 2 && /^panel · /.test(view.label);
})(), JSON.stringify(store.tvCategories().rows));
check('y dentro solo sus canales', (function () {
    store.openTvCategory('España');
    var view = store.visibleTvCategory();
    return view.total === 2 && view.zone === 'tvChannels';
})(), JSON.stringify(store.visibleTvCategory()));
check('volver de la categoría no pierde la fuente', (function () {
    store.backToTv();
    return store.state.screen === 'tv' && store.state.tvSource === 'l1';
})());
check('la TV de todas las fuentes vuelve a juntarlas', (function () {
    store.openTv();
    return store.state.tvSource === null && store.tvCategories().rows.length === 2;
})());

// --- vistas y números ---------------------------------------------------------
check('la vista TV junta los canales de todas las fuentes', store.allChannels().length === 3,
    String(store.allChannels().length));
check('stats resume fuentes y canales', store.stats().counts === '3 sources, 4 channels', store.stats().counts);

store.play(store.state.channels.l1[0], 'l1', store.state.channels.l1);
store.play(store.state.channels.l1[1], 'l1', store.state.channels.l1);
store.play(store.state.channels.l1[0], 'l1', store.state.channels.l1);
check('recientes guarda lo último visto sin repetir', store.state.recent.length === 2 && store.state.recent[0].url === 'u1');
store.exitPlayer();

check('la categoría tiene su propia pantalla con sus canales', (function () {
    store.openTvCategory('España');
    var view = store.visibleTvCategory();
    return store.state.screen === 'tvcat' && store.state.catName === 'España'
        && view.total === 2 && view.zone === 'tvChannels';
})(), JSON.stringify(store.visibleTvCategory()));
check('el salto por número no existe en la pantalla de categorías', (function () {
    store.openTv();
    store.takeFocus();                      // el foco que pide la propia pantalla
    store.pushDigit('2');
    store.commitDigits();
    var request = store.takeFocus();
    var message = store.state.toast && store.state.toast.message;
    return request === null && /No channel 2/.test(message || '');
})());
store.openTvCategory('España');
store.pushDigit('2');
check('el buffer de canal se va formando', store.state.numBuffer === '2');
check('Enter salta al canal tecleado', (function () {
    var request = null;
    store.commitDigits();
    request = store.takeFocus();
    return !!request && request.zone === 'tvChannels' && request.row === 1;
})());
store.pushDigit('9'); store.pushDigit('9'); store.pushDigit('9');
store.commitDigits();
check('un número que no existe no mueve el foco', store.takeFocus() === null);
store.pushDigit('1');
check('Back limpia el buffer', store.clearDigits() === true && store.clearDigits() === false);

// --- un canal que no arranca -------------------------------------------------
store.play(store.state.channels.l1[0], 'l1', store.state.channels.l1);
check('al abrir un canal el reproductor dice que esta abriendo',
    store.state.screen === 'player' && store.state.playStatus === 'opening' && !store.state.playError);
store.playStarted();
check('cuando arranca deja de avisar', store.state.playStatus === 'playing');
store.playFailed('No connection to the channel');
check('si falla guarda el motivo y no se queda en negro',
    store.state.playStatus === 'error' && store.state.playError.message === 'No connection to the channel');
check('y el foco se va a los botones de la tarjeta', (function () {
    var request = store.takeFocus();
    return !!request && request.zone === 'playError';
})());
check('el motivo se puede leer', (function () {
    return player.describe({ name: 'PLAYER_ERROR_CONNECTION_FAILED' }) === 'No connection to the channel'
        && player.describe({}) === 'Could not open the channel'
        && player.describe(new Error('HTTP 404')) === 'HTTP 404';
})());
store.retryPlay();
check('reintentar limpia el error y vuelve a abrir',
    store.state.playStatus === 'opening' && store.state.playError === null);
store.exitPlayer();
check('salir del reproductor deja el estado limpio',
    store.state.playStatus === 'idle' && store.state.playError === null);

// --- favoritos ----------------------------------------------------------------
check('favorito nuevo', store.toggleFavorite(store.state.channels.l1[0], 'l1') === true);
check('no se duplica', store.state.favorites.length === 1);
check('se puede buscar en favoritos', (function () {
    store.setSearch('favorites', 'la 1');
    var found = store.visibleFavorites().total;
    store.setSearch('favorites', '');
    return found === 1;
})());
check('quitar favorito', store.toggleFavorite(store.state.channels.l1[0], 'l1') === false && store.state.favorites.length === 0);

// --- EPG ---------------------------------------------------------------------
const xtreamChannel = { name: 'La 1', group: 'España', url: 'https://panel.example/live/user/pass/1.ts' };
check('programOf vacío antes de pedirlo', store.programOf(xtreamChannel) === null);
store.loadProgramFor(xtreamChannel);

// --- empaquetado y UI ---------------------------------------------------------
// Los ficheros no se listan a mano: salen de index.html, que es lo que carga la
// TV. Al partir un modulo, los tests se enteran solos.
function walk(dir, out) {
    out = out || [];
    fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach(function (entry) {
        const relative = dir + '/' + entry.name;
        if (entry.isDirectory()) walk(relative, out);
        else if (/\.js$/.test(entry.name)) out.push(relative);
    });
    return out;
}

const html = source('index.html');
const scripts = Array.from(html.matchAll(/<script src="([^"]+)"/g)).map(function (m) { return m[1]; });
const ours = scripts.filter(function (file) { return file.indexOf('vendor/') !== 0; });
const uiFiles = ours.filter(function (file) { return file !== 'js/app.js'; });

check('index.html carga todos los módulos del repo',
    walk('js').every(function (file) { return scripts.indexOf(file) !== -1; }),
    walk('js').filter(function (file) { return scripts.indexOf(file) === -1; }).join(', '));

const ids = new Set();
['index.html'].concat(uiFiles).forEach(function (file) {
    Array.from(source(file).matchAll(/id="([A-Za-z0-9_-]+)"/g)).forEach(function (match) {
        ids.add(match[1]);
    });
});

const selectors = [];
Array.from(source('js/app.js').matchAll(/zone\('[a-zA-Z]+',\s*'([^']+)'/g)).forEach(function (match) {
    selectors.push(match[1]);
});
ours.forEach(function (file) {
    Array.from(source(file).matchAll(/qs?a?\(\s*'([^']+)'/g)).forEach(function (match) {
        selectors.push(match[1]);
    });
});

const missing = [];
selectors.forEach(function (selector) {
    Array.from(selector.matchAll(/#([A-Za-z0-9_-]+)/g)).forEach(function (match) {
        if (!ids.has(match[1])) missing.push(match[1] + '  (en "' + selector + '")');
    });
});
check('cada selector apunta a un id que existe', missing.length === 0, missing.join(', '));
check('se declaran las zonas de foco esperadas', selectors.length >= 14, selectors.length + ' selectores');
check('los elementos vacíos van autocerrados (htm lo exige)',
    !/<(input|br|img|hr|meta|link)\b[^>]*[^/]>/i.test(
        ours.filter(function (file) { return file.indexOf('vendor/') === -1; })
            .map(source).join('\n')));

const manifest = source('config.xml');
check('el id de paquete tiene 10 caracteres (Tizen lo exige)',
    /package="[A-Za-z0-9]{10}"/.test(manifest), (manifest.match(/package="([^"]*)"/) || [])[1]);
// Desde 2015 ese privilegio no se usa en apps web de TV: pedirlo hace que el
// instalador rechace el paquete y obliga a la variante Public, que no tiene AVPlay.
check('config.xml no pide el privilegio avplay (no se usa desde 2015)',
    manifest.indexOf('privilege/avplay') === -1);
check('config.xml apunta a index.html', manifest.indexOf('<content src="index.html" />') !== -1);
check('config.xml usa el perfil de TV', manifest.indexOf('tv-samsung') !== -1);
check('hay icono', fs.existsSync(path.join(root, 'icon.png')));

check('cada <script src> existe', scripts.every(function (file) { return fs.existsSync(path.join(root, file)); }));
check('los 3 vendor están en el paquete',
    scripts.filter(function (file) { return file.indexOf('vendor/') === 0; }).length === 3);
check('ningún script sale a un CDN', scripts.every(function (file) { return file.indexOf('http') === -1; }));

const bundle = ours.map(source).join('\n');
check('el runtime no menciona ningún CDN', !/unpkg|jsdelivr|cdnjs|cdn\./i.test(bundle));

// --- alta, edición y borrado (con red simulada) -------------------------------
const pending = [
    store.updateList('nope', { url: 'http://h/x.m3u' }).then(
        function () { return 'no falló al editar una fuente inexistente'; },
        function () { return null; }),
    store.updateList('l2', { type: 'url', url: 'sin-http' }).then(
        function () { return 'no validó la dirección'; },
        function () { return null; }),
    store.addList(store.buildSource('url', { url: 'http://localhost/test/sample.m3u' }).list).then(
        function (list) { return list.length === 9 ? null : 'cargó ' + list.length + ' canales'; },
        function (error) { return 'no añadió la fuente: ' + error.message; }),
    store.updateList('l2', { type: 'url', url: 'http://localhost/test/sample.m3u', name: 'lista editada' }).then(
        function (list) { return list.length === 9 ? null : 'editó con ' + list.length + ' canales'; },
        function (error) { return 'no editó la fuente: ' + error.message; }),
    wait(30).then(function () {
        return store.programOf(xtreamChannel) && store.programOf(xtreamChannel).title === 'Programa de prueba'
            ? null : 'el EPG no llegó al canal';
    })
];

Promise.all(pending).then(function (results) {
    const problems = results.filter(function (item) { return !!item; });
    check('alta, edición, EPG y validaciones se comportan', problems.length === 0, problems.join(' | '));
    const edited = store.listById('l2');
    check('editar deja el nombre y la dirección nuevos',
        !!edited && edited.name === 'lista editada' && edited.url === 'http://localhost/test/sample.m3u',
        JSON.stringify(edited));
    check('editar recarga los canales',
        store.channelsOf('l2').length === 9, String(store.channelsOf('l2').length));
    check('editar invalida la caché de la pantalla TV', store.allChannels().length >= 9);

    console.log('');
    console.log(failed ? failed + ' comprobaciones FALLIDAS' : 'todo correcto');
    process.exit(failed ? 1 : 0);
});
