// ZCredit theme: light / dark.
// Loaded in <head> so the right theme is applied before the page paints (no flash).
// Uses the person's saved choice if there is one, otherwise follows the device setting.
(function () {
  var KEY = "zcredit-theme";
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function stored() {
    try { var v = localStorage.getItem(KEY); return v === "dark" || v === "light" ? v : null; }
    catch (e) { return null; }
  }
  function resolve() { return stored() || (mq && mq.matches ? "dark" : "light"); }
  function apply(theme) {
    root.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#151a21" : "#ffffff");
  }

  apply(resolve());

  window.toggleTheme = function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, next); } catch (e) {}
    apply(next);
  };

  // If the person never picked a theme, keep following the device setting live.
  if (mq && mq.addEventListener) {
    mq.addEventListener("change", function () { if (!stored()) apply(resolve()); });
  }
})();
