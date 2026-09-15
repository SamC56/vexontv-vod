var App = App || {};

// Playback goes through Samsung's AVPlay when the TV exposes it: HLS and
// MPEG-TS are decoded in hardware there. The <video> element is only the
// fallback for environments without webapis.avplay (emulator, browser).
App.player = (function () {
    // Reading webapis.avplay can throw when the privilege was not granted (the
    // package then installs as Public but still calls nothing): a throw here
    // would take the whole app down, so it is probed defensively.
    var AVPLAY = null;
    try {
        if (typeof webapis !== 'undefined' && webapis.avplay) AVPLAY = webapis.avplay;
    } catch (error) {
        AVPLAY = null;
    }
    var video = null;
    var handlers = {};
    var startTimer = null;

    // Cuanto se espera a que el canal empiece antes de darlo por muerto. Un
    // stream que no responde no da error: se queda abriendo para siempre.
    var START_TIMEOUT_MS = 12000;

    // Los errores de AVPlay no traen texto util (son PLAYER_ERROR_*), asi que se
    // traducen: el usuario tiene que poder leer por que no se ve.
    var REASONS = {
        PLAYER_ERROR_CONNECTION_FAILED: 'No connection to the channel',
        PLAYER_ERROR_TIMEOUT: 'The channel took too long to answer',
        PLAYER_ERROR_NOT_SUPPORTED_FORMAT: 'This TV cannot play that format',
        PLAYER_ERROR_INVALID_URI: 'The channel address is not valid',
        PLAYER_ERROR_NOT_AVAILABLE: 'The channel is not available right now',
        PLAYER_ERROR_STREAMING_FAILED: 'The channel stopped the stream'
    };

    function describe(error) {
        if (!error) return 'Could not open the channel';
        if (error.name && REASONS[error.name]) return REASONS[error.name];
        if (error.message) return error.message;
        if (typeof error === 'string') return error;
        return 'Could not open the channel';
    }

    var resizeBound = false;

    function init(videoEl, callbacks) {
        video = videoEl;
        handlers = callbacks || {};
        if (!resizeBound) {
            window.addEventListener('resize', resize);
            resizeBound = true;
        }
    }

    function hardware() { return !!AVPLAY; }

    function resize() {
        if (AVPLAY) setRect();
    }

    function setRect() {
        AVPLAY.setDisplayRect(0, 0, window.innerWidth, window.innerHeight);
    }

    function state() {
        if (AVPLAY) {
            try { return AVPLAY.getState(); } catch (error) { return 'IDLE'; }
        }
        if (!video || !video.src) return 'IDLE';
        return video.paused ? 'PAUSED' : 'PLAYING';
    }

    function clearStart() {
        if (startTimer) {
            clearTimeout(startTimer);
            startTimer = null;
        }
    }

    function fail(error) {
        clearStart();
        console.error('playback error:', error);
        if (handlers.onError) handlers.onError(describe(error));
    }

    function started() {
        clearStart();
        if (handlers.onStart) handlers.onStart();
    }

    // Si en START_TIMEOUT_MS no ha arrancado ni ha fallado, se trata como fallo:
    // es lo que convierte una pantalla negra muda en un boton de reintentar.
    function waitForStart() {
        clearStart();
        startTimer = setTimeout(function () {
            startTimer = null;
            fail({ message: 'The channel is not responding' });
        }, START_TIMEOUT_MS);
    }

    function clearVideo() {
        if (!video) return;
        video.removeAttribute('src');
        try { video.load(); } catch (error) { /* not attached to a source */ }
    }

    function stop() {
        clearStart();
        if (AVPLAY) {
            try {
                if (state() === 'PLAYING' || state() === 'PAUSED') AVPLAY.stop();
            } catch (error) { /* nothing playing */ }
            try { AVPLAY.close(); } catch (error) { /* already closed */ }
        }
        clearVideo();
    }

    function play(url) {
        stop();
        if (!url) return;

        if (AVPLAY) {
            try {
                AVPLAY.open(url);
                setRect();
                // Letterbox: 4:3 channels keep their shape instead of stretching.
                AVPLAY.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
                AVPLAY.setListener({
                    onerror: function (error) { fail(error); },
                    onstreamcompleted: function () { if (handlers.onEnd) handlers.onEnd(); }
                });
                waitForStart();
                AVPLAY.prepareAsync(function () {
                    AVPLAY.play();
                    started();
                }, function (error) { fail(error); });
                return;
            } catch (error) {
                fail(error);
                return;
            }
        }

        video.src = url;
        video.addEventListener('error', function () { fail(new Error('Could not play the channel')); }, { once: true });
        waitForStart();
        video.play().then(started).catch(fail);
    }

    function toggle() {
        if (AVPLAY) {
            var current = state();
            if (current === 'PLAYING') { AVPLAY.pause(); return 'PAUSED'; }
            if (current === 'PAUSED') { AVPLAY.play(); return 'PLAYING'; }
            return current;
        }
        if (!video || !video.src) return 'IDLE';
        if (video.paused) { video.play().catch(fail); return 'PLAYING'; }
        video.pause();
        return 'PAUSED';
    }

    return {
        init: init,
        play: play,
        stop: stop,
        toggle: toggle,
        state: state,
        resize: resize,
        describe: describe,
        hardware: hardware
    };
})();
