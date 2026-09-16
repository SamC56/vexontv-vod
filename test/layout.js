// jsdom has no layout: this is the only test that measures a real browser.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

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

function chrome() {
    if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
    const cache = path.join(os.homedir(), '.cache/ms-playwright');
    if (fs.existsSync(cache)) {
        const found = fs.readdirSync(cache)
            .filter(function (name) { return name.indexOf('chromium') === 0; })
            .map(function (name) { return path.join(cache, name, 'chrome-headless-shell-linux64/chrome-headless-shell'); })
            .filter(function (file) { return fs.existsSync(file); });
        if (found.length) return found[0];
    }
    const paths = (process.env.PATH || '').split(':');
    for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
        for (const dir of paths) {
            const file = path.join(dir, name);
            if (fs.existsSync(file)) return file;
        }
    }
    return null;
}

const VISIBLE_ROWS = 40;
const TOTAL_ROWS = 200;

function m3u() {
    let text = '#EXTM3U\n';
    for (let i = 1; i <= TOTAL_ROWS; i++) {
        text += '#EXTINF:-1 tvg-logo="" group-title="Deportes",Canal ' + i + '\n';
        text += 'https://panel.example/live/u/p/' + i + '.ts\n';
    }
    return text;
}

function probe(dir) {
    const script = `
<script>
window.addEventListener('load', function () {
    setTimeout(function () {
        try {
            var store = window.App.store;
            store.state.lists.slice().forEach(function (list) { store.removeList(list.id); });
            store.addList({ id: 'layout', name: 'Layout', kind: 'm3u', source: 'text', text: '${m3u().replace(/\n/g, '\\n')}' })
                .then(function () {
                    store.openTv();
                    store.openTvCategory('Deportes');
                    var view = store.visibleTvCategory();
                    store.selectPreview(view.items[0]);
                    setTimeout(function () {
                        window.App.tv.set('tvChannels', 0, 0);
                        for (var i = 0; i < ${VISIBLE_ROWS}; i++) {
                            var event = new KeyboardEvent('keydown', { bubbles: true });
                            Object.defineProperty(event, 'keyCode', { value: 40 });
                            document.dispatchEvent(event);
                        }
                        var card = document.querySelector('.browse-preview');
                        var stage = document.getElementById('previewStage');
                        var stageBox = stage.getBoundingClientRect();
                        // Con un canal elegido la app ya puso previewing/hole, y con 'hole' el
                        // fondo se apaga a proposito: se quitan un momento para medir la grilla.
                        document.body.classList.remove('previewing', 'hole');
                        var bodyStyle = window.getComputedStyle(document.body);
                        var gridSize = bodyStyle.backgroundSize;
                        var gridPosition = bodyStyle.backgroundPosition;
                        var railWidth = Math.round(document.querySelector('.rail').getBoundingClientRect().width);
                        document.body.classList.add('previewing', 'hole');
                        document.body.classList.add('previewing');
                        var backdrop = window.getComputedStyle(document.getElementById('backdrop'));
                        var edge = window.getComputedStyle(document.body, '::before');
                        var card = window.getComputedStyle(document.querySelector('.browse-preview'));
                        var cardBox = document.querySelector('.browse-preview').getBoundingClientRect();
                        var frame = document.getElementById('tvChannels');
                        var app = document.querySelector('.app');
                        var focused = document.querySelector('.focused');
                        var item = focused ? focused.getBoundingClientRect() : null;
                        var box = frame.getBoundingClientRect();
                        document.title = 'DBG ' + JSON.stringify({
                            viewport: document.documentElement.clientHeight,
                            app: Math.round(app.getBoundingClientRect().height),
                            box: Math.round(frame.clientHeight),
                            content: frame.scrollHeight,
                            scrolled: Math.round(frame.scrollTop),
                            focus: (focused ? focused.textContent.slice(0, 12) : null),
                            inside: !!item && item.top >= box.top - 1 && item.bottom <= box.bottom + 1,
                            document: document.documentElement.scrollTop + window.scrollY,
                            stage: [Math.round(stageBox.width), Math.round(stageBox.height)],
                            stageRatio: stageBox.height ? stageBox.width / stageBox.height : 0,
                            backdropZ: backdrop.zIndex,
                            gridSize: gridSize,
                            gridPosition: gridPosition,
                            railWidth: railWidth,
                            cardBackground: card.backgroundColor,
                            holeWidth: document.documentElement.style.getPropertyValue('--hole-w'),
                            holeX: document.documentElement.style.getPropertyValue('--hole-x'),
                            cardLeft: Math.round(cardBox.left),
                            cardWidth: Math.round(cardBox.width),
                            cardMaskPosition: card.maskPosition || '',
                            cardMask: card.maskComposite || '',
                            cardMaskImage: (card.maskImage || '').indexOf('gradient') !== -1,
                            backdropPosition: backdrop.position,
                            edgeOpacity: edge.opacity,
                            edgeGradient: edge.backgroundImage.indexOf('gradient') !== -1
                        });
                    }, 700);
                });
        } catch (error) { document.title = 'DBG ERROR ' + error.message; }
    }, 400);
});
</script>`;

    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    if (html.indexOf('</body>') === -1) throw new Error('index.html sin </body>');
    const injected = html.replace('</body>', script + '</body>', 1);
    if (injected === html) throw new Error('no se pudo inyectar el diagnostico');
    fs.writeFileSync(path.join(dir, 'index.html'), injected);

    const out = execFileSync(chrome(), [
        '--headless', '--disable-gpu', '--hide-scrollbars',
        '--window-size=1920,1080', '--virtual-time-budget=12000', '--dump-dom',
        'file://' + path.join(dir, 'index.html')
    ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

    const match = out.match(/DBG (\{.*?\})</);
    if (!match) throw new Error('la app no devolvio medidas (mira el title)');
    return JSON.parse(match[1]);
}

function main() {
    if (!chrome()) {
        console.log('saltado: no hay Chrome headless en esta maquina (test/layout.js)');
        return;
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexontv-layout-'));
    try {
        ['config.xml', 'index.html', 'icon.png', 'brand.png'].forEach(function (file) {
            fs.copyFileSync(path.join(root, file), path.join(dir, file));
        });
        ['css', 'js', 'vendor'].forEach(function (folder) {
            fs.cpSync(path.join(root, folder), path.join(dir, folder), { recursive: true });
        });

        const data = probe(dir);
        check('el armazón mide la pantalla, no el contenido',
            Math.abs(data.app - data.viewport) <= 4, 'armazon ' + data.app + ' vs pantalla ' + data.viewport);
        check('la lista de canales puede desbordar, o sea que puede scrollear',
            data.content > data.box, 'contenido ' + data.content + ' vs caja ' + data.box);
        check('al bajar por la lista, la lista se desplaza',
            data.scrolled > 0, 'scrollTop ' + data.scrolled);
        check('la fila enfocada queda dentro del marco visible',
            data.inside, 'foco en "' + data.focus + '"');
        check('el escenario del preview es 16:9 (el video no se ve encajado)',
            Math.abs(data.stageRatio - 16 / 9) < 0.02,
            data.stage.join('x') + ' = ' + data.stageRatio.toFixed(3));
        check('el agujero deja fuera el filo de la tarjeta, o el foco se corta ahi',
            parseFloat(data.holeX) > data.cardLeft && parseFloat(data.holeWidth) < data.cardWidth,
            'agujero desde ' + data.holeX + ' ancho ' + data.holeWidth
                + ', tarjeta desde ' + data.cardLeft + ' ancho ' + data.cardWidth);
        check('la tarjeta recorta el video donde está el escenario',
            parseFloat(data.holeWidth) > 0
            && data.cardMaskPosition.replace(/0px/g, '').replace(/[\s,]/g, '') !== '',
            'agujero ' + data.holeWidth + ', máscara de la tarjeta ' + data.cardMaskPosition);
        check('la grilla arranca en el borde del rail (una línea cae justo ahí)',
            data.gridPosition.indexOf(data.railWidth + 'px 50%') === 0,
            'grilla en ' + data.gridPosition + ', rail de ' + data.railWidth + 'px');
        check('la grilla del fondo son cuadrados de 64x64 (no estirada)',
            /^64px 64px, 64px 64px,/.test(data.gridSize), data.gridSize);
        check('el preview es una sala negra, no la grilla de la app',
            data.cardBackground === 'rgb(0, 0, 0)', data.cardBackground);
        check('y con el canal en marcha se recorta el rectángulo del vídeo (si no, lo taparía)',
            data.cardMaskImage && data.cardMask.indexOf('exclude') !== -1,
            data.cardMask + ' / gradiente ' + data.cardMaskImage);
        check('el agujero del preview va detrás del rail, o se comería la marca',
            parseFloat(data.backdropZ) < 0, 'z-index ' + data.backdropZ);
        check('y el filo de marca de arriba sobrevive al preview',
            data.edgeGradient && parseFloat(data.edgeOpacity) > 0,
            'opacidad ' + data.edgeOpacity + ', degradado ' + data.edgeGradient);
        check('bajar por la lista no mueve el documento',
            data.document === 0, 'desplazamiento ' + data.document);
    } catch (error) {
        failed++;
        console.log('FALLO el test de maquetación se rompió: ' + error.message);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

main();
if (!failed) console.log('todo correcto (maquetación)');
process.exit(failed ? 1 : 0);
