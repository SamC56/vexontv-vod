var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

App.uiScreens = App.uiScreens || {}

;(function () {
    const kit = App.uiKit
    const store = App.store
    const vod = App.vod
    const html = kit.html

    function hideBroken(event) {
        event.target.style.display = "none"
    }

    function seasonName(season, only) {
        if (season.number) return `Season ${season.number}`
        return only ? "Episodes" : "Specials"
    }

    function EpisodeRow(props) {
        const episode = props.episode
        const progress = vod.progressOf(episode)
        const ratio = progress && progress.dur > 0 ? Math.min(1, progress.pos / progress.dur) : 0
        const runtime = vod.formatRuntime(episode.duration || (progress && progress.dur))
        let time = runtime
        if (progress && progress.done) time = `✓ ${runtime}`.trim()
        else if (progress && progress.dur > progress.pos && ratio > 0)
            time = `${vod.formatRuntime(progress.dur - progress.pos)} left`
        return html`<div
            class="row episode"
            data-key=${vod.keyOf(episode)}
            tabindex="-1"
            onClick=${function () {
                vod.playEpisode(episode, false)
            }}
        >
            <span class="num">${episode.episode || props.index + 1}</span>
            <span class="episode-thumb">
                ${
                    episode.logo
                        ? html`<img
                              class="poster-img"
                              src=${episode.logo}
                              alt=""
                              loading="lazy"
                              onError=${hideBroken}
                          />`
                        : null
                }
                ${
                    ratio > 0 && !(progress && progress.done)
                        ? html`<span class="poster-progress"
                              ><span
                                  class="poster-progress-fill"
                                  style=${`width:${Math.round(ratio * 100)}%`}
                              ></span
                          ></span>`
                        : null
                }
            </span>
            <span class="row-main">
                <span class="row-name">${episode.title || vod.episodeLabel(episode)}</span>
                ${episode.plot ? html`<span class="row-sub episode-plot">${episode.plot}</span>` : null}
            </span>
            <span class=${`episode-time${progress && progress.done ? " done" : ""}`}>${time}</span>
        </div>`
    }

    // A show: its seasons on the left, the chosen season's episodes on the right. It opens on
    // the episode to watch next.
    App.uiScreens.show = function Show() {
        const show = vod.ui.title
        if (!show) return null
        const details = vod.ui.details
        const info = details || {}
        const seasons = info.seasons || []
        const current =
            seasons.filter((season) => {
                return season.number === vod.ui.season
            })[0] || seasons[0]
        const next = vod.nextToWatch(seasons)
        const resume = next ? vod.resumePoint(next) : 0
        const rating = info.rating || show.rating
        const numbered = seasons.filter((season) => {
            return season.number
        }).length
        const backdrop = info.backdrop || info.poster || show.logo
        const episodes = seasons.reduce((sum, season) => {
            return sum + season.episodes.length
        }, 0)

        let plot = info.plot || show.plot || ""
        if (!plot && !details) plot = "Loading episodes…"

        let empty = ""
        if (!details) empty = "Loading episodes…"
        else if (!seasons.length)
            empty = vod.ui.detailsError || "The panel lists no episodes for this show."

        return html`<section class="screen title-screen show-screen" id="screen-show">
            <div class="title-backdrop" style=${kit.logoStyle(backdrop)} aria-hidden="true"></div>
            <div class="show-head">
                <div class="show-poster">
                    <span class="poster-letter">${kit.initial(show.name)}</span>
                    ${
                        info.poster || show.logo
                            ? html`<img
                                  class="poster-img"
                                  src=${info.poster || show.logo}
                                  alt=""
                                  onError=${hideBroken}
                              />`
                            : null
                    }
                </div>
                <div class="show-info">
                    <p class="title-kicker">Series · ${show.group || ""}</p>
                    <h1 class="title-name show-name" id="showName">${show.name}</h1>
                    <p class="title-chips">
                        ${rating ? html`<span class="chip-rating">★ ${rating.toFixed(1)}</span>` : null}
                        ${show.year ? html`<span>${show.year}</span>` : null}
                        ${numbered ? html`<span>${numbered === 1 ? "1 season" : `${numbered} seasons`}</span>` : null}
                        ${info.genre ? html`<span>${info.genre}</span>` : null}
                    </p>
                    <p class=${`title-plot show-plot${details ? "" : " dim"}`} id="showPlot">
                        ${plot}
                    </p>
                    <div class="actions title-actions" id="showActions">
                        ${
                            next
                                ? html`<button
                                      class="btn primary"
                                      id="showPlay"
                                      tabindex="-1"
                                      onClick=${function () {
                                          vod.playEpisode(next, false)
                                      }}
                                  >
                                      ${resume ? "Resume" : "Play"} ${vod.episodeLabel(next)}
                                  </button>`
                                : html`<button class="btn" id="showPlay" tabindex="-1">
                                      ${details ? "Nothing to play" : "Loading…"}
                                  </button>`
                        }
                        ${
                            episodes > 1
                                ? html`<button
                                      class="btn"
                                      id="showRandom"
                                      tabindex="-1"
                                      onClick=${function () {
                                          vod.playRandom()
                                      }}
                                  >
                                      Play random
                                  </button>`
                                : null
                        }
                        <button
                            class=${`btn${vod.isFavorite(show) ? " saved" : ""}`}
                            id="showFav"
                            tabindex="-1"
                            onClick=${function () {
                                const added = vod.toggleFavorite(show)
                                store.notify(
                                    added ? "Added to favourites" : "Removed from favourites",
                                )
                            }}
                        >
                            ${vod.isFavorite(show) ? "Remove from favourites" : "Add to favourites"}
                        </button>
                        ${
                            vod.hasProgress(show)
                                ? html`<button
                                      class="btn"
                                      id="showForget"
                                      tabindex="-1"
                                      onClick=${function () {
                                          vod.confirmForget(show, "showActions")
                                      }}
                                  >
                                      Remove from Continue watching
                                  </button>`
                                : null
                        }
                    </div>
                </div>
            </div>
            <div class="show-body">
                <div class="browse-cats" id="showSeasons">
                    ${seasons.map((season) => {
                        const watched = season.episodes.filter((episode) => {
                            const entry = vod.progressOf(episode)
                            return entry && entry.done
                        }).length
                        const all = watched === season.episodes.length
                        return html`<button
                            class=${`row tvcat season${season === current ? " selected" : ""}`}
                            data-season=${season.number}
                            tabindex="-1"
                            onClick=${function () {
                                vod.selectSeason(season.number)
                            }}
                        >
                            <span class="row-main">
                                <span class="row-name"
                                    >${seasonName(season, seasons.length === 1)}</span
                                >
                            </span>
                            <span class="row-count"
                                >${store.formatCount(season.episodes.length)}${all ? " ✓" : ""}</span
                            >
                        </button>`
                    })}
                </div>
                <div class="rows show-episodes" id="showEpisodes">
                    ${empty ? html`<p class="empty">${empty}</p>` : null}
                    ${
                        current && current.episodes.length
                            ? html`<p class="show-hint" id="showHint">
                                  <span class="ov-key">RED</span>on an episode marks it watched or
                                  unwatched
                              </p>`
                            : null
                    }
                    ${
                        current
                            ? current.episodes.map((episode, index) => {
                                  return html`<${EpisodeRow}
                                      key=${vod.keyOf(episode)}
                                      episode=${episode}
                                      index=${index}
                                  />`
                              })
                            : null
                    }
                </div>
            </div>
        </section>`
    }
})()
