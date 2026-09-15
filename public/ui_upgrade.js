/* v4: theme quick-cycler (visible one-click demo of 5 palettes) */
(function () {
  function boot() {
    var b = document.createElement("button");
    b.id = "themeCycle"; b.textContent = "\u25C7 THEME";
    b.onclick = function () {
      var order = ["cobalt","emerald","amber","crimson","monolith"];
      var cur = document.body.className.match(/theme-(\w+)/);
      var i = cur ? order.indexOf(cur[1]) : -1;
      var next = order[(i + 1) % order.length];
      if (typeof setAppTheme === "function") setAppTheme(next);
      b.textContent = "\u25C7 " + next.toUpperCase();
    };
    document.body.appendChild(b);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
