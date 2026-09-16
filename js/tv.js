var App = App || {};

App.tv = (function () {
    var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, RED: 403, CH_UP: 427, CH_DOWN: 428, PLAY_PAUSE: 10252 };

    var zones = {};
    var current = null;
    var row = 0;
    var col = 0;
    var onKey = function () {};
    var onFocus = null;

    function rows(elements) {
        var out = [];
        var top = null;
        for (var i = 0; i < elements.length; i++) {
            var elementTop = elements[i].offsetTop;
            if (top === null || Math.abs(elementTop - top) > 8) {
                out.push([]);
                top = elementTop;
            }
            out[out.length - 1].push(elements[i]);
        }
        return out;
    }

    function define(name, items, options) {
        zones[name] = { items: items, onEdge: options && options.onEdge };
    }

    // Rows are grouped by offsetTop: what a TV layout needs, and what jsdom lacks.
    function matrix() {
        var zone = zones[current];
        if (!zone) return [];
        var items = typeof zone.items === 'function' ? zone.items() : zone.items;
        return items || [];
    }

    function apply() {
        var previous = document.querySelector('.focused');
        if (previous) previous.classList.remove('focused');

        var grid = matrix();
        if (!grid.length) return;
        if (row >= grid.length) row = grid.length - 1;
        if (row < 0) row = 0;
        var line = grid[row] || [];
        if (!line.length) return;
        if (col >= line.length) col = line.length - 1;
        if (col < 0) col = 0;

        var element = line[col];
        element.classList.add('focused');
        reveal(element);
        if (onFocus) onFocus(element);
    }

    // Scroll only the container that overflows: scrollIntoView dragged the whole document.
    function reveal(element) {
        var box = scrollBox(element);
        if (!box || !element.getBoundingClientRect) return;
        var item = element.getBoundingClientRect();
        var frame = box.getBoundingClientRect();
        if (item.top < frame.top) box.scrollTop -= frame.top - item.top;
        else if (item.bottom > frame.bottom) box.scrollTop += item.bottom - frame.bottom;
    }

    function scrollBox(element) {
        for (var node = element.parentNode; node && node !== document.body; node = node.parentNode) {
            var overflow = window.getComputedStyle(node).overflowY;
            if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
        }
        return null;
    }

    function set(name, r, c) {
        current = name;
        row = r || 0;
        col = c || 0;
        apply();
    }

    function edge(direction) {
        var zone = zones[current];
        if (zone && zone.onEdge) zone.onEdge(direction);
    }

    function move(direction) {
        if (!zones[current]) return;
        var grid = matrix();
        if (!grid.length) return;
        var line = grid[row] || [];

        if (direction === 'up') {
            if (row > 0) row--; else return edge('up');
        } else if (direction === 'down') {
            if (row < grid.length - 1) row++; else return edge('down');
        } else if (direction === 'left') {
            if (col > 0) col--; else return edge('left');
        } else if (direction === 'right') {
            if (col < line.length - 1) col++; else return edge('right');
        }
        apply();
    }

    function focusedElement() {
        return document.querySelector('.focused');
    }

    // Focusing a field from inside the key handler is what summons the TV's IME.
    function select() {
        var element = focusedElement();
        if (!element) return;
        if (element.tagName === 'INPUT' && element.type === 'file') element.click();
        else if (field(element)) element.focus();
        else element.click();
    }

    // Keys belong to the focused text field, textarea included.
    function field(element) {
        if (!element) return false;
        return element.tagName === 'TEXTAREA'
            || (element.tagName === 'INPUT' && element.type !== 'file');
    }

    function typing() {
        return field(document.activeElement) && document.activeElement.type !== 'file';
    }

    function handle(event) {
        if (typing()) {
            var field = document.activeElement;
            if (event.keyCode === KEY.UP || event.keyCode === KEY.DOWN) {
                field.blur();
            } else {
                if (event.keyCode === KEY.BACK) field.blur();
                return;
            }
        }

        if (onKey(event.keyCode)) return;

        switch (event.keyCode) {
            case KEY.UP: move('up'); break;
            case KEY.DOWN: move('down'); break;
            case KEY.LEFT: move('left'); break;
            case KEY.RIGHT: move('right'); break;
            case KEY.ENTER: select(); break;
        }
    }

    // Some firmwares only deliver the non-arrow keys if they are registered first.
    function listen(handler, options) {
        onKey = handler;
        onFocus = (options && options.onFocus) || null;
        document.addEventListener('keydown', handle);
        try {
            if (typeof tizen !== 'undefined') {
                tizen.tvinputdevice.registerKeyBatch(['ColorF0Red', 'ChannelUp', 'ChannelDown', 'MediaPlayPause']);
            }
        } catch (error) {  }
    }

    return {
        KEY: KEY,
        define: define,
        set: set,
        refresh: apply,
        move: move,
        select: select,
        rows: rows,
        listen: listen,
        focusedElement: focusedElement
    };
})();
