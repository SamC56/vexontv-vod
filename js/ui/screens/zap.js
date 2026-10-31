var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

App.uiScreens = App.uiScreens || {}
;(function () {
    const kit = App.uiKit
    const store = App.store
    const html = kit.html
    const clock = kit.clock
    const useEffect = kit.useEffect

    function ZapPanel() {
        const state = store.state
        const categories = store.zapCategories()
        const channels = store.zapChannels().slice(0, 200)
        const playing = state.playing && state.playing.channel ? state.playing.channel.url : ""

        // The open category sits in the middle of its list, not hundreds of rows down out of view.
        useEffect(() => {
            const box = document.getElementById("zapCats")
            const row = box && box.querySelector(".zapcat.selected")
            if (!row) return
            const offset = row.getBoundingClientRect().top - box.getBoundingClientRect().top
            box.scrollTop += offset - (box.clientHeight - row.offsetHeight) / 2
        }, [state.zapCategory, categories.length])

        return html`<div class="zap" id="zapPanel">
            <div class="zap-cats" id="zapCats">
                ${categories.map((category) => {
                    return html`<button
                        class=${`row zapcat${category.selected ? " selected" : ""}`}
                        tabindex="-1"
                        data-group=${category.name}
                        onClick=${function () {
                            store.setZapCategory(category.name)
                        }}
                    >
                        <span class="row-name">${category.name}</span>
                        ${category.playing ? html`<span class="zap-dot"></span>` : null}
                        <span class="row-count">${store.formatCount(category.count)}</span>
                    </button>`
                })}
            </div>
            <div class="zap-list" id="zapChannels">
                <p class="zap-head" id="zapHead">
                    <span
                        >${state.zapCategory || (store.zapLoading() ? "Loading channels…" : "")}</span
                    >
                    <span class="zap-hint">OK watch · BACK close</span>
                </p>
                ${channels.map((channel) => {
                    const program = store.programOf(channel)
                    const progress = store.programProgress(program)
                    const saved = store.isFavorite(channel.listId, channel.url)
                    return html`<button
                        class=${`row zapch${channel.url === playing ? " playing" : ""}`}
                        tabindex="-1"
                        data-url=${channel.url}
                        data-list=${channel.listId}
                        onClick=${function () {
                            store.zapTo(channel)
                        }}
                    >
                        <span class="thumb" style=${kit.logoStyle(channel.logo)}>
                            ${channel.logo ? null : html`<span class="thumb-letter">${kit.initial(channel.name)}</span>`}
                        </span>
                        <span class="zap-info">
                            <span class="zap-top">
                                <span class="row-name">${channel.name}</span>
                                ${saved ? html`<span class="saved">★</span>` : null}
                            </span>
                            ${
                                program
                                    ? html`<span class="zap-guide">
                                          <span class="zap-time">${clock(program.start)}</span>
                                          ${
                                              progress !== null
                                                  ? html`<span class="zap-bar">
                                                        <span
                                                            class="zap-bar-fill"
                                                            style=${`width:${progress}%`}
                                                        ></span>
                                                    </span>`
                                                  : html`<span class="zap-bar"></span>`
                                          }
                                          <span class="zap-time">${clock(program.end)}</span>
                                      </span>`
                                    : html`<span class="row-sub">${channel.group || ""}</span>`
                            }
                        </span>
                        ${channel.url === playing ? html`<span class="zap-now" aria-label="playing">▶</span>` : null}
                    </button>`
                })}
            </div>
        </div>`
    }

    App.uiScreens.zap = ZapPanel
})()
