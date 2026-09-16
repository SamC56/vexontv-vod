var App = App || {}

App.uiScreens = App.uiScreens || {}
;(function () {
    var kit = App.uiKit
    var store = App.store
    var html = kit.html
    var clock = kit.clock
    var useEffect = kit.useEffect
    var Bar = kit.Bar
    var Search = kit.Search
    var ChannelList = kit.ChannelList

    var player = App.player

    // The stylesheet ships both spellings of mask subtraction; accept either.
    function supportsHole() {
        if (!window.CSS || !window.CSS.supports) return false
        return (
            window.CSS.supports("-webkit-mask-composite", "xor") ||
            window.CSS.supports("mask-composite", "exclude")
        )
    }

    // CSS pixels: AVPlay converts to its grid at the other end.
    function previewBox() {
        var element = document.getElementById("previewStage")
        return element && element.getBoundingClientRect ? element.getBoundingClientRect() : null
    }

    function videoRect() {
        var box = previewBox()
        if (!box || box.width < 2) return null
        var scale = 1920 / (window.innerWidth || 1920)
        return {
            x: box.left * scale,
            y: box.top * scale,
            w: box.width * scale,
            h: box.height * scale,
        }
    }

    // The rect goes on the document root: the card's own mask reads the same variables.
    function setHole() {
        var box = previewBox()
        var layer = document.getElementById("backdrop")
        var stage = document.getElementById("previewStage")
        if (!box || !layer) return
        var rootStyle = document.documentElement.style
        // Un pixel por lado: el filo de foco vive en el borde de la tarjeta y a sangre se
        // lo comia la mascara justo a la altura del video (el borde se cortaba ahi).
        var inset = 1
        rootStyle.setProperty("--hole-x", Math.round(box.left + inset) + "px")
        rootStyle.setProperty("--hole-y", Math.round(box.top + inset) + "px")
        rootStyle.setProperty("--hole-w", Math.round(box.width - inset * 2) + "px")
        rootStyle.setProperty("--hole-h", Math.round(box.height - inset * 2) + "px")
        if (stage && stage.offsetParent) {
            rootStyle.setProperty("--stage-x", Math.round(stage.offsetLeft + inset) + "px")
            rootStyle.setProperty("--stage-y", Math.round(stage.offsetTop + inset) + "px")
        }
    }

    var iconTvBig = kit.svg(
        html`<rect
                x="2.5"
                y="5"
                width="19"
                height="13"
                rx="2"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
            /><path
                d="M8.5 21h7"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
            />`,
        64,
    )

    function Preview() {
        var state = store.state
        var channel = state.preview
        if (!channel) {
            return html`<div class="preview-card" id="previewCard">
                <div class="preview-stage" id="previewStage">
                    <div class="preview-empty" id="previewEmpty">
                        <span class="preview-icon">${iconTvBig}</span>
                        <p class="preview-hint">Select a channel to see it here</p>
                    </div>
                </div>
            </div>`
        }
        var program = store.programOf(channel)
        var next = store.nextOf(channel)
        var progress = store.programProgress(program)
        return html`<div class="preview-card" id="previewCard">
            <div class="preview-stage" id="previewStage">
                <span class="preview-logo" style=${kit.logoStyle(channel.logo)}>
                    ${channel.logo ? null : html`<span class="preview-letter">${kit.initial(channel.name)}</span>`}
                </span>
            </div>
            <div class="preview-info">
                <h2 class="preview-name">${channel.name}</h2>
                <p class="preview-group">${channel.group || ""}</p>
                ${
                    program
                        ? html`<div class="preview-guide">
                              <p class="preview-program">
                                  ${program.title}
                                  <span class="ov-time"
                                      >${clock(program.start)} – ${clock(program.end)}</span
                                  >
                              </p>
                              ${
                                  progress !== null
                                      ? html`<div class="ov-progress">
                                            <span
                                                class="ov-progress-fill"
                                                style=${"width:" + progress + "%"}
                                            ></span>
                                        </div>`
                                      : null
                              }
                          </div>`
                        : null
                }
                ${
                    next
                        ? html`<p class="preview-next">
                              <span class="ov-next-tag">Next</span>${next.title}
                              ${next.start ? html`<span class="ov-time">${clock(next.start)} – ${clock(next.end)}</span>` : null}
                          </p>`
                        : null
                }
                <p class="preview-open">Press OK to watch full screen</p>
            </div>
        </div>`
    }

    function TvScreen() {
        var state = store.state

        useEffect(
            function () {
                if (!state.preview || !state.preview.url) {
                    player.stop()
                    return
                }
                setHole()
                if (supportsHole()) document.body.classList.add("previewing")
                player.play(state.preview.url, videoRect())
                function onResize() {
                    setHole()
                    player.play(state.preview.url, videoRect())
                }
                window.addEventListener("resize", onResize)
                return function () {
                    window.removeEventListener("resize", onResize)
                    document.body.classList.remove("previewing")
                    player.stop()
                }
            },
            [state.preview],
        )

        var view = store.tvCategories()
        var channels = store.visibleTvCategory()
        var pending = store.loadingRows()
        var rows = store.tvCategories().rows

        return html`<section class="screen" id="screen-tv">
            <${Bar}
                title="TV"
                meta=${view.label}
                metaId="tvMeta"
                titleId="tvTitle"
                actions=${html`<div class="bar-actions" id="tvActions">
                    <button
                        class="btn"
                        id="catsBtn"
                        tabindex="-1"
                        onClick=${function () {
                            store.openCategories()
                        }}
                    >
                        Categories
                    </button>
                </div>`}
                search=${html`<${Search}
                    id="tvSearch"
                    countId="tvSearchCount"
                    scope="tv"
                    resetKey="tv"
                    placeholder="Search categories"
                    count=${view.count}
                    onInput=${function (value) {
                        store.setSearch("tv", value)
                    }}
                />`}
            />
            ${state.lists.length ? null : html`<p class="empty">Every source's channels meet here. Add one to start.</p>`}
            <div class="browse" id="browse">
                <div class="browse-cats" id="tvCats">
                    ${pending.map(function (row) {
                        return html`<div class="row pending" key=${"load-" + row.key}>
                            <span class="pending-dot"></span>
                            <span class="row-main">
                                <span class="row-name">${row.name}</span>
                                <span class="row-sub"
                                    >${row.label}${
                                        row.count !== undefined
                                            ? " · " + store.formatCount(row.count) + " channels"
                                            : "…"
                                    }</span
                                >
                            </span>
                        </div>`
                    })}
                    ${
                        rows.length || pending.length
                            ? null
                            : html`<p class="empty">
                                  ${view.total ? "No category matches your search." : "No categories yet."}
                              </p>`
                    }
                    ${rows.map(function (row) {
                        return html`<button
                            class=${"row tvcat" + (row.name === state.catName ? " selected" : "")}
                            tabindex="-1"
                            data-group=${row.name}
                            onClick=${function () {
                                store.openTvCategory(row.name)
                            }}
                        >
                            <span class="row-main">
                                <span class="row-name">${row.name}</span>
                                ${row.sources > 1 ? html`<span class="row-sub">${row.sources} sources</span>` : null}
                            </span>
                            <span class="row-count">${store.formatCount(row.count)}</span>
                        </button>`
                    })}
                </div>
                <div class="browse-channels">
                    <${ChannelList} id="tvChannels" view=${channels} detail=${true} />
                </div>
                <div
                    class="browse-preview"
                    id="tvPreview"
                    tabindex="-1"
                    onClick=${function () {
                        if (state.preview)
                            store.play(state.preview, state.preview.listId, store.zapChannels())
                    }}
                >
                    <${Preview} />
                </div>
            </div>
        </section>`
    }

    App.uiScreens.tv = TvScreen
})()
