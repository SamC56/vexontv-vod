// jsdom has no layout: this is the only test that measures a real browser.
const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")

const root = path.join(__dirname, "..")
const report = require("./report")("layout — the 64px grid, the rail and the preview, in a browser")
const check = report.check

function chrome() {
    if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN))
        return process.env.CHROME_BIN
    const cache = path.join(os.homedir(), ".cache/ms-playwright")
    if (fs.existsSync(cache)) {
        const found = fs
            .readdirSync(cache)
            .filter((name) => {
                return name.indexOf("chromium") === 0
            })
            .map((name) => {
                return path.join(cache, name, "chrome-headless-shell-linux64/chrome-headless-shell")
            })
            .filter((file) => {
                return fs.existsSync(file)
            })
        if (found.length) return found[0]
    }
    const paths = (process.env.PATH || "").split(":")
    for (const name of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
        for (const dir of paths) {
            const file = path.join(dir, name)
            if (fs.existsSync(file)) return file
        }
    }
    return null
}

const VISIBLE_ROWS = 40
const TOTAL_ROWS = 200

function m3u() {
    let text = "#EXTM3U\n"
    for (let i = 1; i <= TOTAL_ROWS; i++) {
        text += `#EXTINF:-1 tvg-logo="" group-title="Deportes",Canal ${i}\n`
        text += `https://panel.example/live/u/p/${i}.ts\n`
    }
    return text
}

function probe(dir) {
    const script = `
<script>
window.addEventListener('load', function () {
    setTimeout(function () {
        try {
            var store = window.App.store;
            store.state.lists.slice().forEach(function (list) { store.removeList(list.id); });
            store.addList({ id: 'layout', name: 'Layout', kind: 'm3u', source: 'text', text: '${m3u().replace(/\n/g, "\\n")}' })
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
                        // With a channel picked the app already set previewing/hole, and with 'hole'
                        // the backdrop switches off on purpose: they come off for a moment to measure the grid.
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
</script>`

    const html = fs.readFileSync(path.join(dir, "index.html"), "utf8")
    if (html.indexOf("</body>") === -1) throw new Error("index.html without </body>")
    const injected = html.replace("</body>", `${script}</body>`, 1)
    if (injected === html) throw new Error("could not inject the probe")
    fs.writeFileSync(path.join(dir, "index.html"), injected)

    const out = execFileSync(
        chrome(),
        [
            "--headless",
            "--disable-gpu",
            "--hide-scrollbars",
            "--window-size=1920,1080",
            "--virtual-time-budget=12000",
            "--dump-dom",
            `file://${path.join(dir, "index.html")}`,
        ],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    )

    const match = out.match(/DBG (\{.*?\})</)
    if (!match) throw new Error("the app returned no measurements (check the title)")
    return JSON.parse(match[1])
}

function main() {
    if (!chrome()) {
        report.skip("no headless Chrome on this machine, so nothing was measured")
        return
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vexontv-layout-"))
    try {
        ;["config.xml", "index.html", "icon.png", "brand.png"].forEach((file) => {
            fs.copyFileSync(path.join(root, file), path.join(dir, file))
        })
        ;["css", "js", "vendor"].forEach((folder) => {
            fs.cpSync(path.join(root, folder), path.join(dir, folder), { recursive: true })
        })

        const data = probe(dir)
        check(
            "the shell measures the screen, not the content",
            Math.abs(data.app - data.viewport) <= 4,
            `shell ${data.app} vs screen ${data.viewport}`,
        )
        check(
            "the channel list can overflow, that is, it can scroll",
            data.content > data.box,
            `content ${data.content} vs box ${data.box}`,
        )
        check(
            "when going down the list, the list scrolls",
            data.scrolled > 0,
            `scrollTop ${data.scrolled}`,
        )
        check(
            "the focused row stays inside the visible frame",
            data.inside,
            `focus on "${data.focus}"`,
        )
        check(
            "the preview stage is 16:9 (the video is not seen squeezed)",
            Math.abs(data.stageRatio - 16 / 9) < 0.02,
            `${data.stage.join("x")} = ${data.stageRatio.toFixed(3)}`,
        )
        check(
            "the hole leaves out the card edge, or the focus is cut there",
            parseFloat(data.holeX) > data.cardLeft && parseFloat(data.holeWidth) < data.cardWidth,
            `hole from ${data.holeX} width ${data.holeWidth}, card from ${
                data.cardLeft
            } width ${data.cardWidth}`,
        )
        check(
            "the card clips the video where the stage is",
            parseFloat(data.holeWidth) > 0 &&
                data.cardMaskPosition.replace(/0px/g, "").replace(/[\s,]/g, "") !== "",
            `hole ${data.holeWidth}, card mask ${data.cardMaskPosition}`,
        )
        check(
            "the grid starts at the rail edge (a line falls right there)",
            data.gridPosition.indexOf(`${data.railWidth}px 50%`) === 0,
            `grid at ${data.gridPosition}, rail ${data.railWidth}px`,
        )
        check(
            "the background grid is 64x64 squares (not stretched)",
            /^64px 64px, 64px 64px,/.test(data.gridSize),
            data.gridSize,
        )
        check(
            "the preview is a black room (with a bit of alpha), not the grid",
            /^rgba?\(0, 0, 0(, 0\.\d+)?\)$/.test(data.cardBackground),
            data.cardBackground,
        )
        check(
            "and with the channel running the video rectangle is clipped (otherwise it would cover it)",
            data.cardMaskImage && data.cardMask.indexOf("exclude") !== -1,
            `${data.cardMask} / gradiente ${data.cardMaskImage}`,
        )
        check(
            "the preview hole goes behind the rail, or it would eat the marker",
            parseFloat(data.backdropZ) < 0,
            `z-index ${data.backdropZ}`,
        )
        check(
            "and the top brand edge survives the preview",
            data.edgeGradient && parseFloat(data.edgeOpacity) > 0,
            `opacidad ${data.edgeOpacity}, degradado ${data.edgeGradient}`,
        )
        check(
            "going down the list does not move the document",
            data.document === 0,
            `scroll ${data.document}`,
        )
    } catch (error) {
        report.fail("the suite crashed", error.message)
    } finally {
        fs.rmSync(dir, { recursive: true, force: true })
    }
}

main()
report.done()
