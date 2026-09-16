var App = App || {};

// Raíz y montaje: junta el kit (App.uiKit) con las pantallas (App.uiScreens) y
// repinta con cada cambio del store. Cada pantalla vive en js/ui/screens/.
App.ui = (function () {
    var preact = window.preact;
    var html = window.htm.bind(preact.h);
    var store = App.store;
    var tv = App.tv;
    var kit = App.uiKit;
    var screens = App.uiScreens;

    var useEffect = kit.useEffect;
    var Rail = kit.Rail;
    var Home = screens.home;
    var TvScreen = screens.tv;
    var TvCategoryScreen = screens.tvcat;
    var Recents = screens.recents;
    var Favs = screens.favs;
    var Categories = screens.cats;
    var SourceForm = screens.sourceForm;
    var AddTypePicker = screens.addTypePicker;
    var Player = screens.player;
    var Loader = screens.loader;
    var Toast = screens.toast;
    var NumBuffer = screens.numBuffer;
    var Confirm = screens.confirm;

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
