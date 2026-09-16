var App = App || {};

// Arranque: zonas de foco, teclas del mando y render. La lógica vive en el store
// y el pintado en App.ui; aquí solo se unen.
(function () {
    var store = App.store;
    var tv = App.tv;
    var player = App.player;
    var ui = App.ui;

    function zone(name, selector, options) {
        tv.define(name, function () { return tv.rows(ui.qsa(selector)); }, options);
    }

    function defineZones() {
        // Listas verticales de un solo eje; se sale al rail por la izquierda y,
        // en las pantallas con columnas, a la derecha.
        zone('rail', '.rail .rail-btn', {
            onEdge: function (dir) {
                if (dir !== 'right') return;
                var screen = store.state.screen;
                if (screen === 'home') tv.set('types', 0, 0);
                else if (screen === 'tv') tv.set('tvActions', 0, 0);
                else if (screen === 'tvcat') tv.set('tvcatActions', 0, 0);
                else if (screen === 'recents') tv.set('recentsSearch', 0, 0);
                else if (screen === 'favs') tv.set('favsSearch', 0, 0);
                else if (screen === 'cats') tv.set('catActions', 0, 0);
                else if (screen === 'add') tv.set(store.state.addType ? 'fields' : 'addTypes', 0, 0);
                else if (screen === 'edit') tv.set('fields', 0, 0);
                else if (screen === 'player') tv.set(store.state.playError ? 'playError' : 'overlay', 0, 0);
                else tv.set('sources', 0, 0);
            }
        });

        zone('homeActions', '#homeActions .btn', {
            onEdge: function (dir) {
                if (dir === 'down') tv.set('types', 0, 0);
                else if (dir === 'left' || dir === 'up') tv.set('rail', 0, 0);
            }
        });

        zone('types', '#typeList .type', {
            onEdge: function (dir) {
                if (dir === 'left') tv.set('rail', 0, 0);
                else if (dir === 'right') tv.set('sources', 0, 0);
                else if (dir === 'up') tv.set('homeActions', 0, 0);
            }
        });

        zone('sources', '#sourceList .row', {
            onEdge: function (dir) {
                if (dir === 'left') tv.set('types', 0, 0);
                else if (dir === 'up') tv.set('homeActions', 0, 0);
                // La derecha entra en el boton de editar DE ESA fila. No puede ser
                // parte de la misma zona: el boton vive dentro de la fila, y su
                // offsetTop es relativo a ella, asi que el motor no puede agruparlos
                // en la misma fila por posicion. Se resuelve por indice.
                else if (dir === 'right') enterEditFromRow();
            }
        });

        // Zona de un solo elemento: el boton de la fila que se este editando. Asi
        // arriba/abajo pasan de una fila a otra (con el indice) y la izquierda vuelve
        // a la lista, sin depender de posiciones.
        var editRow = 0;

        function enterEditFromRow() {
            var rows = ui.qsa('#sourceList .row.source');
            var fromRow = rows.indexOf(document.querySelector('.focused'));
            // la fila de añadir no tiene boton de editar: ahi la derecha no hace nada
            if (fromRow !== -1) showEdit(fromRow);
        }

        function showEdit(index) { editRow = index; tv.set('sourceEdit', 0, 0); }
        tv.define('sourceEdit', function () {
            var buttons = ui.qsa('#sourceList .edit');
            return buttons[editRow] ? [[buttons[editRow]]] : [];
        }, {
            onEdge: function (dir) {
                var buttons = ui.qsa('#sourceList .edit');
                if (dir === 'left') tv.set('sources', editRow, 0);
                else if (dir === 'up') showEdit(Math.max(0, editRow - 1));
                else if (dir === 'down') showEdit(Math.min(buttons.length - 1, editRow + 1));
                else if (dir === 'right') tv.set('rail', 0, 0);
            }
        });



        zone('tvActions', '#tvActions .btn', {
            onEdge: function (dir) {
                if (dir === 'down') tv.set('tvSearch', 0, 0);
                else if (dir === 'right') tv.set('tvSearch', 0, 0);
                else if (dir === 'left') tv.set('rail', 0, 0);
            }
        });

        zone('tvSearch', '#tvSearch', {
            onEdge: function (dir) {
                if (dir === 'up') tv.set('tvActions', 0, 0);
                else if (dir === 'left') tv.set('tvActions', 0, 0);
                else if (dir === 'down') tv.set('tvCats', 0, 0);
            }
        });

        zone('tvCats', '#tvCats .tvcat', {
            onEdge: function (dir) {
                if (dir === 'up') tv.set('tvSearch', 0, 0);
                else if (dir === 'left') tv.set('rail', 0, 0);
            }
        });

        zone('tvcatSearch', '#tvcatSearch', {
            onEdge: function (dir) {
                if (dir === 'up' || dir === 'left') tv.set('tvcatActions', 0, 0);
                else if (dir === 'down') tv.set('tvChannels', 0, 0);
            }
        });

        zone('tvChannels', '#tvChannels .channel', {
            onEdge: function (dir) {
                // Izquierda sube de nivel (vuelve a las categorias), como en
                // cualquier TV. Antes saltaba al rail y no habia forma de volver.
                if (dir === 'left') store.backToTv();
                else if (dir === 'up') tv.set('tvcatSearch', 0, 0);
            }
        });

        zone('recentsSearch', '#recentsSearch', {
            onEdge: function (dir) {
                if (dir === 'up') tv.set('rail', 0, 0);
                else if (dir === 'down') tv.set('recentsList', 0, 0);
            }
        });

        zone('recentsList', '#recentsList .channel', {
            onEdge: function (dir) {
                if (dir === 'up') tv.set('recentsSearch', 0, 0);
                else if (dir === 'left') tv.set('rail', 0, 0);
            }
        });

        zone('favsSearch', '#favsSearch', {
            onEdge: function (dir) {
                if (dir === 'up') tv.set('rail', 0, 0);
                else if (dir === 'down') tv.set('favsList', 0, 0);
            }
        });

        zone('favsList', '#favList .channel', {
            onEdge: function (dir) {
                if (dir === 'up') tv.set('favsSearch', 0, 0);
                else if (dir === 'left') tv.set('rail', 0, 0);
            }
        });

        zone('catActions', '#catActions .btn', {
            onEdge: function (dir) {
                if (dir === 'down') tv.set('cats', 0, 0);
                else if (dir === 'right') tv.set('catSearch', 0, 0);
                else if (dir === 'left' || dir === 'up') tv.set('rail', 0, 0);
            }
        });

        zone('catSearch', '#catSearch', {
            onEdge: function (dir) {
                if (dir === 'up') tv.set('catActions', 0, 0);
                else if (dir === 'left') tv.set('catActions', 0, 0);
                else if (dir === 'down') tv.set('cats', 0, 0);
            }
        });

        zone('cats', '#catList .cat', {
            onEdge: function (dir) {
                if (dir === 'up') tv.set('catSearch', 0, 0);
                else if (dir === 'left') tv.set('rail', 0, 0);
            }
        });

        zone('addTypes', '#addTypes .typecard', {
            onEdge: function (dir) {
                if (dir === 'left') tv.set('rail', 0, 0);
            }
        });

        zone('fields', '#sourceForm input:not(.file), #sourceForm textarea, #sourceForm .pick', {
            onEdge: function (dir) {
                if (dir === 'down') tv.set('formActions', 0, 0);
                else if (dir === 'left') tv.set('rail', 0, 0);
            }
        });

        zone('formActions', '#sourceForm .btn', {
            onEdge: function (dir) { if (dir === 'up') tv.set('fields', 9, 0); }
        });

        zone('overlay', '#ovFav', {
            onEdge: function (dir) {
                if (dir === 'left') store.zap(-1);
                else if (dir === 'right') store.zap(1);
            }
        });

        // Con un canal caido, la zona del reproductor son los botones de la
        // tarjeta de error: reintentar o volver.
        zone('playError', '#playError .btn', {
            onEdge: function (dir) {
                if (dir === 'up' || dir === 'left') tv.set('rail', 0, 0);
            }
        });

        zone('confirm', '#confirm .btn');
    }

    function back() {
        if (store.state.confirm) { store.closeConfirm(); return true; }
        if (store.state.screen === 'player') { store.exitPlayer(); return true; }
        if (store.state.screen === 'edit') { store.goHome(); return true; }
        if (store.state.screen === 'tvcat') { store.backToTv(); return true; }
        if (store.state.screen !== 'home') { store.goHome(); return true; }
        try { tizen.application.getCurrentApplication().exit(); } catch (error) { /* no es Tizen */ }
        return true;
    }

    // Tecla roja: guardar o quitar de favoritos lo enfocado, o borrar la lista
    // cuando la fila enfocada es una lista.
    function red() {
        var element = tv.focusedElement();
        var state = store.state;

        if (state.screen === 'player' && state.playing) {
            var added = store.toggleFavorite(state.playing.channel, state.playing.listId);
            store.notify(added ? 'Added to favorites' : 'Removed from favorites');
            return;
        }

        if (!element) return;

        if (state.screen === 'home') {
            var list = element.dataset.list ? store.listById(element.dataset.list) : null;
            if (!list) return;
            store.askConfirm('Delete “' + list.name + '”? Favorites are kept.', function () {
                store.removeList(list.id);
                store.notify('Source deleted');
                store.goHome();
            });
            return;
        }

        var url = element.dataset.url;
        var listId = element.dataset.list;
        if (!url) return;
        var channel = store.channelByUrl(url, listId);
        if (!channel) return;
        var saved = store.toggleFavorite(channel, listId);
        store.notify(saved ? 'Added to favorites' : 'Removed from favorites');
    }

    // Devuelve true si la app se queda la tecla.
    function onKey(code) {
        if (code >= 48 && code <= 57) { store.pushDigit(String(code - 48)); return true; }
        if (code >= 96 && code <= 105) { store.pushDigit(String(code - 96)); return true; }
        if (code === tv.KEY.BACK || code === 27) return store.clearDigits() ? true : back();
        if (code === tv.KEY.RED) { red(); return true; }
        if (code === tv.KEY.ENTER) return store.commitDigits();
        if (store.state.screen !== 'player') return false;
        if (code === tv.KEY.CH_UP) { store.zap(1); return true; }
        if (code === tv.KEY.CH_DOWN) { store.zap(-1); return true; }
        if (code === tv.KEY.PLAY_PAUSE) { player.toggle(); return true; }
        return false;
    }

    function start() {
        store.init();
        defineZones();
        tv.listen(onKey, { onFocus: store.focusChanged });
        ui.render();
        store.goHome();
    }

    document.addEventListener('DOMContentLoaded', start);
})();
