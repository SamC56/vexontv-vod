var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

App.uiScreens = App.uiScreens || {}

;(function () {
    const kit = App.uiKit
    const store = App.store
    const html = kit.html

    App.uiScreens.loader = function Loader() {
        const state = store.state
        const rows = store.loadingRows()
        return html`<div class="loading" id="loading">
            <div class="spinner"></div>
            <div class="loading-head">
                <p class="loading-eyebrow" id="loadingEyebrow">${state.loading.eyebrow}</p>
                <h1 class="loading-title" id="loadingTitle">${state.loading.title}</h1>
            </div>
            <div class="loading-list" id="loadingList">
                ${rows.map((row) => {
                    return html`<div class="loading-row" key=${row.key}>
                        ${rows.length > 1 ? html`<span class="loading-name">${row.name}</span>` : null}
                        <span class="loading-phase"
                            >${row.label}${
                                row.count !== undefined
                                    ? ` · ${store.formatCount(row.count)} channels`
                                    : ""
                            }</span
                        >
                    </div>`
                })}
            </div>
            <p class="loading-meta" id="loadingMeta">
                <span class="loading-time" id="loadingTime"
                    >${store.elapsedOf(state.loading)} s</span
                >
                <span class="loading-hint" id="loadingHint">Very large playlists take a while</span>
            </p>
        </div>`
    }

    App.uiScreens.toast = function Toast(props) {
        return html`<div class="toast" id="toast">${props.message}</div>`
    }

    App.uiScreens.numBuffer = function NumBuffer(props) {
        return html`<div class="numbuffer" id="numBuffer">${props.value}</div>`
    }

    App.uiScreens.confirm = function Confirm() {
        const confirm = store.state.confirm
        return html`<div class="modal" id="confirm">
            <div class="modal-card">
                <p id="confirmText">${confirm.message}</p>
                <div class="actions">
                    <button
                        class="btn"
                        id="confirmCancel"
                        tabindex="-1"
                        onClick=${function () {
                            store.closeConfirm()
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        class="btn danger"
                        id="confirmOk"
                        tabindex="-1"
                        onClick=${function () {
                            const action = confirm.onAccept
                            store.closeConfirm()
                            if (action) action()
                        }}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>`
    }

    App.uiScreens.stillWatching = function StillWatching() {
        const left = store.stillSecondsLeft()
        return html`<div class="modal" id="stillWatching">
            <div class="modal-card still-card">
                <h2 class="still-title">Are you still watching?</h2>
                <p class="still-text" id="stillText">
                    Playback stops in <span id="stillLeft">${left}</span> s unless you answer.
                </p>
                <div class="actions">
                    <button
                        class="btn primary"
                        id="stillKeep"
                        tabindex="-1"
                        onClick=${function () {
                            store.keepWatching()
                        }}
                    >
                        Keep watching
                    </button>
                    <button
                        class="btn"
                        id="stillStop"
                        tabindex="-1"
                        onClick=${function () {
                            store.stopWatching()
                        }}
                    >
                        Stop
                    </button>
                </div>
            </div>
        </div>`
    }

    // While a favourite or a category is picked up with a long OK.
    App.uiScreens.moveHint = function MoveHint() {
        const moving = store.state.moving
        const grid = moving.scope === "movie" || moving.scope === "series"
        return html`<p class="move-hint" id="moveHint">
            <span class="ov-key">${grid ? "ARROWS" : "UP/DOWN"}</span>move
            <span class="ov-key">OK</span>place <span class="ov-key">BACK</span>cancel
        </p>`
    }
})()
