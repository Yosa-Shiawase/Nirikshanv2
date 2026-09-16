/* v5 mobile shell: bottom nav + case drawer FAB */
(function () {
  var TABS = [
    ["risk-map", "◎", "MAP"], ["qr", "⚲", "QR"],
    ["alerts", "▲", "ALERTS"], ["entities", "☷", "NET"],
    ["transactions", "⇄", "TRAIL"], ["dashboard", "⊞", "FEED"],
    ["reports", "▤", "RPTS"], ["system", "⚙", "SYS"]
  ];
  function build() {
    var nav = document.createElement("nav");
    nav.id = "mnav";
    TABS.forEach(function (t, idx) {
      var b = document.createElement("button");
      b.innerHTML = "<span class='i'>" + t[1] + "</span><span class='t'>" + t[2] + "</span>";
      b.onclick = function () {
        if (typeof switchTab === "function") switchTab(t[0]);
        Array.prototype.forEach.call(nav.children, function (c) { c.classList.remove("active"); });
        b.classList.add("active");
      };
      if (idx === 0) b.classList.add("active");
      nav.appendChild(b);
    });
    document.body.appendChild(nav);
    var fab = document.createElement("button");
    fab.id = "caseFab"; fab.textContent = "◎";
    fab.title = "Case drawer";
    fab.onclick = function () {
      document.body.classList.toggle("z3-open");
      setTimeout(function () {
        if (typeof map !== "undefined" && map) map.invalidateSize();
      }, 300);
    };
    document.body.appendChild(fab);
    var z3 = document.querySelector(".zone-3");
    if (z3) {
      var top = z3.querySelector(".z3-top");
      if (top) top.addEventListener("click", function () {
        document.body.classList.remove("z3-open");
      });
    }
    window.addEventListener("resize", function () {
      if (typeof map !== "undefined" && map) map.invalidateSize();
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", build);
  else build();
})();

/* v5.1 polish: brand chip, tab attribute, fab label, theme wrap */
(function () {
  function go() {
    document.body.dataset.tab = "risk-map";
    var zt = document.querySelector(".z2-top");
    if (zt && !zt.querySelector(".mbrand")) {
      var b = document.createElement("div");
      b.className = "mbrand";
      b.innerHTML = "<img src='sih.png' alt=''><span>NIRAKSHAN</span>";
      zt.insertBefore(b, zt.firstChild);
    }
    var fab = document.getElementById("caseFab");
    if (fab) fab.textContent = "\u25C2 CASE";
    if (typeof window.switchTab === "function") {
      var orig = window.switchTab;
      window.switchTab = function (k) {
        document.body.dataset.tab = k;
        return orig.apply(this, arguments);
      };
    }
    var cob = document.getElementById("th-cobalt");
    if (cob && cob.parentElement) cob.parentElement.style.flexWrap = "wrap";
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", go);
  else go();
})();
