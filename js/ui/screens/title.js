var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

App.uiScreens = App.uiScreens || {}

;(function () {
    const kit = App.uiKit
    const store = App.store
    const vod = App.vod
    const html = kit.html

    // The catalog row draws at once; plot, cast, runtime and backdrop arrive with the
    // details call and fill in. A panel that sends none still leaves a playable page.
    App.uiScreens.title = function Title() {
        const item = vod.ui.title
        if (!item) return null
        const details = vod.ui.details
        const loading = !details
        const info = details || {}
        const progress = vod.progressOf(item)
        const resume = vod.resumePoint(item)
        const runtime = vod.formatRuntime(info.duration || (progress && progress.dur))
        const rating = info.rating || item.rating
        const year = item.year || info.year
        const backdrop = info.backdrop || info.poster || item.logo
        const ratio = progress && progress.dur > 0 ? Math.min(1, progress.pos / progress.dur) : 0

        let plot = info.plot || item.plot || ""
        if (!plot && loading) plot = "Loading details…"
        else if (!plot) plot = vod.ui.detailsError || "The panel has no description for this title."

        return html`<section class="screen title-screen" id="screen-title">
            <div class="title-backdrop" style=${kit.logoStyle(backdrop)} aria-hidden="true"></div>
            <div class="title-body">
                <div class="title-text">
                    <p class="title-kicker" id="titleKicker">Movie · ${item.group || ""}</p>
                    <h1 class="title-name" id="titleName">${item.name}</h1>
                    <p class="title-chips" id="titleChips">
                        ${rating ? html`<span class="chip-rating">★ ${rating.toFixed(1)}</span>` : null}
                        ${year ? html`<span>${year}</span>` : null}
                        ${runtime ? html`<span>${runtime}</span>` : null}
                        ${info.genre ? html`<span>${info.genre}</span>` : null}
                    </p>
                    <p class=${`title-plot${loading ? " dim" : ""}`} id="titlePlot">${plot}</p>
                    ${
                        info.director || info.cast
                            ? html`<p class="title-cast" id="titleCast">
                                  ${info.director ? html`<span><b>Director</b> ${info.director}</span>` : null}
                                  ${info.cast ? html`<span><b>Cast</b> ${info.cast}</span>` : null}
                              </p>`
                            : null
                    }
                    <div class="actions title-actions" id="titleActions">
                        <button
                            class="btn primary"
                            id="titlePlay"
                            tabindex="-1"
                            onClick=${function () {
                                vod.playTitle(item, false)
                            }}
                        >
                            ${resume ? `Resume from ${vod.formatTime(resume)}` : "Play"}
                        </button>
                        ${
                            resume
                                ? html`<button
                                      class="btn"
                                      id="titleRestart"
                                      tabindex="-1"
                                      onClick=${function () {
                                          vod.playTitle(item, true)
                                      }}
                                  >
                                      Start over
                                  </button>`
                                : null
                        }
                        <button
                            class=${`btn${vod.isFavorite(item) ? " saved" : ""}`}
                            id="titleFav"
                            tabindex="-1"
                            onClick=${function () {
                                const added = vod.toggleFavorite(item)
                                store.notify(
                                    added ? "Added to favorites" : "Removed from favorites",
                                )
                            }}
                        >
                            ${vod.isFavorite(item) ? "Remove from favorites" : "Add to favorites"}
                        </button>
                        ${
                            vod.hasProgress(item)
                                ? html`<button
                                      class="btn"
                                      id="titleForget"
                                      tabindex="-1"
                                      onClick=${function () {
                                          vod.confirmForget(item, "titleActions")
                                      }}
                                  >
                                      Remove from Continue watching
                                  </button>`
                                : null
                        }
                    </div>
                    ${
                        resume
                            ? html`<div class="title-progress" id="titleProgress">
                                  <span class="title-progress-bar"
                                      ><span
                                          class="title-progress-fill"
                                          style=${`width:${Math.round(ratio * 100)}%`}
                                      ></span
                                  ></span>
                                  <span class="title-progress-left"
                                      >${vod.formatRuntime(progress.dur - progress.pos)} left</span
                                  >
                              </div>`
                            : null
                    }
                </div>
                <div class="title-poster">
                    <span class="poster-letter">${kit.initial(item.name)}</span>
                    ${
                        info.poster || item.logo
                            ? html`<img
                                  class="poster-img"
                                  src=${info.poster || item.logo}
                                  alt=""
                                  onError=${function (event) {
                                      event.target.style.display = "none"
                                  }}
                              />`
                            : null
                    }
                </div>
            </div>
        </section>`
    }
})()
