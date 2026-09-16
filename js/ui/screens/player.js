var App = App || {};

// Reproductor: AVPlay (o <video>) con su overlay y su tarjeta de error.

App.uiScreens = App.uiScreens || {};

(function () {
    var kit = App.uiKit;
    var store = App.store;
    var player = App.player;
    var html = kit.html;
    var useState = kit.useState;
    var useEffect = kit.useEffect;
    var useRef = kit.useRef;
    var clock = kit.clock;
    var OVERLAY_MS = 5000;

    App.uiScreens.player = function Player() {
        var state = store.state;
        var videoRef = useRef(null);
        var overlayState = useState(true);
        var overlay = overlayState[0];
        var setOverlay = overlayState[1];
        var timer = useRef(null);

        useEffect(function () {
            player.init(videoRef.current, {
                onStart: function () { store.playStarted(); },
                onError: function (message) { store.playFailed(message); }
            });
            return function () { player.stop(); };
        }, []);

        useEffect(function () {
            if (state.playing) player.play(state.playing.channel.url);
        }, [state.playing]);

        // Mientras se reproduce, la app entera deja de pintar: si el plano de video
        // de AVPlay compone por detras del webview, cualquier capa opaca lo tapa.
        useEffect(function () {
            document.body.classList.add('playing');
            return function () { document.body.classList.remove('playing'); };
        }, []);

        useEffect(function () {
            function pulse() { show(); }
            document.addEventListener('keydown', pulse);
            return function () { document.removeEventListener('keydown', pulse); };
        }, []);

        function show() {
            setOverlay(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(function () { setOverlay(false); }, OVERLAY_MS);
        }

        var channel = state.playing ? state.playing.channel : null;
        if (!channel) return null;
        var saved = store.isFavorite(state.playing.listId, channel.url);
        var program = state.nowProgram;

        return html`<section class=${"screen player" + (player.hardware() ? " hw" : "")} id="screen-player">
            <video id="videoPlayer" ref=${videoRef} playsinline></video>
            <!-- AVPlay no dibuja en el <video>: pinta en un object de este tipo, y sin el
                 se oye el canal pero no se ve. Va despues del video y encima. -->
            <object class="av-surface" id="avPlayer" type="application/avplayer" width="1920" height="1080"></object>
            ${state.playStatus === 'opening' ? html`<div class="player-status" id="playerStatus">
                <div class="spinner"></div>
                <p class="player-status-text">Opening “${channel.name}”…</p>
            </div>` : null}
            ${state.playError ? html`<div class="player-error" id="playError">
                <div class="play-card">
                    <p class="play-why" id="playErrorWhy">${state.playError.message}</p>
                    <h1 class="play-name" id="playErrorName">${channel.name}</h1>
                    <p class="play-hint">You can try again or pick another channel.</p>
                    <div class="play-actions" id="playActions">
                        <button class="btn primary" id="playRetry" tabindex="-1"
                            onClick=${function () { store.retryPlay(); }}>Retry</button>
                        <button class="btn" id="playClose" tabindex="-1"
                            onClick=${function () { store.exitPlayer(); }}>Back</button>
                    </div>
                </div>
            </div>` : null}
            <div class=${'overlay' + (overlay && !state.playError ? ' visible' : '')} id="playerOverlay">
                <div class="ov-info">
                    <p class="ov-live" id="ovLive"><span class="dot"></span>Live<span
                        class="ov-engine" id="ovEngine">${player.hardware() ? 'AVPlay' : 'HTML5'}</span></p>
                    <h1 id="ovName">${channel.name}</h1>
                    <p class="ov-group" id="ovGroup">${channel.group || ''}</p>
                    ${program ? html`<p class="ov-program" id="ovProgram">
                        ${program.title}${program.start ? html`<span class="ov-time">${clock(program.start)} – ${clock(program.end)}</span>` : null}
                    </p>` : null}
                </div>
                <button class=${'btn' + (saved ? ' saved' : '')} id="ovFav" tabindex="-1" onClick=${function () {
                    store.toggleFavorite(channel, state.playing.listId);
                    show();
                }}>${saved ? 'Remove from favorites' : 'Add to favorites'}</button>
            </div>
        </section>`;
    };

})();
