/* The journeys viewer's presentation script (cat-harness-tools
   scripts/journeys/present.ts). Dependency-free. Every page is complete
   without it; it adds what a facilitator does in a room:
   - ← / PageUp and → / PageDown: the previous and next moment (the page's
     <link rel="prev|next">);
   - W: reveal the "What if…"; T: show or hide what is under the hood;
   - presenter mode: the presenter's note and the facilitator cue, on or off,
     remembered in this browser;
   - the gap strip's answers, remembered in this browser only;
   - zoom on a BPMN drawing;
   - an old VaxLink address (#/walkthrough/J3b) opens that moment. */
(function () {
  "use strict";
  var doc = document;
  var root = doc.documentElement;

  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (_e) {
      return null;
    }
    return null;
  }
  function each(sel, fn) {
    Array.prototype.forEach.call(doc.querySelectorAll(sel), fn);
  }
  function linkHref(rel) {
    var l = doc.querySelector('link[rel="' + rel + '"]');
    return l ? l.getAttribute("href") : null;
  }

  function setPresenter(on) {
    root.setAttribute("data-presenter", on ? "on" : "off");
    store("jp:presenter", on ? "on" : "off");
  }

  function toggleWhatIf() {
    each("[data-jp-whatif]", function (s) {
      s.classList.toggle("is-open");
    });
  }

  function setHood(show) {
    var hood = doc.querySelector("[data-jp-hood]");
    var btn = doc.querySelector("[data-jp-hood-toggle]");
    if (!hood || !btn) return;
    hood.hidden = !show;
    btn.classList.toggle("is-on", show);
    btn.setAttribute("aria-expanded", String(show));
    store("jp:hood", show ? "on" : "off");
  }

  function zoom(box) {
    var fig = box.querySelector(".jv-bpmn");
    if (!fig) return;
    Array.prototype.forEach.call(box.querySelectorAll("[data-jp-zoom]"), function (b) {
      b.addEventListener("click", function () {
        var z = b.getAttribute("data-jp-zoom");
        if (z === "full") {
          if (fig.requestFullscreen) fig.requestFullscreen();
          return;
        }
        Array.prototype.forEach.call(box.querySelectorAll("[data-jp-zoom]"), function (x) {
          x.classList.toggle("is-on", x === b);
        });
        fig.classList.toggle("is-fit", z === "fit");
        if (z !== "fit") fig.style.setProperty("--z", z);
      });
    });
  }

  function remember(input) {
    var key = "jv:" + input.name;
    if (store(key) === input.value) input.checked = true;
    input.addEventListener("change", function () {
      if (input.checked) store(key, input.value);
    });
  }

  function oldAddress() {
    var m = /^#\/walkthrough\/([^/]+)$/.exec(location.hash);
    if (m && doc.body.classList.contains("jp-overview")) location.replace("../walkthrough/" + m[1] + "/");
  }

  function init() {
    oldAddress();
    each("[data-jp-presenter]", function (b) {
      b.addEventListener("click", function () {
        setPresenter(root.getAttribute("data-presenter") !== "on");
      });
    });
    each("[data-jp-dismiss]", function (b) {
      b.addEventListener("click", function () {
        setPresenter(false);
      });
    });
    each("[data-jp-reveal]", function (b) {
      b.addEventListener("click", function () {
        b.closest("[data-jp-whatif]").classList.add("is-open");
      });
    });
    each("[data-jp-hood-toggle]", function (b) {
      b.addEventListener("click", function () {
        setHood(!b.classList.contains("is-on"));
      });
    });
    if (store("jp:hood") === "off") setHood(false);
    each(".jp-proc", zoom);
    each("input[data-jv-store]", remember);
    doc.addEventListener("keydown", function (ev) {
      var t = ev.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      var go = null;
      if (ev.key === "ArrowRight" || ev.key === "PageDown") go = linkHref("next");
      else if (ev.key === "ArrowLeft" || ev.key === "PageUp") go = linkHref("prev");
      else if (ev.key === "w" || ev.key === "W") toggleWhatIf();
      else if (ev.key === "t" || ev.key === "T") {
        var b = doc.querySelector("[data-jp-hood-toggle]");
        if (b) setHood(!b.classList.contains("is-on"));
      }
      if (go) {
        ev.preventDefault();
        location.href = go;
      }
    });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
