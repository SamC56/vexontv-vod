var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

App.uiKit = (function () {
    const preact = window.preact
    const hooks = window.preactHooks
    const html = window.htm.bind(preact.h)
    const useState = hooks.useState
    const useEffect = hooks.useEffect
    const useRef = hooks.useRef
    const store = App.store

    const SEARCH_DEBOUNCE_MS = 150

    const ADD_TYPES = [
        { id: "url", title: "M3U from URL", hint: "An .m3u or .m3u8 address", icon: "link" },
        { id: "file", title: "M3U from a file", hint: "An .m3u on a USB drive", icon: "file" },
        { id: "xtream", title: "Xtream", hint: "Server, username and password", icon: "key" },
        { id: "stalker", title: "Stalker", hint: "Portal and MAC", icon: "box" },
        { id: "raw", title: "Pasted M3U", hint: "The playlist text", icon: "text" },
        {
            id: "auto",
            title: "Detect",
            hint: "Paste whatever your provider gave you",
            icon: "wand",
        },
    ]

    const FIELD_SETS = {
        url: [{ id: "url", label: "Playlist address", placeholder: "http://host:8080/list.m3u" }],
        file: [],
        xtream: [
            { id: "origin", label: "Server", placeholder: "http://host:8080" },
            { id: "user", label: "Username" },
            { id: "pass", label: "Password" },
        ],
        stalker: [
            { id: "origin", label: "Portal", placeholder: "http://host:8080/c" },
            { id: "mac", label: "MAC", placeholder: "00:1A:79:12:34:56" },
        ],
        raw: [{ id: "text", label: "Playlist contents", multiline: true, placeholder: "#EXTM3U…" }],
        auto: [
            {
                id: "text",
                label: "Paste the address, the credentials or the whole message",
                multiline: true,
            },
        ],
    }

    function svg(paths, size) {
        return html`<svg viewBox="0 0 24 24" width=${size || 22} height=${size || 22}>
            ${paths}
        </svg>`
    }

    const iconSearch = svg(
        html`<circle
                cx="11"
                cy="11"
                r="6.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
            /><path
                d="M16 16l4.5 4.5"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
            />`,
    )
    const iconLink = svg(
        html`<path
                d="M10 13a4 4 0 006 .5l2-2a4 4 0 00-5.6-5.7L11 7"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
            /><path
                d="M14 11a4 4 0 00-6-.5l-2 2A4 4 0 0011.6 18L13 16.6"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
            />`,
    )
    const iconFile = svg(
        html`<path
                d="M6 3h8l4 4v14H6z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linejoin="round"
            /><path d="M14 3v4h4" fill="none" stroke="currentColor" stroke-width="1.7" />`,
    )
    const iconKey = svg(
        html`<circle
                cx="8"
                cy="12"
                r="3.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
            /><path
                d="M11.5 12H21M18 12v3M15 12v2"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
            />`,
    )
    const iconBox = svg(
        html`<rect
                x="3"
                y="6"
                width="18"
                height="12"
                rx="2"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
            /><path
                d="M7 10h6M7 14h10"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
            />`,
    )
    const iconText = svg(
        html`<path
            d="M5 7h14M5 12h14M5 17h8"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
        />`,
    )
    const iconWand = svg(
        html`<path
            d="M6 18L18 6M15 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
        />`,
    )
    const iconPencil = svg(
        html`<path
                d="M5 19h3L19 8l-3-3L5 16z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linejoin="round"
            /><path d="M15 6l3 3" fill="none" stroke="currentColor" stroke-width="1.7" />`,
        20,
    )
    const iconCheck = svg(
        html`<path
            d="M5 13l4 4L19 7"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
        />`,
    )

    const TYPE_ICONS = {
        link: iconLink,
        file: iconFile,
        key: iconKey,
        box: iconBox,
        text: iconText,
        wand: iconWand,
    }

    function initial(name) {
        const match = (name || "").match(/[a-z0-9]/i)
        return match ? match[0].toUpperCase() : "?"
    }

    function logoStyle(url) {
        return url ? { backgroundImage: `url(${JSON.stringify(url)})` } : null
    }

    function clock(value) {
        const match = (value || "").match(/(\d{1,2}:\d{2})/)
        return match ? match[1] : ""
    }

    function programText(program) {
        if (!program || !program.title) return ""
        const span =
            program.start && program.end ? ` ${clock(program.start)}–${clock(program.end)}` : ""
        return program.title + span
    }

    // The clock: the system time, refreshed by the minute. A clock that ticks every
    // second is a distraction on a TV.
    function timeText() {
        const now = new Date()
        return `${`0${now.getHours()}`.slice(-2)}:${`0${now.getMinutes()}`.slice(-2)}`
    }

    function useClock() {
        const state = useState(timeText())
        const setTime = state[1]
        useEffect(() => {
            const tick = setInterval(() => {
                setTime(timeText())
            }, 20000)
            return function () {
                clearInterval(tick)
            }
        }, [])
        return state[0]
    }

    function ChannelRow(props) {
        const channel = props.channel
        const listId = props.listId || channel.listId
        const now = programText(store.programOf(channel))
        function open() {
            store.play(channel, listId, props.source)
        }
        return html`<button
            class=${`row channel${props.moving ? " moving" : ""}`}
            data-url=${channel.url}
            data-list=${listId}
            tabindex="-1"
            onClick=${open}
        >
            <span class="num">${props.number}</span>
            <span class="thumb" style=${logoStyle(channel.logo)}>
                ${channel.logo ? null : html`<span class="thumb-letter">${initial(channel.name)}</span>`}
            </span>
            <span class="row-main">
                <span class="row-name">${channel.name}</span>
                ${
                    props.detail && now
                        ? html`<span class="row-sub">${now}</span>`
                        : props.showGroup
                          ? html`<span class="row-sub">${channel.group || ""}</span>`
                          : null
                }
            </span>
            ${!props.detail && now ? html`<span class="row-now">${now}</span>` : null}
            ${props.saved ? html`<span class="saved">★</span>` : null}
        </button>`
    }

    function ChannelList(props) {
        const view = props.view
        function listOf(channel) {
            return props.listId || channel.listId
        }
        return html`<div class="rows" id=${props.id}>
            ${view.total ? null : html`<p class="empty">${view.empty || "No channels."}</p>`}
            ${view.items.map((channel, index) => {
                return html`<${ChannelRow}
                    key=${channel.url || channel.cmd || index}
                    channel=${channel}
                    listId=${listOf(channel)}
                    number=${index + 1}
                    source=${view.items}
                    showGroup=${view.showGroup}
                    detail=${props.detail}
                    saved=${store.isFavorite(listOf(channel), channel.url)}
                    moving=${props.moving === `${listOf(channel)}|${channel.url}`}
                />`
            })}
        </div>`
    }

    function SourceRow(props) {
        const channels = props.channels
        return html`<div
            class="row source"
            data-list=${props.list.id}
            tabindex="-1"
            onClick=${function () {
                store.openSource(props.list.id)
            }}
        >
            <span class="kind">${store.listLabel(props.list)}</span>
            <span class="row-main">
                <span class="row-name">${props.list.name}</span>
                <span class="row-sub">${props.list.url || props.list.origin || ""}</span>
            </span>
            <span class="row-count">${channels ? store.formatCount(channels.length) : "—"}</span>
            <button
                class="edit"
                data-list=${props.list.id}
                tabindex="-1"
                aria-label="Edit source"
                onClick=${function (event) {
                    event.stopPropagation()
                    store.openEdit(props.list.id)
                }}
            >
                ${iconPencil}<span>Edit</span>
            </button>
        </div>`
    }

    function AddRow() {
        return html`<button
            class="row add"
            tabindex="-1"
            onClick=${function () {
                store.openAdd()
            }}
        >
            <span class="kind">+</span>
            <span class="row-main">
                <span class="row-name">Add source</span>
                <span class="row-sub">M3U, Xtream, Stalker or pasted text</span>
            </span>
        </button>`
    }

    function Search(props) {
        const inputRef = useRef(null)
        const timer = useRef(null)
        useEffect(() => {
            if (inputRef.current)
                inputRef.current.value =
                    props.value !== undefined ? props.value : store.searchOf(props.scope)
        }, [props.scope, props.resetKey, props.value])

        function onInput(event) {
            const value = event.target.value
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => {
                props.onInput(value)
            }, SEARCH_DEBOUNCE_MS)
        }

        return html`<div class="search">
            ${iconSearch}
            <input
                id=${props.id}
                ref=${inputRef}
                type="text"
                placeholder=${props.placeholder}
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                tabindex="-1"
                onInput=${onInput}
            />
            <span class="search-count" id=${props.countId}>${props.count}</span>
        </div>`
    }

    // A moment after playback starts, the stream's quality in a corner; gone after a while.
    const QUALITY_DELAY_MS = 1200
    const QUALITY_SHOW_MS = 4000

    function QualityBadge(props) {
        const state = useState("")
        const label = state[0]
        const setLabel = state[1]
        useEffect(() => {
            setLabel("")
            if (!props.playing) return
            let hide = null
            const show = setTimeout(() => {
                setLabel(App.player.quality())
                hide = setTimeout(() => {
                    setLabel("")
                }, QUALITY_SHOW_MS)
            }, QUALITY_DELAY_MS)
            return function () {
                clearTimeout(show)
                if (hide) clearTimeout(hide)
            }
        }, [props.playing, props.watchKey])
        return label ? html`<p class="quality-badge" id="qualityBadge">${label}</p>` : null
    }

    function Bar(props) {
        return html`<header class="bar">
            <div class="bar-text">
                <h1 id=${props.titleId}>${props.title}</h1>
                <p class="meta" id=${props.metaId}>${props.meta}</p>
            </div>
            ${props.actions || null} ${props.search || null}
        </header>`
    }

    return {
        html,
        store,
        useState,
        useEffect,
        useRef,
        TYPE_ICONS,
        ADD_TYPES,
        FIELD_SETS,
        clock,
        svg,
        initial,
        logoStyle,
        programText,
        iconCheck,
        useClock,
        Bar,
        QualityBadge,
        Search,
        ChannelRow,
        ChannelList,
        SourceRow,
        AddRow,
    }
})()
