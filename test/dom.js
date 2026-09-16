// node test/dom.js
//
// Arranca la app de verdad en un DOM (jsdom): pinta, navega con el mando,
// añade una lista, entra en ella, busca, reproduce, guarda un favorito y borra.
// Esto es lo que caza los fallos que node --check y las pruebas de lógica no
// ven (un componente que sombrea un global, un <input> sin autocerrar...).
//
// Requiere jsdom: npm install
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.join(__dirname, '..');
const sampleM3u = fs.readFileSync(path.join(root, 'test/sample.m3u'), 'utf8');
let failed = 0;

function check(label, condition, detail) {
    if (condition) {
        console.log('ok    ' + label);
        return;
    }
    failed++;
    console.log('FALLO ' + label + (detail ? '  ->  ' + detail : ''));
}

// Contrato CSS <-> markup: si se renombra una clase, el estilo se cae en
// silencio. Se comprueba en la pantalla donde vive cada elemento.
function checkClasses(label, pairs) {
    const missing = pairs.filter(function (pair) { return !document.querySelector(pair[0]); })
        .map(function (pair) { return pair[1]; });
    check(label, missing.length === 0, missing.join(', '));
}

function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', function (error) {
    errors.push(String(error.detail ? error.detail.stack || error.detail.message : error.message));
});
virtualConsole.on('error', function () { errors.push('console.error: ' + Array.prototype.join.call(arguments, ' ')); });

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost:8000/',
    pretendToBeVisual: true,
    virtualConsole: virtualConsole
});
const window = dom.window;
const document = window.document;

window.Element.prototype.scrollIntoView = function () {};
window.HTMLMediaElement.prototype.load = function () {};
window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
window.HTMLMediaElement.prototype.pause = function () {};

// jsdom no calcula layout y offsetTop es 0 en todo, así que el motor de zonas
// (que agrupa en filas por offsetTop, correcto en una TV) vería una sola fila.
// Aquí cada elemento cae en su propia fila, que es como se navegan estas listas.
Object.defineProperty(window.HTMLElement.prototype, 'offsetTop', {
    get: function () {
        return Array.prototype.indexOf.call(document.querySelectorAll('*'), this) * 100;
    }
});

const b64 = value => Buffer.from(value, 'utf8').toString('base64');
window.fetch = function () {
    return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: function () { return null; } },
        text: function () { return Promise.resolve(sampleM3u); },
        json: function () {
            return Promise.resolve({
                epg_listings: [
                    {
                        title: b64('Programa de prueba'),
                        start: b64('2026-09-16 21:00:00'),
                        end: b64('2026-09-16 22:00:00')
                    },
                    {
                        title: b64('El siguiente'),
                        start: b64('2026-09-16 22:00:00'),
                        end: b64('2026-09-16 23:30:00')
                    }
                ]
            });
        }
    });
};
window.addEventListener('error', function (event) {
    errors.push('window.error: ' + ((event.error && event.error.stack) || event.message));
});

function press(keyCode) {
    const event = new window.KeyboardEvent('keydown', { bubbles: true });
    Object.defineProperty(event, 'keyCode', { value: keyCode });
    document.dispatchEvent(event);
}

function focused() {
    return document.querySelector('.focused');
}

// Solo puede haber una pantalla montada: dos a la vez se ven apiladas.
function screens() {
    return Array.prototype.map.call(document.querySelectorAll('[id^="screen-"]'), function (el) { return el.id; });
}

function onlyScreen(id) {
    const mounted = screens();
    return mounted.length === 1 && mounted[0] === id;
}

function typeInto(selector, value) {
    const input = document.querySelector(selector);
    input.value = value;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    return input;
}

