var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

App.uiScreens = App.uiScreens || {}

;(function () {
    const kit = App.uiKit
    const vod = App.vod
    const player = App.player
    const html = kit.html
    const useState = kit.useState
    const useEffect = kit.useEffect
    const useRef = kit.useRef
    const TRACKS_MS = 300

    // Films and episodes: the same video plane as live, with a seek bar instead of the guide.
    App.uiScreens.vodPlayer = function VodPlayer() {
        const ui = vod.ui
        const playing = ui.playing
        const videoRef = useRef(null)
        const timeState = useState({ position: 0, duration: 0 })
        const time = timeState[0]
        const setTime = timeState[1]
        const statusState = useState("opening")
        const status = statusState[0]
        const setStatus = statusState[1]

        useEffect(() => {
            player.init(videoRef.current, {
                onStart: function () {
                    setStatus("playing")
                    // Not from inside the open: rendering there makes Preact run the open
                    // again, and AVPlay fills its track list a moment after playing anyway.
                    setTimeout(() => {
                        vod.tracksReady()
                    }, TRACKS_MS)
                },
                onSubtitle: function (text, duration) {
                    vod.showSubtitle(text, duration)
                },
                onError: function (message) {
                    vod.playFailed(message)
                },
                onEnd: function () {
                    vod.playEnded()
                },
            })
            document.body.classList.add("playing")
            return function () {
                document.body.classList.remove("playing")
                player.stop()
            }
        }, [])

        useEffect(() => {
            if (!playing || !playing.ready) return
            setStatus("opening")
            player.play(playing.url, null, { start: playing.start })
        }, [
            playing && playing.url,
            playing && playing.start,
            playing && playing.attempt,
            playing && playing.ready,
        ])

        useEffect(() => {
            const tick = setInterval(() => {
                setTime({ position: player.position(), duration: player.duration() })
                vod.tick()
            }, 1000)
            return function () {
                clearInterval(tick)
            }
        }, [])

        // Any key shows the controls, except Back, which is how they are put away.
        useEffect(() => {
            function pulse(event) {
                if (event.keyCode === App.tv.KEY.BACK || event.keyCode === 27) return
                vod.showOsd()
            }
            document.addEventListener("keydown", pulse)
            vod.showOsd()
            return function () {
                document.removeEventListener("keydown", pulse)
            }
        }, [])

        if (!playing) return null
        const item = playing.item
        const duration = time.duration
        const position = ui.seek ? ui.seek.target : time.position || playing.start || 0
        const ratio = duration > 0 ? Math.min(1, position / duration) : 0
        const visible = (ui.osd || ui.paused || !!ui.seek || ui.menu) && !ui.error
        const legend = ui.seek
            ? [
                  ["LEFT/RIGHT", "move the mark"],
                  ["OK", "jump there"],
                  ["BACK", "stay where you are"],
              ]
            : [
                  ["LEFT/RIGHT", "choose where to jump, hold to go faster"],
                  ["OK", ui.paused ? "play" : "pause"],
                  ["DOWN", "audio and subtitles"],
                  ["BACK", "hide this, again to leave where you are"],
              ]

        return html`<section
            class=${`screen player vod-player${player.hardware() ? " hw" : ""}`}
            id="screen-vodplayer"
        >
            <video id="videoPlayer" ref=${videoRef} playsinline></video>
            <object
                class="av-surface"
                id="avPlayer"
                type="application/avplayer"
                width="1920"
                height="1080"
            ></object>
            ${
                status === "opening" && !ui.error
                    ? html`<div class="player-status" id="vodStatus">
                          <div class="spinner"></div>
                          <p class="player-status-text">
                              ${playing.start ? `Resuming “${item.name}”…` : `Opening “${item.name}”…`}
                          </p>
                      </div>`
                    : null
            }
            ${
                ui.error
                    ? html`<div class="player-error" id="vodError">
                          <div class="play-card">
                              <p class="play-why" id="vodErrorWhy">${ui.error}</p>
                              <h1 class="play-name">${item.name}</h1>
                              <p class="play-hint">
                                  Your provider may allow one stream at a time: stop it on other
                                  devices, then retry.
                              </p>
                              <div class="play-actions">
                                  <button
                                      class="btn primary"
                                      id="vodRetry"
                                      tabindex="-1"
                                      onClick=${function () {
                                          vod.retry()
                                      }}
                                  >
                                      Retry
                                  </button>
                                  <button
                                      class="btn"
                                      id="vodClose"
                                      tabindex="-1"
                                      onClick=${function () {
                                          vod.exitPlayer()
                                      }}
                                  >
                                      Back
                                  </button>
                              </div>
                          </div>
                      </div>`
                    : null
            }
            ${
                ui.subtitle
                    ? html`<p class=${`vod-subtitle${visible ? " raised" : ""}`} id="vodSubtitle">
                          ${ui.subtitle.split("\n").map((line, index) => {
                              return html`<span class="vod-subtitle-line" key=${index}
                                  >${line}</span
                              >`
                          })}
                      </p>`
                    : null
            }
            <div class=${`overlay vod-osd${visible ? " visible" : ""}`} id="vodOsd">
                <div class="vod-osd-title">
                    <h1 id="vodName">${item.name}</h1>
                    <p class="ov-group">${[item.year, item.group].filter(Boolean).join(" · ")}</p>
                </div>
                <div class="vod-track" id="vodTrack">
                    <span class="vod-track-fill" style=${`width:${ratio * 100}%`}></span>
                    <span class="vod-knob" style=${`left:${ratio * 100}%`}></span>
                    ${
                        ui.seek
                            ? html`<span
                                  class="vod-seek-tip"
                                  id="vodSeekTip"
                                  style=${`left:clamp(48px, ${ratio * 100}%, calc(100% - 48px))`}
                                  >${vod.formatTime(ui.seek.target)}</span
                              >`
                            : null
                    }
                </div>
                <p class="vod-times">
                    <span id="vodPosition">${vod.formatTime(position)}</span>
                    <span id="vodRemaining"
                        >${duration > 0 ? `−${vod.formatTime(duration - position)} · ${vod.formatTime(duration)}` : ""}</span
                    >
                </p>
                <div class="vod-osd-foot">
                    <p class="ov-keys" id="vodKeys">
                        ${legend.map((pair) => {
                            return html`<span class="ov-key" key=${pair[0]}>${pair[0]}</span
                                ><span key=${`${pair[0]}-what`}>${pair[1]}</span>`
                        })}
                    </p>
                    <div class="vod-menu" id="vodMenu">
                        <button
                            class="btn vod-menu-btn"
                            id="vodAudioBtn"
                            tabindex="-1"
                            onClick=${function () {
                                vod.openTracks("audio")
                            }}
                        >
                            Audio: ${vod.trackLabel("audio")}
                        </button>
                        <button
                            class="btn vod-menu-btn"
                            id="vodTextBtn"
                            tabindex="-1"
                            onClick=${function () {
                                vod.openTracks("text")
                            }}
                        >
                            Subtitles: ${vod.trackLabel("text")}
                        </button>
                    </div>
                </div>
                ${ui.paused ? html`<p class="vod-paused" id="vodPaused">Paused</p>` : null}
            </div>
            ${
                ui.trackMenu
                    ? html`<div class="vod-tracks" id="vodTracks">
                          <p class="vod-tracks-title">
                              ${ui.trackMenu === "audio" ? "Audio" : "Subtitles"}
                          </p>
                          <div class="vod-tracks-list">
                              ${
                                  vod.trackOptions(ui.trackMenu).length
                                      ? null
                                      : html`<p class="empty">This title reports no tracks.</p>`
                              }
                              ${vod.trackOptions(ui.trackMenu).map((option) => {
                                  return html`<button
                                      class=${`row vod-track-opt${option.selected ? " selected" : ""}`}
                                      key=${option.index}
                                      tabindex="-1"
                                      onClick=${function () {
                                          vod.pickTrack(ui.trackMenu, option.index)
                                      }}
                                  >
                                      <span class="row-name">${option.label}</span>
                                      ${option.selected ? html`<span class="saved">✓</span>` : null}
                                  </button>`
                              })}
                          </div>
                      </div>`
                    : null
            }
        </section>`
    }
})()
