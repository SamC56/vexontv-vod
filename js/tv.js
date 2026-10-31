var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

App.tv = (function () {
    const KEY = {
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40,
        ENTER: 13,
        BACK: 10009,
        RED: 403,
        GREEN: 404,
        PREVIOUS: 10190,
        CH_UP: 427,
        CH_DOWN: 428,
        PLAY_PAUSE: 10252,
        PLAY: 415,
        PAUSE: 19,
        STOP: 413,
        FAST_FORWARD: 417,
        REWIND: 412,
    }

    const zones = {}
    let current = null
    let row = 0
    let col = 0
    let onKey = function () {}
    let onFocus = null

    function rows(elements) {
        const out = []
        let top = null
        for (let i = 0; i < elements.length; i++) {
            const elementTop = elements[i].offsetTop
            if (top === null || Math.abs(elementTop - top) > 8) {
                out.push([])
                top = elementTop
            }
            out[out.length - 1].push(elements[i])
        }
        return out
    }

    // onHold: OK held down on an item of the zone; a short press still selects it.
    function define(name, items, options) {
        zones[name] = {
            items,
            onEdge: options && options.onEdge,
            onHold: options && options.onHold,
        }
    }

    const HOLD_MS = 700
    // Repeats of a held key come every 50-100 ms; a press after a longer gap is a new one,
    // in case a keyup went missing.
    const REPEAT_GAP_MS = 400
    let holdTimer = null
    let holding = false
    let lastOkAt = 0

    // While OK stays down its repeats are ignored, so a hold does not also act as a press.
    function repeatOfHeldOk(event) {
        if (event.keyCode !== KEY.ENTER) return false
        const now = Date.now()
        const repeat = holding && now - lastOkAt < REPEAT_GAP_MS
        lastOkAt = now
        if (holding && !repeat) {
            holding = false
            if (holdTimer) clearTimeout(holdTimer)
            holdTimer = null
        }
        return repeat
    }

    // The TV repeats keydown while OK is held: the first one starts the wait, keyup ends it.
    function pressOk(zone) {
        if (holding) return
        holding = true
        const element = focusedElement()
        holdTimer = setTimeout(() => {
            holdTimer = null
            if (element) zone.onHold(element)
        }, HOLD_MS)
    }

    function releaseOk(event) {
        if (event.keyCode !== KEY.ENTER || !holding) return
        holding = false
        if (!holdTimer) return
        clearTimeout(holdTimer)
        holdTimer = null
        select()
    }

    // Rows are grouped by offsetTop: what a TV layout needs, and what jsdom lacks.
    function matrix() {
        const zone = zones[current]
        if (!zone) return []
        const items = typeof zone.items === "function" ? zone.items() : zone.items
        return items || []
    }

    function apply() {
        const previous = document.querySelector(".focused")
        if (previous) previous.classList.remove("focused")

        const grid = matrix()
        if (!grid.length) return
        if (row >= grid.length) row = grid.length - 1
        if (row < 0) row = 0
        const line = grid[row] || []
        if (!line.length) return
        if (col >= line.length) col = line.length - 1
        if (col < 0) col = 0

        const element = line[col]
        element.classList.add("focused")
        reveal(element)
        if (onFocus) onFocus(element)
    }

    // Scroll only the container that overflows: scrollIntoView dragged the whole document.
    function reveal(element) {
        const box = scrollBox(element)
        if (!box || !element.getBoundingClientRect) return
        const item = element.getBoundingClientRect()
        const frame = box.getBoundingClientRect()
        if (item.top < frame.top) box.scrollTop -= frame.top - item.top
        else if (item.bottom > frame.bottom) box.scrollTop += item.bottom - frame.bottom
    }

    function scrollBox(element) {
        for (
            let node = element.parentNode;
            node && node !== document.body;
            node = node.parentNode
        ) {
            const overflow = window.getComputedStyle(node).overflowY
            if (
                (overflow === "auto" || overflow === "scroll") &&
                node.scrollHeight > node.clientHeight
            )
                return node
        }
        return null
    }

    function set(name, r, c) {
        current = name
        row = r || 0
        col = c || 0
        apply()
    }

    // Focus one element of a zone wherever the layout put it: a grid's columns depend on
    // the screen, so a row and column cannot be worked out beforehand.
    function setOn(name, element) {
        current = name
        row = 0
        col = 0
        const grid = matrix()
        for (let r = 0; r < grid.length; r++) {
            const c = grid[r].indexOf(element)
            if (c !== -1) {
                row = r
                col = c
                break
            }
        }
        apply()
    }

    function edge(direction) {
        const zone = zones[current]
        if (zone && zone.onEdge) zone.onEdge(direction)
    }

    function move(direction) {
        if (!zones[current]) return
        const grid = matrix()
        if (!grid.length) return
        const line = grid[row] || []

        if (direction === "up") {
            if (row > 0) row--
            else return edge("up")
        } else if (direction === "down") {
            if (row < grid.length - 1) row++
            else return edge("down")
        } else if (direction === "left") {
            if (col > 0) col--
            else return edge("left")
        } else if (direction === "right") {
            if (col < line.length - 1) col++
            else return edge("right")
        }
        apply()
    }

    function focusedElement() {
        return document.querySelector(".focused")
    }

    // Focusing a field from inside the key handler is what summons the TV's IME.
    function select() {
        const element = focusedElement()
        if (!element) return
        if (element.tagName === "INPUT" && element.type === "file") element.click()
        else if (field(element)) element.focus()
        else element.click()
    }

    // Keys belong to the focused text field, textarea included.
    function field(element) {
        if (!element) return false
        return (
            element.tagName === "TEXTAREA" ||
            (element.tagName === "INPUT" && element.type !== "file")
        )
    }

    function typing() {
        return field(document.activeElement) && document.activeElement.type !== "file"
    }

    function handle(event) {
        if (repeatOfHeldOk(event)) return
        if (typing()) {
            const field = document.activeElement
            if (event.keyCode === KEY.UP || event.keyCode === KEY.DOWN) {
                field.blur()
            } else {
                if (event.keyCode === KEY.BACK) field.blur()
                return
            }
        }

        if (onKey(event.keyCode)) return

        switch (event.keyCode) {
            case KEY.UP:
                move("up")
                break
            case KEY.DOWN:
                move("down")
                break
            case KEY.LEFT:
                move("left")
                break
            case KEY.RIGHT:
                move("right")
                break
            case KEY.ENTER:
                if (zones[current] && zones[current].onHold) pressOk(zones[current])
                else select()
                break
        }
    }

    // Some firmwares only deliver the non-arrow keys if they are registered first.
    function listen(handler, options) {
        onKey = handler
        onFocus = (options && options.onFocus) || null
        document.addEventListener("keydown", handle)
        document.addEventListener("keyup", releaseOk)
        try {
            if (typeof tizen !== "undefined") {
                tizen.tvinputdevice.registerKeyBatch([
                    "ColorF0Red",
                    "ColorF1Green",
                    "PreviousChannel",
                    "ChannelUp",
                    "ChannelDown",
                    "MediaPlayPause",
                    "MediaPlay",
                    "MediaPause",
                    "MediaStop",
                    "MediaFastForward",
                    "MediaRewind",
                ])
            }
        } catch {}
    }

    return {
        KEY,
        define,
        set,
        setOn,
        refresh: apply,
        move,
        select,
        rows,
        listen,
        focusedElement,
        currentZone: function () {
            return current
        },
    }
})()
