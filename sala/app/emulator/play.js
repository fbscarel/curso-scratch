/*
 * The game page: it configures EmulatorJS from the JSON block of play.html and
 * tells the site (window.parent) what is happening.
 *
 * There is no inline script in the HTML: the page needs a CSP without
 * 'unsafe-inline' in script-src, and this is where the settings and the warnings
 * live -- a file served by /emulador/play.js. The messages are for the site
 * only; the game screen is what decides what to show.
 */
(function () {
  'use strict';

  // How long the emulator may take to load, and then to actually run. A slow lab
  // PC unpacking an 8 MB core is fine well inside these; a missing file is not.
  var READY_TIMEOUT_MS = 60000;
  var START_TIMEOUT_MS = 180000;

  var send = function (message) {
    try {
      window.parent.postMessage(message, window.location.origin);
    } catch (error) {
      /* no parent (the page opened on its own): nobody to tell */
    }
  };

  var config = {};
  try {
    config = JSON.parse(document.getElementById('sala-game').textContent);
  } catch (error) {
    send({ type: 'sala:error', message: 'Não consegui ler as configurações do jogo.' });
    return;
  }

  // The emulator is not installed (or the ROM does not exist): the page already
  // shows the teacher the message, and the site gets the same error.
  if (config.error) {
    var aviso = document.getElementById('aviso');
    if (aviso) {
      aviso.hidden = false;
      aviso.textContent = config.error;
    }
    send({ type: 'sala:error', message: config.error });
    return;
  }

  window.EJS_player = '#game';
  window.EJS_core = config.core;
  window.EJS_gameUrl = config.gameUrl;
  window.EJS_pathtodata = config.pathtodata;
  window.EJS_language = config.language;
  window.EJS_startOnLoaded = true;
  window.EJS_threads = false;
  // No core cache in IndexedDB: every visit reads the files `just
  // sala-emulador` checked, and not an old copy of them.
  window.EJS_disableDatabases = true;
  // No settings kept in the browser either: EmulatorJS hands the core the
  // options below when it loads it (that is what tells MAME to skip its
  // copyright warning), instead of a remembered copy of an older page's.
  window.EJS_disableLocalStorage = true;
  window.EJS_defaultOptions = config.defaultOptions;
  window.EJS_Buttons = config.buttons;
  if (config.controlScheme) {
    window.EJS_controlScheme = config.controlScheme;
  }

  var ready = false;
  var started = false;
  var reported = false;
  var fail = function (message) {
    if (reported || started) {
      return;
    }
    reported = true;
    send({ type: 'sala:error', message: message });
  };

  window.EJS_ready = function () {
    ready = true;
    send({ type: 'sala:ready' });
  };

  // The score of an emulated game lives in the core's savestate: the catalogue
  // says where, and this page reads it once per second while the game runs. A
  // tick that fails (the core is not ready, the state is short) is skipped --
  // never thrown into the page.
  var SCORE_INTERVAL_MS = 1000;
  var scoreTimer = null;
  var readScore = function () {
    try {
      var state = window.EJS_emulator.gameManager.getState();
      var decoded = window.SalaScore.decode(state, config.score);
      if (decoded) {
        send({ type: 'sala:score', inGame: decoded.inGame, score: decoded.score });
      }
    } catch (error) {
      /* nothing to read yet: the next tick tries again */
    }
  };

  // Leaving the page tears the emulator down; the timer goes with it.
  window.addEventListener('pagehide', function () {
    if (scoreTimer !== null) {
      window.clearInterval(scoreTimer);
      scoreTimer = null;
    }
  });

  window.EJS_onGameStart = function () {
    started = true;
    send({ type: 'sala:started' });
    if (config.score) {
      // A second start (the game restarting) must not leave the first tick's
      // timer running: one timer, whatever the runtime calls here.
      window.clearInterval(scoreTimer);
      scoreTimer = window.setInterval(readScore, SCORE_INTERVAL_MS);
    }
  };

  // Nothing here talks to the internet, so "nothing happened" is a failure we
  // can time out on. A blanket window 'error'/'unhandledrejection' listener is
  // not an option: on a page opened as localhost EmulatorJS probes its CDN for a
  // version file (blocked by this page's own CSP) and the rejection would be
  // reported as a broken game.
  window.setTimeout(function () {
    if (!ready) {
      fail('Não consegui iniciar o emulador.');
    }
  }, READY_TIMEOUT_MS);
  window.setTimeout(function () {
    if (!started) {
      fail('O jogo não começou: confira a ROM e o emulador.');
    }
  }, START_TIMEOUT_MS);

  var loader = document.createElement('script');
  loader.src = config.pathtodata + 'loader.js';
  document.body.appendChild(loader);
})();
