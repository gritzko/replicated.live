//  asciicast.js — mount asciinema players over the nodes `mark` emits for a
//  screencast transclusion.
//
//  StrictMark treats a screencast exactly like a picture: `![alt][l]` with a
//  `.cast` target.  No <img> can render a terminal recording, so mark emits a
//  mount node instead (be/verbs/mark/render.js emitFigure / emitLink):
//
//      ![be todo][c]                 ->  <figure class="asciicast">
//      [c]: /assets/casts/todo.cast        <div data-asciicast="…"></div>
//                                          <figcaption>be todo</figcaption>
//                                        </figure>
//
//  A mid-sentence transclusion mounts into a <span> instead, because a <div>
//  would close the enclosing <p>.  Either way the hook is [data-asciicast].
//
//  A plain LINK to a .cast (`[be todo][c]`, no `!`) is left alone — that is a
//  reference to the recording, not an embed, and stays a download link.
//
//  Loaded with `defer` from html/head.html, after the player bundle — deferred
//  scripts run in document order, so AsciinemaPlayer is defined by the time this
//  runs.  The guard in init() covers the bundle failing to load at all, in which
//  case the page simply shows nothing where the cast would be.

(function () {
  "use strict";

  var THEME = "bw";                         // assets/css/asciicast.css

  function mount(host) {
    var src = host.getAttribute("data-asciicast");
    if (!src) return;
    create(src, host, null);
    posterTime(src, function (npt) {
      if (npt) create(src, host, npt);      // re-create with the still
    });
  }

  function create(src, host, npt) {
    host.innerHTML = "";
    var opts = { theme: THEME, fit: "width", terminalFontSize: "small" };
    if (npt) opts.poster = npt;
    AsciinemaPlayer.create(src, host, opts);
  }

  //  Without a poster the embed is a blank box behind a play button, which
  //  tells a reader nothing.  The obvious default — the final frame — is wrong
  //  for everything on this site: bro and the todo view run on the ALTERNATE
  //  SCREEN, so their last frame is the restored shell prompt, not the TUI.
  //  A fraction of the duration is no better; it is arbitrary, and 0.6 on the
  //  todo cast landed at 12s, just before the TUI first paints at 12.6s.
  //
  //  So pick the frame the recording is ABOUT: the last one still inside the
  //  alternate screen, i.e. the event immediately before the final `ESC[?1049l`.
  //  A cast that never enters the alt screen has no TUI to miss, and there the
  //  final frame IS the result — fall back to it.
  //
  //  Scanning is textual, no JSON parse per line: asciicast v2 is a header line
  //  then one [time, "o", data] array per line, and only ESC is \u-escaped, so
  //  the literal "[?1049l" survives in the raw text.
  var ALT_LEAVE = "[?1049l";

  function eventTime(line) {
    var s = line.trim();
    if (s.charAt(0) !== "[") return NaN;
    return parseFloat(s.slice(1));             // NaN for the header / junk
  }

  function posterTime(src, done) {
    if (typeof fetch !== "function") return done(null);
    fetch(src).then(function (r) {
      return r.ok ? r.text() : null;
    }).then(function (text) {
      if (!text) return done(null);
      var lines = text.split("\n");

      var leave = -1;                          // last alt-screen exit
      for (var i = lines.length - 1; i > 0; i--) {
        if (lines[i].indexOf(ALT_LEAVE) >= 0) { leave = i; break; }
      }

      var at = NaN;
      var from = leave > 0 ? leave - 1 : lines.length - 1;
      for (var j = from; j > 0; j--) {         // nearest event at or before it
        at = eventTime(lines[j]);
        if (at === at) break;                  // at === at rejects NaN
      }
      if (at !== at || at <= 0) return done(null);

      var sec = Math.floor(at);
      done("npt:" + Math.floor(sec / 60) + ":" + ("0" + (sec % 60)).slice(-2));
    }).catch(function () { done(null); });
  }

  function init() {
    if (typeof AsciinemaPlayer === "undefined") return;   // bundle not loaded
    var hosts = document.querySelectorAll("[data-asciicast]");
    for (var i = 0; i < hosts.length; i++) {
      try { mount(hosts[i]); }
      catch (e) { /*  one bad cast must not take the page down  */ }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
