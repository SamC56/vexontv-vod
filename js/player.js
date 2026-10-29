var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

App.player = (function () {
    // Reading webapis.avplay can throw when the privilege was not granted: probe defensively.
    function avplay() {
        try {
            return typeof webapis !== "undefined" && webapis.avplay ? webapis.avplay : null
        } catch {
            return null
        }
    }
    let video = null
    let surface = null
    let handlers = {}
    let startTimer = null

    // A stream that never answers sends no error event; give up after this.
    const START_TIMEOUT_MS = 12000

    // AVPlay reports PLAYER_ERROR_* codes; the viewer needs words.
    const REASONS = {
        PLAYER_ERROR_CONNECTION_FAILED: "No connection to the channel",
        PLAYER_ERROR_TIMEOUT: "The channel took too long to answer",
        PLAYER_ERROR_NOT_SUPPORTED_FORMAT: "This TV cannot play that format",
        PLAYER_ERROR_INVALID_URI: "The channel address is not valid",
        PLAYER_ERROR_NOT_AVAILABLE: "The channel is not available right now",
        PLAYER_ERROR_STREAMING_FAILED: "The channel stopped the stream",
    }

    function describe(error) {
        if (!error) return "Could not open the channel"
        if (error.name && REASONS[error.name]) return REASONS[error.name]
        if (error.message) return error.message
        if (typeof error === "string") return error
        return "Could not open the channel"
    }

    let resizeBound = false

    function init(videoEl, callbacks) {
        video = videoEl
        handlers = callbacks || {}
        if (!resizeBound) {
            window.addEventListener("resize", resize)
            resizeBound = true
        }
    }

    function hardware() {
        return !!avplay()
    }

    function resize() {
        if (avplay()) setRect()
    }

    let lastRect = null

    function clearRect() {
        lastRect = null
    }

    // AVPlay measures the display rect in the TV's 1920x1080 grid, whatever the viewport.
    function setRect(rect) {
        if (rect) lastRect = rect
        if (!surface) surface = document.getElementById("avPlayer")
        const area =
            lastRect && lastRect.w > 2 && lastRect.h > 2
                ? lastRect
                : { x: 0, y: 0, w: 1920, h: 1080 }
        avplay().setDisplayRect(
            Math.round(area.x),
            Math.round(area.y),
            Math.round(area.w),
            Math.round(area.h),
        )
    }

    function state() {
        const AV = avplay()
        if (AV) {
            try {
                return AV.getState()
            } catch {
                return "IDLE"
            }
        }
        if (!video || !video.src) return "IDLE"
        return video.paused ? "PAUSED" : "PLAYING"
    }

    function clearStart() {
        if (startTimer) {
            clearTimeout(startTimer)
            startTimer = null
        }
    }

    // Without the <object type="application/avplayer"> surface it plays audio and paints nothing.
    function checkSurface() {
        if (!avplay()) return true
        if (!surface) surface = document.getElementById("avPlayer")
        if (!surface)
            console.error(
                'AVPlay sin <object type="application/avplayer">: se oira pero no se vera',
            )
        return !!surface
    }

    function fail(error) {
        clearStart()
        console.error("playback error:", error)
        if (handlers.onError) handlers.onError(describe(error))
    }

    function started() {
        clearStart()
        if (handlers.onStart) handlers.onStart()
    }

    function waitForStart() {
        clearStart()
        startTimer = setTimeout(() => {
            startTimer = null
            fail({ message: "The channel is not responding" })
        }, START_TIMEOUT_MS)
    }

    function clearVideo() {
        if (!video) return
        video.removeAttribute("src")
        try {
            video.load()
        } catch {}
    }

    function stop() {
        clearStart()
        const AV = avplay()
        if (AV) {
            try {
                if (state() === "PLAYING" || state() === "PAUSED") AV.stop()
            } catch {}
            try {
                AV.close()
            } catch {}
        }
        clearVideo()
    }

    // Fallback for environments without AVPlay: emulator, browser, Public install.
    function playWithVideo(url, start) {
        if (!video) {
            fail(new Error("No player available"))
            return
        }
        video.src = url
        video.addEventListener(
            "error",
            () => {
                fail(new Error("Could not play the channel"))
            },
            { once: true },
        )
        video.addEventListener(
            "ended",
            () => {
                if (handlers.onEnd) handlers.onEnd()
            },
            { once: true },
        )
        if (start > 0) {
            video.addEventListener(
                "loadedmetadata",
                () => {
                    try {
                        video.currentTime = start
                    } catch {}
                },
                { once: true },
            )
        }
        waitForStart()
        video.play().then(started).catch(fail)
    }

    // options.start: seconds to open a film or an episode at, where it was left.
    function play(url, rect, options) {
        stop()
        if (!url) return
        const start = (options && options.start) || 0
        lastRect = rect || null
        if (!rect) clearRect()

        setTimeout(started, 4000)

        const AV = avplay()
        if (AV) {
            checkSurface()
            try {
                AV.open(url)
                setRect()
                AV.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX")
                AV.setListener({
                    onerror: function (error) {
                        fail(error)
                    },
                    onbufferingcomplete: function () {
                        started()
                    },
                    oncurrentplaytime: function () {
                        started()
                    },
                    onstreamcompleted: function () {
                        if (handlers.onEnd) handlers.onEnd()
                    },
                    // AVPlay decodes embedded subtitles but does not draw them: the text
                    // comes here and the page shows it for the given milliseconds.
                    onsubtitlechange: function (duration, text) {
                        if (handlers.onSubtitle) handlers.onSubtitle(text, Number(duration))
                    },
                })
                waitForStart()
                AV.prepareAsync(
                    () => {
                        function begin() {
                            AV.play()
                            started()
                        }
                        if (!(start > 0)) return begin()
                        try {
                            AV.seekTo(Math.round(start * 1000), begin, begin)
                        } catch {
                            begin()
                        }
                    },
                    (error) => {
                        fail(error)
                    },
                )
                return
            } catch (error) {
                console.error("AVPlay no disponible, se usa <video>:", error)
            }
        }

        playWithVideo(url, start)
    }

    // Seconds, from either engine. A live stream or nothing open reads 0.
    function position() {
        const AV = avplay()
        if (AV) {
            try {
                return (AV.getCurrentTime() || 0) / 1000
            } catch {
                return 0
            }
        }
        return video && video.src ? video.currentTime || 0 : 0
    }

    function duration() {
        const AV = avplay()
        if (AV) {
            try {
                const ms = AV.getDuration()
                return ms > 0 ? ms / 1000 : 0
            } catch {
                return 0
            }
        }
        return video && video.src && isFinite(video.duration) ? video.duration : 0
    }

    function trackInfo(raw) {
        try {
            return typeof raw === "string" ? JSON.parse(raw) : raw || {}
        } catch {
            return {}
        }
    }

    // The audio and subtitle tracks of what is open, and which ones are on. Only AVPlay
    // reports them; anywhere else the lists are empty.
    function tracks() {
        const out = { audio: [], text: [], audioIndex: null, textIndex: null }
        const AV = avplay()
        if (!AV) return out
        try {
            ;(AV.getTotalTrackInfo() || []).forEach((track) => {
                const info = trackInfo(track.extra_info)
                const lang = info.language || info.track_lang || ""
                if (track.type === "AUDIO")
                    out.audio.push({ index: track.index, lang, codec: info.fourCC || "" })
                else if (track.type === "TEXT") out.text.push({ index: track.index, lang })
            })
            ;(AV.getCurrentStreamInfo() || []).forEach((track) => {
                if (track.type === "AUDIO") out.audioIndex = track.index
                else if (track.type === "TEXT") out.textIndex = track.index
            })
        } catch {}
        return out
    }

    function selectTrack(type, index) {
        const AV = avplay()
        if (!AV) return false
        try {
            AV.setSelectTrack(type, index)
            return true
        } catch {
            return false
        }
    }

    function silenceSubtitles(silent) {
        const AV = avplay()
        if (!AV) return
        try {
            AV.setSilentSubtitle(!!silent)
        } catch {}
    }

    // AVPlay seeks asynchronously over HTTP and is slow: callers ask once per landing point.
    function seekTo(seconds) {
        const target = Math.max(0, seconds || 0)
        const AV = avplay()
        if (AV) {
            try {
                AV.seekTo(
                    Math.round(target * 1000),
                    () => {},
                    (error) => {
                        console.error("seek failed:", error)
                    },
                )
            } catch (error) {
                console.error("seek failed:", error)
            }
            return
        }
        if (video && video.src) {
            try {
                video.currentTime = target
            } catch {}
        }
    }

    function toggle() {
        const AV = avplay()
        if (AV) {
            const current = state()
            if (current === "PLAYING") {
                AV.pause()
                return "PAUSED"
            }
            if (current === "PAUSED") {
                AV.play()
                return "PLAYING"
            }
            return current
        }
        if (!video || !video.src) return "IDLE"
        if (video.paused) {
            video.play().catch(fail)
            return "PLAYING"
        }
        video.pause()
        return "PAUSED"
    }

    return {
        init,
        play,
        stop,
        toggle,
        position,
        duration,
        seekTo,
        tracks,
        selectTrack,
        silenceSubtitles,
        state,
        clearRect,
        resize,
        describe,
        hardware,
    }
})()