async function run() {
    // Se carga exactamente lo que carga index.html, en su orden: así un módulo
    // nuevo entra en los tests sin tocar nada aquí.
    const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const scripts = Array.from(indexSource.matchAll(/<script src="([^"]+)"/g)).map(function (m) { return m[1]; });
    scripts.forEach(function (file) {
        window.eval(fs.readFileSync(path.join(root, file), 'utf8'));
    });

    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await wait(50);

    check('la app pinta algo', document.getElementById('app').innerHTML.length > 100);
    check('sin errores de runtime', errors.length === 0, errors.join(' | '));
    check('pantalla de inicio montada', !!document.getElementById('screen-home'));
    check('y es la única pantalla montada', onlyScreen('screen-home'), screens().join(', '));
    check('el rail tiene sus cuatro secciones', document.querySelectorAll('.rail .rail-btn').length === 4);
    // Una instalación nueva trae la fuente pública de fábrica, y el foco empieza
    // en ella (no en la fila de añadir).
    check('al arrancar está la fuente pública de fábrica',
        document.querySelectorAll('#sourceList .row.source').length === 1
        && document.querySelector('#sourceList .row-name').textContent === 'Free channels of the world'
        && document.querySelector('#sourceList .kind').textContent === 'M3U',
        document.querySelector('#sourceList .row-name') ? document.querySelector('#sourceList .row-name').textContent : '(sin fila)');
    check('y el foco empieza en ella',
        !!focused() && focused().classList.contains('source'), focused() ? focused().className : '(nada)');
    check('el filtro por tipo tiene sus cuatro opciones', document.querySelectorAll('#typeList .type').length === 4);
    checkClasses('el inicio usa las clases que estiliza el CSS', [
        ['.rail .brand', 'marca'], ['.rail .wordmark', 'marca de texto'],
        ['.rail .rail-btn.active', 'rail activo'], ['.bar h1', 'titular'],
        ['#listCounts.meta', 'resumen'], ['#typeList .type', 'filtro de tipo'],
        ['#sourceList.rows', 'lista de fuentes'], ['#sourceList .row.add', 'fila de añadir'],
        ['#homeActions .btn', 'botón de añadir']
    ]);

    // Se borra la de fábrica y el recorrido sigue con una lista propia.
    press(403);
    await wait(60);
    check('la tecla roja pregunta antes de borrar la de fábrica', !!document.querySelector('#confirm .modal-card'));
    document.getElementById('confirmOk').click();
    await wait(80);
    check('y la de fábrica se puede borrar como cualquier otra',
        document.querySelectorAll('#sourceList .row.source').length === 0);
    check('el foco vuelve a la fila de añadir',
        !!focused() && focused().classList.contains('add'), focused() ? focused().className : '(nada)');

    press(37);
    check('izquierda lleva al filtro de tipo', !!focused() && focused().classList.contains('type'));
    press(37);
    check('otra vez a la izquierda llega al rail', !!focused() && focused().classList.contains('rail-btn'));
    press(39);
    check('derecha vuelve al filtro', !!focused() && focused().classList.contains('type'));
    press(39);
    check('derecha otra vez vuelve a las fuentes', !!focused() && focused().classList.contains('row'));

    // Alta en dos pasos: primero cómo conectar (todos los formatos), luego los campos.
    press(13);
    await wait(30);
    check('OK abre el selector de tipo', !!document.getElementById('addTypes'));
    check('ofrece los seis formatos', document.querySelectorAll('#addTypes .typecard').length === 6,
        document.querySelectorAll('#addTypes .typecard').length + ' tarjetas');
    check('el foco entra en el selector', !!focused() && focused().classList.contains('typecard'));
    checkClasses('el selector de tipo usa las clases que estiliza el CSS', [
        ['#addTypes .typecard .type-icon', 'icono'], ['#addTypes .typecard .type-title', 'título'],
        ['#addTypes .typecard .type-hint', 'descripción']
    ]);

    document.querySelector('#addTypes .typecard[data-type="url"]').click();
    await wait(30);
    check('elegir tipo abre el formulario', !!document.getElementById('sourceForm'));
    check('el formulario de URL tiene sus campos',
        !!document.getElementById('field-url') && !!document.getElementById('field-name'));
    check('el foco entra en el primer campo', !!focused() && focused().id === 'field-url');
    check('se puede cambiar de tipo', !!document.getElementById('changeTypeBtn'));

    typeInto('#field-url', 'http://localhost:8000/test/sample.m3u');
    document.getElementById('formSave').click();
    await wait(80);
    check('la fuente se añade y vuelve al inicio', !!document.getElementById('screen-home'));
    check('la fila de la fuente aparece', document.querySelectorAll('#sourceList .row.source').length === 1);
    check('la fila dice de qué tipo es', document.querySelector('#sourceList .kind').textContent === 'M3U',
        document.querySelector('#sourceList .kind').textContent);
    check('el resumen cuenta fuente y canales',
        document.getElementById('listCounts').textContent.indexOf('1 source') === 0
        && document.getElementById('listCounts').textContent.indexOf('9 channels') !== -1,
        document.getElementById('listCounts').textContent);

    // Filtro por tipo sobre las fuentes.
    document.querySelector('#typeList .type[data-type], #typeList .type');
    const typeRows = document.querySelectorAll('#typeList .type');
    typeRows[2].click();                            // Xtream
    await wait(40);
    check('filtrar por Xtream deja la lista vacía',
        document.querySelectorAll('#sourceList .row.source').length === 0);
    check('y lo explica', !!document.querySelector('#sourceList .empty'));
    typeRows[1].click();                            // M3U
    await wait(40);
    check('filtrar por M3U muestra la fuente',
        document.querySelectorAll('#sourceList .row.source').length === 1);
    typeRows[0].click();                            // Todas
    await wait(40);

    // La fila de cada fuente lleva su botón de editar a la derecha, y la fila en
    // sí lleva a la TV de esa fuente: Fuentes es solo para gestionar.
    check('cada fuente tiene su botón de editar', document.querySelectorAll('#sourceList .edit').length === 1);
    window.App.tv.set('sources', 0, 0);
    press(40);
    await wait(60);
    check('bajar en fuentes NO entra en el botón de editar',
        !!focused() && focused().classList.contains('add'), focused() ? focused().className : '(nada)');
    window.App.tv.set('sources', 0, 0);
    press(39);
    await wait(60);
    check('la derecha sí entra en el botón de editar de esa fila',
        !!focused() && focused().classList.contains('edit'), focused() ? focused().className : '(nada)');
    press(37);
    await wait(60);
    check('y la izquierda vuelve a la fuente',
        !!focused() && focused().classList.contains('source'), focused() ? focused().className : '(nada)');
    check('la fila de fuente es un div (dentro va un botón)',
        document.querySelector('#sourceList .row.source').tagName === 'DIV');
    checkClasses('el botón de editar usa las clases que estiliza el CSS', [
        ['#sourceList .edit svg', 'lápiz'], ['#sourceList .edit', 'botón']
    ]);

    document.querySelector('#sourceList .edit').click();
    await wait(80);
    // el foco del DOM se queda en el ultimo input que se uso: el motor se come las
    // teclas mientras hay un campo enfocado, asi que se parte de un estado limpio
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const zapChannels = (function () {
        const lists = window.App.store.state.channels;
        return lists[Object.keys(lists)[0]] || [];
    })();
    const zapChannel = zapChannels.filter(function (channel) { return channel.group === 'Deportes'; })[0];
    window.App.store.play(zapChannel, zapChannel.listId, zapChannels);
    await wait(120);
    press(13);
    await wait(150);
    check('OK mientras se ve abre el panel de zapeo', !!document.getElementById('zapPanel'));
    check('con las categorías y los canales',
        document.querySelectorAll('#zapCats .zapcat').length > 0
        && document.querySelectorAll('#zapChannels .zapch').length > 0,
        document.querySelectorAll('#zapCats .zapcat').length + ' categorías, '
        + document.querySelectorAll('#zapChannels .zapch').length + ' canales');
    checkClasses('el panel usa las clases que estiliza el CSS', [
        ['#zapCats .zapcat', 'categoría'], ['#zapChannels .zapch', 'canal'],
        ['.zap-bar', 'barra'], ['.zap-info', 'info']
    ]);
    check('con un canal marcado como el que se ve',
        !!document.querySelector('#zapChannels .zapch.playing'));
    const beforeZap = window.App.store.state.playing.channel.name;
    press(40);
    press(40);
    await wait(700);
    check('moverse por los canales cambia el canal que se ve',
        window.App.store.state.playing.channel.name !== beforeZap,
        beforeZap + ' -> ' + window.App.store.state.playing.channel.name);
    press(13);
    await wait(120);
    check('y OK lo cierra', !document.getElementById('zapPanel'));
    window.App.store.exitPlayer();
    await wait(80);

    check('el botón de editar abre la edición sin entrar en la fuente', !!document.getElementById('screen-edit'));
    document.getElementById('formCancel').click();
    await wait(80);
    check('cancelar la edición vuelve a fuentes', !!document.getElementById('screen-home'));

    document.querySelector('#sourceList .row.source').click();
    await wait(150);
    check('pinchar una fuente lleva a la TV, no a una pantalla de lista',
        !!document.getElementById('screen-tv') && !document.getElementById('screen-list'));
    check('y la TV es la de esa fuente', window.App.store.state.tvSource !== null);
    check('con sus categorías', document.querySelectorAll('#tvCats .tvcat').length === 4,
        document.querySelectorAll('#tvCats .tvcat').length + ' categorías');
    check('y el resumen dice de qué fuente',
        document.getElementById('tvMeta').textContent.indexOf('sample') === 0,
        document.getElementById('tvMeta').textContent);

    // Tres columnas: categorias, canales y preview. Todo en la misma pantalla.
    // Estado vacio del preview: sin canal elegido. Se limpia y se repinta sin tocar
    // el foco (cualquier canal enfocado pondria ya uno).
    window.App.store.state.preview = null;
    window.App.store.setSearch('tv', '');
    await wait(120);
    check('sin canal elegido, el preview es el estado vacío',
        !!document.querySelector('#tvPreview #previewEmpty'));
    check('las columnas de canales y preview son la misma pantalla',
        onlyScreen('screen-tv'), screens().join(', '));

    document.querySelector('#tvCats .tvcat[data-group="Deportes"]').click();
    await wait(150);
    check('elegir categoría llena la columna del medio, sin cambiar de pantalla',
        !!document.getElementById('screen-tv') && !document.getElementById('screen-tvcat'));
    check('con sus canales', document.querySelectorAll('#tvChannels .channel').length === 2,
        document.querySelectorAll('#tvChannels .channel').length + ' canales');
    check('el canal con logo pone su imagen de fondo en la miniatura',
        (function () {
            var thumbs = document.querySelectorAll('#tvChannels .thumb');
            for (var i = 0; i < thumbs.length; i++) {
                if (/background-image/.test(thumbs[i].getAttribute('style') || '')) return true;
            }
            return false;
        })(), 'ninguno con fondo');
    check('y el que no tiene logo deja la letra',
        !!document.querySelector('#tvChannels .thumb-letter'));
    check('las filas llevan número de canal',
        document.querySelector('#tvChannels .num').textContent === '1');
    checkClasses('las tres columnas usan las clases que estiliza el CSS', [
        ['.browse .browse-cats', 'columna de categorías'], ['.browse .browse-channels', 'columna de canales'],
        ['.browse .browse-preview', 'columna del preview'], ['#tvChannels .channel', 'fila de canal'],
        ['#tvChannels .num', 'número'], ['#tvChannels .thumb', 'miniatura']
    ]);
    check('al elegir categoría, el preview enseña el canal enfocado',
        !!document.querySelector('#tvPreview #previewCard'),
        document.querySelector('#tvPreview .preview-name') ? document.querySelector('#tvPreview .preview-name').textContent : '(vacío)');
    check('con su nombre y su guía',
        !!document.querySelector('#tvPreview .preview-guide')
        && document.querySelector('#tvPreview .preview-open').textContent.length > 0);

    press(40);
    await wait(90);
    check('la fila enfocada pide su programa (y sale debajo del nombre)',
        !!focused() && focused().textContent.indexOf('Programa de prueba') !== -1,
        focused() ? focused().textContent.slice(0, 60) : '(nada)');

    press(50);
    await wait(20);
    check('el número tecleado se muestra', !!document.getElementById('numBuffer'));
    press(13);
    await wait(40);
    check('Enter salta a la fila tecleada',
        !!focused() && focused().querySelector('.num') && focused().querySelector('.num').textContent === '2',
        focused() ? focused().className : '(nada)');
    check('al saltar se limpia el número', !document.getElementById('numBuffer'));

    // OK encima del preview abre a pantalla completa
    window.App.tv.set('tvPreview', 0, 0);
    await wait(60);
    press(13);
    await wait(120);
    check('OK encima del preview abre a pantalla completa',
        !!document.getElementById('screen-player'), screens().join(', '));
    check('y es la única montada', onlyScreen('screen-player'), screens().join(', '));
    check('el reproductor tiene la superficie donde AVPlay pinta el vídeo', (function () {
        var surface = document.getElementById('avPlayer');
        return !!surface && surface.getAttribute('type') === 'application/avplayer';
    })());
    check('reproduciendo, la pantalla de detrás no está en el DOM',
        !document.getElementById('screen-tv'));
    check('y el fondo de la app deja de pintar (si no, tapa el plano de vídeo)',
        document.body.classList.contains('playing'));
    check('y dice qué motor reproduce (sin consola en la TV no hay otra forma)',
        !!document.getElementById('ovEngine') && /AVPlay|HTML5/.test(document.getElementById('ovEngine').textContent),
        document.getElementById('ovEngine') ? document.getElementById('ovEngine').textContent : '(nada)');
    check('sale el programa de ahora', !!document.getElementById('ovProgram')
        && document.getElementById('ovProgram').textContent.indexOf('Programa de prueba') !== -1);
    check('con su barra de progreso', (function () {
        var fill = document.getElementById('ovProgress');
        return !!fill && /width:\s*\d+%/.test(fill.getAttribute('style') || '');
    })(), document.getElementById('ovProgress') ? document.getElementById('ovProgress').getAttribute('style') : '(sin barra)');
    check('y el programa siguiente, como en cualquier reproductor', !!document.getElementById('ovNext')
        && document.getElementById('ovNext').textContent.indexOf('El siguiente') !== -1,
        document.getElementById('ovNext') ? document.getElementById('ovNext').textContent : '(sin siguiente)');
    // El boton de favoritos no viene seleccionado: se baja a el a proposito.
    check('al abrir un canal no hay botón seleccionado',
        !document.querySelector('.focused'), focused() ? focused().className : '(nada)');
    press(40);
    await wait(60);
    check('abajo selecciona el botón de favoritos',
        !!focused() && focused().id === 'ovFav', focused() ? focused().id : '(nada)');
    press(38);
    await wait(60);
    check('y arriba lo suelta', !document.querySelector('.focused'));

    press(40);
    await wait(50);
    press(403);
    await wait(50);
    check('la tecla roja guarda el favorito', window.App.store.state.favorites.length === 1);

    // Un canal que no arranca: tarjeta con el motivo y reintentar, no negro mudo.
    window.App.store.playFailed('El canal no responde');
    await wait(90);
    check('un canal que falla no deja la pantalla en negro', !!document.getElementById('playError'));
    check('la tarjeta dice el motivo y el canal',
        document.getElementById('playErrorWhy').textContent === 'El canal no responde'
        && document.getElementById('playErrorName').textContent.length > 0,
        document.getElementById('playErrorWhy').textContent);
    check('y ofrece reintentar y volver',
        !!document.getElementById('playRetry') && !!document.getElementById('playClose'));
    checkClasses('la tarjeta de error usa las clases que estiliza el CSS', [
        ['.play-card', 'tarjeta'], ['.play-card .play-why', 'motivo'],
        ['.play-card .play-hint', 'ayuda'], ['.play-card .play-actions', 'acciones']
    ]);
    check('el foco se va a los botones de la tarjeta',
        !!focused() && focused().id === 'playRetry', focused() ? focused().id : '(nada)');
    const before = window.App.store.state.playing.channel.name;
    press(39);
    await wait(120);
    check('con la tarjeta de error abierta, la derecha cambia de canal',
        !document.getElementById('playError') && window.App.store.state.playing.channel.name !== before,
        document.getElementById('playError') ? 'sigue la tarjeta' : '(sin tarjeta)');

    window.App.store.playFailed('El canal no responde');
    await wait(90);
    press(40);
    await wait(60);
    check('y arriba/abajo mueven entre Reintentar y Volver',
        !!focused() && focused().id === 'playClose', focused() ? focused().id : '(nada)');
    press(38);
    await wait(60);
    check('volviendo a Reintentar', !!focused() && focused().id === 'playRetry');

    document.getElementById('playRetry').click();
    await wait(90);
    check('reintentar quita la tarjeta y vuelve a abrir', !document.getElementById('playError'));

    press(10009);
    await wait(80);
    check('volver sale del reproductor, a la TV con las tres columnas',
        !!document.getElementById('screen-tv') && !!document.querySelector('.browse-preview'));
    press(10009);
    await wait(80);
    check('y otro Atrás vuelve a fuentes', window.App.store.state.screen === 'home',
        'screen=' + window.App.store.state.screen);

    // TV: primero las categorías filtradas, y dentro de una, sus canales.
    document.getElementById('navTv').click();
    await wait(120);
    check('la sección TV existe', !!document.getElementById('screen-tv'));
    check('y la de fuentes ya no está montada', onlyScreen('screen-tv'), screens().join(', '));
    window.App.tv.set('rail', 1, 0);
    press(39);
    await wait(60);
    check('desde el rail la derecha entra por el botón, no por el buscador',
        !!focused() && focused().id === 'catsBtn', focused() ? focused().id : '(nada)');
    press(39);
    await wait(60);
    check('y del botón se pasa al buscador', !!focused() && focused().id === 'tvSearch',
        focused() ? focused().id : '(nada)');
    press(37);
    await wait(60);
    check('y con la izquierda se vuelve al botón', !!focused() && focused().id === 'catsBtn');
    check('la TV son tres columnas: categorías, canales y preview',
        document.querySelectorAll('#tvCats .tvcat').length === 4
        && !!document.querySelector('.browse-channels') && !!document.querySelector('.browse-preview'),
        document.querySelectorAll('#tvCats .tvcat').length + ' categorías');
    check('hay botón de categorías', !!document.getElementById('catsBtn'));
    checkClasses('la TV usa las clases que estiliza el CSS', [
        ['#tvCats .tvcat .row-name', 'nombre de categoría'], ['#tvCats .tvcat .row-count', 'recuento'],
        ['#screen-tv .search', 'buscador']
    ]);

    typeInto('#tvSearch', 'espa');
    await wait(400);                                // el buscador espera a que dejes de teclear
    check('buscar en TV filtra categorías',
        document.querySelectorAll('#tvCats .tvcat').length === 1
        && document.querySelector('#tvCats .tvcat .row-name').textContent === 'España',
        document.querySelectorAll('#tvCats .tvcat').length + ' filas');
    typeInto('#tvSearch', '');
    await wait(400);

    // OK en el buscador tiene que enfocar el CAMPO: es lo que levanta el teclado
    // en la TV. Antes la zona apuntaba al div de fuera y el OK no hacía nada.
    window.App.tv.set('tvSearch', 0, 0);
    press(13);
    await wait(60);
    check('OK en el buscador enfoca el campo (y la TV levanta el teclado)',
        !!document.activeElement && document.activeElement.id === 'tvSearch',
        document.activeElement ? document.activeElement.tagName + '#' + document.activeElement.id : '(nada)');
    document.getElementById('tvSearch').blur();

    document.querySelector('#tvCats .tvcat[data-group="España"]').click();
    await wait(120);
    check('elegir categoría llena la columna del medio', document.querySelectorAll('#tvChannels .channel').length > 0,
        document.querySelectorAll('#tvChannels .channel').length + ' canales');
    check('y lista los canales de esa categoría', document.querySelectorAll('#tvChannels .channel').length === 3,
        document.querySelectorAll('#tvChannels .channel').length + ' canales');
    check('no son todos los canales, solo los de la categoría',
        document.querySelectorAll('#tvChannels .channel').length < 9);

    press(40);
    await wait(80);
    check('la fila enfocada de la categoría pide su programa',
        !!focused() && focused().textContent.indexOf('Programa de prueba') !== -1,
        focused() ? focused().textContent.slice(0, 60) : '(nada)');

    // La izquierda va de los canales a las categorias (las columnas de al lado).
    press(37);
    await wait(100);
    check('la izquierda, de los canales a las categorías',
        !!focused() && focused().classList.contains('tvcat'),
        focused() ? focused().className : '(nada)');

    document.querySelector('#tvCats .tvcat[data-group="España"]').click();
    await wait(150);
    // El panel de categorías: se silencia una y se guarda.
    document.getElementById('catsBtn').click();
    await wait(100);
    check('se abre la gestión de categorías', !!document.getElementById('screen-cats'));
    check('las categorías van por proveedor', !!document.querySelector('.cat-source'));
    check('hay una fila por categoría', document.querySelectorAll('#catList .cat').length === 4,
        document.querySelectorAll('#catList .cat').length + ' categorías');
    check('todas salen activas', document.querySelectorAll('#catList .cat.on').length === 4);
    checkClasses('las categorías usan las clases que estiliza el CSS', [
        ['#catList .cat .check', 'casilla'], ['#catActions .btn', 'acciones'], ['#screen-cats .search', 'buscador']
    ]);

    typeInto('#catSearch', 'depor');
    await wait(400);
    check('buscar en categorías filtra la lista',
        document.querySelectorAll('#catList .cat').length === 1,
        document.querySelectorAll('#catList .cat').length + ' filas');
    typeInto('#catSearch', '');
    await wait(400);
    check('y al vaciar vuelven todas', document.querySelectorAll('#catList .cat').length === 4);

    window.App.tv.set('catSearch', 0, 0);
    press(13);
    await wait(60);
    check('OK en el buscador de categorías enfoca el campo',
        !!document.activeElement && document.activeElement.id === 'catSearch',
        document.activeElement ? document.activeElement.tagName + '#' + document.activeElement.id : '(nada)');
    document.getElementById('catSearch').blur();

    press(40);                                      // del buscador a la lista
    await wait(40);
    check('el foco entra en las categorías', !!focused() && focused().classList.contains('cat'));
    press(13);                                      // desactiva la primera categoría
    await wait(40);
    check('se puede desactivar una categoría', document.querySelectorAll('#catList .cat.on').length === 3);
    document.getElementById('catNone').click();
    await wait(40);
    check('"Ninguna" desactiva todas', document.querySelectorAll('#catList .cat.on').length === 0);
    document.getElementById('catAll').click();
    await wait(40);
    check('"Todas" las reactiva', document.querySelectorAll('#catList .cat.on').length === 4);
    press(13);                                      // vuelve a desactivar una
    await wait(40);
    document.getElementById('catSave').click();
    await wait(120);
    check('al guardar vuelve a la TV', !!document.getElementById('screen-tv'));
    check('la categoría silenciada ya no se ofrece',
        document.querySelectorAll('#tvCats .tvcat').length === 3,
        document.querySelectorAll('#tvCats .tvcat').length + ' categorías');

    // Recientes y favoritos.
    document.getElementById('navRecents').click();
    await wait(60);
    check('recientes lista lo último visto', document.querySelectorAll('#recentsList .channel').length >= 1,
        document.querySelectorAll('#recentsList .channel').length + ' filas');
    document.getElementById('navFavs').click();
    await wait(60);
    check('los favoritos se listan', document.querySelectorAll('#favList .channel').length === 1);
    checkClasses('favoritos usa las clases que estiliza el CSS', [
        ['#favList .channel', 'fila'], ['#favList .saved', 'estrella']
    ]);

    // Editar desde la fila de la fuente, sin entrar en ella.
    window.App.store.goHome();
    await wait(80);
    document.querySelector('#sourceList .edit').click();
    await wait(80);
    check('se abre la edición', !!document.getElementById('screen-edit'));
    check('la edición viene rellena',
        document.getElementById('field-url').value.indexOf('sample.m3u') !== -1,
        document.getElementById('field-url').value);
    check('la edición ofrece borrar', !!document.getElementById('formDelete'));
    typeInto('#field-name', 'Mi lista');
    document.getElementById('formSave').click();
    await wait(150);
    check('al guardar vuelve a fuentes con el nombre nuevo',
        !!document.getElementById('screen-home')
        && document.querySelector('#sourceList .row-name').textContent === 'Mi lista',
        document.querySelector('#sourceList .row-name') ? document.querySelector('#sourceList .row-name').textContent : '(sin fila)');

    // El aviso de carga tiene que DECIR algo: la fila con la fuente y su fase,
    // no una tarjeta con la altura de una fila y el texto recortado a nada (que
    // es como se rompio dos veces). Se hace por el camino real: se vacia lo
    // cargado y se deja la red colgada, como una lista grande entrando.
    window.fetch = function () { return new Promise(function () {}); };
    const loadingStore = window.App.store;
    loadingStore.state.channels = {};
    loadingStore.state.groups = {};
    loadingStore.state.flat = null;
    loadingStore.openSource(loadingStore.state.lists[0].id);
    await wait(500);

    const loadRow = document.querySelector('#loadingList .loading-row');
    check('mientras carga se ve el progreso, no una tarjeta vacía',
        !!loadRow && loadRow.querySelector('.loading-phase').textContent.length > 0,
        loadRow ? '(' + loadRow.textContent + ')' : '(sin fila)');
    check('la fase dice qué está haciendo', /Connecting|Downloading|Fetching|Preparing|Reading/.test(
        loadRow ? loadRow.querySelector('.loading-phase').textContent : ''));
    check('con una sola fuente el titular la nombra', (function () {
        var title = document.getElementById('loadingTitle').textContent;
        return title.indexOf('Mi lista') !== -1;
    })(), document.getElementById('loadingTitle').textContent);
    check('y la fila no repite el nombre',
        !loadRow.querySelector('.loading-name') || loadRow.querySelector('.loading-name').textContent === '',
        loadRow.querySelector('.loading-name') ? loadRow.querySelector('.loading-name').textContent : '(sin nombre)');

    loadingStore.setLoading(false);                 // apaga el latido del aviso
    loadingStore.state.pending = {};
    loadingStore.state.loadProgress = {};

    // Borrar desde el inicio con la tecla roja.
    window.App.store.goHome();
    await wait(60);
    press(403);
    await wait(40);
    check('la tecla roja pide confirmación', !!document.querySelector('#confirm .modal-card'));
    checkClasses('el modal usa las clases que estiliza el CSS', [
        ['.modal-card', 'tarjeta'], ['#confirmText', 'texto'], ['#confirmOk.btn.danger', 'borrar']
    ]);
    document.getElementById('confirmOk').click();
    await wait(60);
    check('la fuente se borra y vuelve al inicio',
        !!document.getElementById('screen-home') && document.querySelectorAll('#sourceList .row.source').length === 0);

    // --- la hoja de estilos -------------------------------------------------
    // Las hojas se parten por asunto: se leen todas y se exige que index.html
    // enlace cada una (una hoja nueva sin enlazar es estilo que desaparece).
    const cssFiles = fs.readdirSync(path.join(root, 'css')).filter(function (name) { return /\.css$/.test(name); });
    const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const unlinked = cssFiles.filter(function (name) { return htmlSource.indexOf('css/' + name) === -1; });
    check('index.html enlaza todas las hojas de estilo', unlinked.length === 0, unlinked.join(', '));
    const css = cssFiles.map(function (name) {
        return fs.readFileSync(path.join(root, 'css', name), 'utf8');
    }).join('\n');
    // Los comentarios no son reglas: se quitan antes de comprobar nada.
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
    const rules = document.styleSheets[document.styleSheets.length - 1].cssRules.length;
    check('la hoja de estilos parsea entera', rules >= 120, rules + ' reglas');
    check('el trio de la identidad está en la hoja',
        ['#febc06', '#cc4207', '#15e9a4'].every(function (hex) { return code.indexOf(hex) !== -1; }));
    check('el degradado de marca lleva los colores de la casa',
        /linear-gradient\([^)]*var\(--(amber|ember|mint)\)/.test(code));
    // Esta pantalla ya se rompio dos veces por partir texto en varias lineas
    // dentro de su tarjeta: las dos columnas van en una sola linea, siempre.
    check('la superficie de AVPlay se mide en píxeles, no en porcentaje', (function () {
        var rule = code.match(/\.av-surface\s*\{[^}]*\}/);
        return !!rule && /width:\s*1920px/.test(rule[0]) && /height:\s*1080px/.test(rule[0]);
    })());
    check('la fila de carga no puede partir en varias líneas', (function () {
        function rule(selector) {
            var match = code.match(new RegExp('\\' + selector + '\\s*\\{[^}]*\\}'));
            return match ? match[0] : '';
        }
        return /white-space:\s*nowrap/.test(rule('.loading-name'))
            && /white-space:\s*nowrap/.test(rule('.loading-phase'))
            && /flex:\s*none/.test(rule('.loading-phase'))
            && /display:\s*flex/.test(rule('.loading-row'));
    })());
    // Una variable renombrada deja la regla muda (y el texto que la usaba
    // invisible, que es lo que paso con el nombre de la marca).
    check('todas las variables del CSS están definidas', (function () {
        const defined = {};
        Array.from(code.matchAll(/(--[a-z0-9-]+)\s*:/g)).forEach(function (m) { defined[m[1]] = 1; });
        const used = {};
        Array.from(code.matchAll(/var\((--[a-z0-9-]+)/g)).forEach(function (m) { used[m[1]] = 1; });
        const missing = Object.keys(used).filter(function (name) { return !defined[name]; });
        return missing.length === 0 ? true : missing.join(', ');
    })() === true, 'variables sin definir');
    check('nada de blur de fondo (en TV repinta por software)',
        !/backdrop-filter\s*:/.test(code));

    // Toda clase que pinta el markup (y los estados que añade el motor) tiene regla.
    const styles = ['index.html'].concat(scripts)
        .filter(function (file) { return file.indexOf('vendor/') !== 0; })
        .map(function (file) { return fs.readFileSync(path.join(root, file), 'utf8'); }).join('\n');
    const used = new Set();
    Array.from(styles.matchAll(/class="([^"$]*)"/g)).forEach(function (match) {
        match[1].trim().split(/\s+/).forEach(function (name) { if (name) used.add(name); });
    });
    ['overlay', 'visible', 'focused', 'active', 'selected', 'on'].forEach(function (name) { used.add(name); });
    // 'channel' y 'source' no son estilos: son los ganchos que consultan los tests.
    ['channel', 'source'].forEach(function (name) { used.delete(name); });
    const unstyled = Array.from(used).filter(function (name) {
        return code.indexOf('.' + name) === -1;
    });
    check('toda clase del markup tiene regla en la hoja', unstyled.length === 0, unstyled.join(', '));

    // El punto en medio de la pantalla: es el anillo de "abriendo" del reproductor.
    // Con AVPlay, si no llega ningun evento (pasa en directo), tiene que quitarse
    // solo. Se prueba con un AVPlay de mentira que no llama a nadie.
    window.webapis = { avplay: {
        open: function () {}, setDisplayRect: function () {}, setDisplayMethod: function () {},
        setListener: function () {}, prepareAsync: function () {}, play: function () {},
        getState: function () { return 'PLAYING'; }, stop: function () {}, close: function () {}
    } };
    const avStore = window.App.store;
    avStore.play({ name: 'Sin eventos', group: 'X', url: 'https://x/live/u/p/1.ts' }, 'l1', []);
    await wait(200);
    check('con AVPlay abriendo se ve el aviso de arranque (es el punto)', !!document.getElementById('playerStatus'));

    // Relacion de aspecto: cicla por los modos y el nombre en pantalla lo dice
    const aspectStart = window.App.store.aspectLabel();
    window.App.store.nextAspect();
    await wait(60);
    check('el botón de aspecto cambia de modo', window.App.store.aspectLabel() !== aspectStart,
        aspectStart + ' -> ' + window.App.store.aspectLabel());
    const modes = [];
    for (let i = 0; i < 4; i++) { window.App.store.nextAspect(); await wait(30); modes.push(window.App.store.aspectLabel()); }
    check('y da la vuelta por todos', modes.indexOf(aspectStart) !== -1, modes.join(' > '));
    check('el modo que se aplica es el que se enseña',
        /PLAYER_DISPLAY_MODE_/.test(window.App.store.aspectMode()), window.App.store.aspectMode());
    await wait(4200);
    check('y se quita solo a los 4 s aunque AVPlay no diga nada',
        !document.getElementById('playerStatus'), 'sigue en pantalla');
    avStore.exitPlayer();
    window.webapis = undefined;

    check('sin errores tras toda la sesión', errors.length === 0, errors.join(' | '));

    console.log('');
    console.log(failed ? failed + ' comprobaciones FALLIDAS' : 'todo correcto');
    process.exit(failed ? 1 : 0);

    function storeGoHome() {
        window.App.store.goHome();
    }
}

run().catch(function (error) {
    console.log('FALLO el test se rompió: ' + error.stack);
    process.exit(1);
});
