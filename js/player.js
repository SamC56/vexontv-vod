var App = App || {};

// Playback goes through Samsung's AVPlay when the TV exposes it: HLS and
// MPEG-TS are decoded in hardware there. The <video> element is only the
// fallback for environments without webapis.avplay (emulator, browser).
App.player = (function () {
    // Reading webapis.avplay can throw when the privilege was not granted (the
    // package then installs as Public but still calls nothing): a throw here
    // would take the whole app down, so it is probed defensively.
    // Se pregunta a la TV cada vez, no una sola vez al cargar: si webapis.avplay
    // aparece despues (o el privilegio tarda), capturarlo al principio nos dejaba
    // sin AVPlay para siempre y todo caia al <video>.
    function avplay() {
        try {
            return (typeof webapis !== 'undefined' && webapis.avplay) ? webapis.avplay : null;
        } catch (error) {
            return null;
        }
    }
    var video = null;
    var surface = null;
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

    function hardware() { return !!avplay(); }

    function resize() {
        if (avplay()) setRect();
    }


    // La doc de AVPlay es explicita: el rect se mide SIEMPRE en la rejilla de
    // 1920x1080 de la TV, sea cual sea la resolucion o el viewport de la app.
    // Y el style del object tiene que coincidir con este rect (va a pantalla
    // completa por CSS).
    // El rect se mide SIEMPRE en la rejilla de 1920x1080 de la TV, sea cual sea el
    // viewport. Si viene uno degenerado (el preview a medio maquetar), se usa la
    // pantalla entera: una superficie de 0x0 deja solo audio.
    var lastRect = null;

    function clearRect() { lastRect = null; }

    function setRect(rect) {
        if (rect) lastRect = rect;
        if (!surface) surface = document.getElementById('avPlayer');
        var area = lastRect && lastRect.w > 2 && lastRect.h > 2
            ? lastRect
            : { x: 0, y: 0, w: 1920, h: 1080 };
        avplay().setDisplayRect(Math.round(area.x), Math.round(area.y), Math.round(area.w), Math.round(area.h));
    }

    function state() {
        var AV = avplay();
        if (AV) {
            try { return AV.getState(); } catch (error) { return 'IDLE'; }
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

    function checkSurface() {
        if (!avplay()) return true;
        if (!surface) surface = document.getElementById('avPlayer');
        if (!surface) console.error('AVPlay sin <object type="application/avplayer">: se oira pero no se vera');
        return !!surface;
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
        var AV = avplay();
        if (AV) {
            try {
                if (state() === 'PLAYING' || state() === 'PAUSED') AV.stop();
            } catch (error) { /* nothing playing */ }
            try { AV.close(); } catch (error) { /* already closed */ }
        }
        clearVideo();
    }

    // Reserva: el <video> del navegador. Se usa cuando no hay AVPlay o cuando
    // AVPlay esta pero sus llamadas fallan (el privilegio no concedido instala la
    // app como Public, pero webapis.avplay puede seguir ahi y no hacer nada).
    // Modo de visualizacion (fit / cover / fill / auto). Devuelve false si la TV no
    // acepta ese modo, para que el store no lo de por aplicado.
    function setAspect(mode) {
        var AV = avplay();
        if (!AV || !mode) return false;
        try {
            AV.setDisplayMethod(mode);
            return true;
        } catch (error) {
            console.error('AVPlay no acepta el modo ' + mode + ':', error);
            return false;
        }
    }

    function playWithVideo(url) {
        if (!video) { fail(new Error('No player available')); return; }
        video.src = url;
        video.addEventListener('error', function () { fail(new Error('Could not play the channel')); }, { once: true });
        waitForStart();
        video.play().then(started).catch(fail);
    }

    function play(url, mode, rect) {
        stop();
        if (!url) return;
        lastRect = rect || null;
        if (!rect) clearRect();

        // Red de seguridad: si a los 4 s no ha llegado ningun evento, se quita el
        // aviso de "abriendo" igual. Un aviso pegado encima del video (un circulo
        // en medio de la pantalla) es peor que no avisar.
        setTimeout(started, 4000);

        var AV = avplay();
        if (AV) {
            checkSurface();
            try {
                AV.open(url);
                setRect();
                // Letterbox: 4:3 channels keep their shape instead of stretching.
                AV.setDisplayMethod(mode || 'PLAYER_DISPLAY_MODE_LETTER_BOX');
                AV.setListener({
                    onerror: function (error) { fail(error); },
                    // En directo, 'started' tambien por buffering: prepareAsync puede
                    // tardar o no llegar nunca y dejaba el aviso de "abriendo" fijo.
                    onbufferingcomplete: function () { started(); },
                    oncurrentplaytime: function () { started(); },
                    onstreamcompleted: function () { if (handlers.onEnd) handlers.onEnd(); }
                });
                waitForStart();
                AV.prepareAsync(function () {
                    AV.play();
                    started();
                }, function (error) { fail(error); });
                return;
            } catch (error) {
                // AVPlay sin privilegio: se sigue con el <video> en vez de dejar
                // la pantalla en negro.
                console.error('AVPlay no disponible, se usa <video>:', error);
            }
        }

        playWithVideo(url);
    }

    function toggle() {
        var AV = avplay();
        if (AV) {
            var current = state();
            if (current === 'PLAYING') { AV.pause(); return 'PAUSED'; }
            if (current === 'PAUSED') { AV.play(); return 'PLAYING'; }
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
        setAspect: setAspect,
        clearRect: clearRect,
        resize: resize,
        describe: describe,
        hardware: hardware
    };
})();
