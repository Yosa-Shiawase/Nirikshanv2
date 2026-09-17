/* v5.3 theme quick-cycler — stateful, no regex tricks */
(function () {
  var order = ["cobalt", "emerald", "amber", "crimson", "monolith"];
  var idx = 0;
  function boot() {
    var b = document.createElement("button");
    b.id = "themeCycle";
    b.textContent = "\u25C7 COBALT";
    b.onclick = function () {
      idx = (idx + 1) % order.length;
      if (typeof setAppTheme === "function") setAppTheme(order[idx]);
      b.textContent = "\u25C7 " + order[idx].toUpperCase();
    };
    document.body.appendChild(b);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
