/* v4 LIVE CHASE — animated theft-split across the map */
(function () {
  var running = false, timers = [], layers = [], logbox = null;
  var A = 0.42; /* hop decay for labels */

  function N(id) {
    var n = (typeof NODES !== "undefined") ? NODES.find(function (x) { return x.id === id; }) : null;
    return n ? [n.lat, n.lon] : null;
  }
  function log(msg, color) {
    if (!logbox) return;
    var d = document.createElement("div");
    d.style.cssText = "margin:3px 0;color:" + (color || "#bae6fd") + ";";
    d.textContent = "[" + new Date().toLocaleTimeString() + "] " + msg;
    logbox.prepend(d);
  }
  function toast(msg, bad) {
    var t = document.createElement("div");
    t.style.cssText = "position:fixed;top:70px;left:50%;transform:translateX(-50%);" +
      "z-index:2147482000;background:" + (bad ? "#2a0709" : "#0c2238") + ";" +
      "border:1px solid " + (bad ? "#ef4444" : "#38bdf8") + ";color:#fff;" +
      "font-family:monospace;font-size:13px;padding:12px 20px;border-radius:4px;" +
      "box-shadow:0 0 30px rgba(56,189,248,.4);";
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 5000);
  }
  function mk(latlng, color, txt) {
    var m = L.circleMarker(latlng, { radius: 8, fillColor: color, color: "#fff",
      weight: 2, fillOpacity: 0.95 }).addTo(map);
    if (txt) m.bindTooltip(txt, { permanent: false, direction: "top" });
    layers.push(m); return m;
  }
  function leg(a, b, amount, hops, color, done) {
    var la = N(a), lb = N(b); if (!la || !lb) { done && done(); return; }
    var line = L.polyline([la, lb], { color: color, weight: 3, opacity: 0.85,
      dashArray: "8 10" }).addTo(map);
    layers.push(line);
    var steps = 60, i = 0, dot = L.circleMarker(la, { radius: 6,
      fillColor: "#fbbf24", color: "#fff", weight: 2, fillOpacity: 1 }).addTo(map);
    layers.push(dot);
    var ev = Math.pow(A, hops), amt2 = Math.round(amount * ev);
    var iv = setInterval(function () {
      i++;
      var f = i / steps;
      var lat = la[0] + (lb[0] - la[0]) * f, lon = la[1] + (lb[1] - la[1]) * f;
      dot.setLatLng([lat, lon]);
      line.setStyle({ dashOffset: String(-i * 4) });
      if (i >= steps) {
        clearInterval(iv);
        mk(lb, color, "₹" + (amt2 / 100000).toFixed(2) + "L · " + b +
          " · α^" + hops + "=" + ev.toFixed(3));
        log("₹" + (amount / 100000).toFixed(2) + "L moved " + a + " → " + b +
          " (arrives as ₹" + (amt2 / 100000).toFixed(2) + "L)", color);
        done && done();
      }
    }, 33);
    timers.push(iv);
  }
  function stop() {
    running = false;
    timers.forEach(clearInterval); timers = [];
    layers.forEach(function (l) { map.removeLayer(l); }); layers = [];
    if (logbox) { logbox.remove(); logbox = null; }
    var b = document.getElementById("chaseBtn");
    if (b) b.textContent = "▶ LIVE CHASE";
  }
  function start() {
    if (typeof map === "undefined" || !map) { alert("Open the Risk Map first."); return; }
    running = true;
    var b = document.getElementById("chaseBtn");
    if (b) b.textContent = "■ STOP CHASE";
    logbox = document.createElement("div");
    logbox.style.cssText = "position:fixed;left:10px;bottom:80px;z-index:800;width:290px;" +
      "max-height:40vh;overflow:auto;background:rgba(8,18,38,.95);border:1px solid #1c3357;" +
      "border-radius:4px;padding:8px;font-family:monospace;font-size:10.5px;color:#bae6fd;";
    logbox.innerHTML = "<b style='color:#53c7f0;'>CHASE LOG — CASE NCRP-2026-991823</b>";
    document.body.appendChild(logbox);
    map.flyTo(N("DL-01"), 6, { duration: 1.2 });
    log("CASE OPENED: ₹3,80,000 stolen via QR scam — tracing…", "#fbbf24");
    mk(N("DL-01"), "#ef4444", "VICTIM ORIGIN — ₹3,80,000");
    toast("CASE TRACE: ₹3,80,000 — following the money", false);

    var seq = [
      ["DL-01", "JAI-01", 220000, 1], ["DL-01", "MUM-01", 160000, 1],
      ["JAI-01", "BLR-01", 120000, 2], ["JAI-01", "HYD-01", 100000, 2],
      ["MUM-01", "LKO-01", 160000, 2],
      ["BLR-01", "BLR-01", 120000, 3], ["HYD-01", "MUM-01", 100000, 3],
      ["LKO-01", "DL-01", 160000, 3]
    ];
    var i = 0;
    (function next() {
      if (!running) return;
      if (i >= seq.length) {
        map.flyTo([22.5, 79.5], 5, { duration: 1.5 });
        toast("⚠ INTERCEPT WINDOW OPEN — DL-01 · MUM-01 · BLR-01", true);
        log("CASH-OUT PREDICTED at 3 terminals — dispatch advised", "#ef4444");
        if (typeof loadAtms === "function") loadAtms(document.getElementById("chaseBtn"));
        return;
      }
      var s = seq[i++];
      var col = s[3] === 3 ? "#ef4444" : "#38bdf8";
      leg(s[0], s[1], s[2], s[3], col, function () {
        if (s[3] === 3) toast("💰 CASH-OUT at " + s[1] + " — intercept now", true);
        setTimeout(next, 400);
      });
    })();
  }
  function addBtn() {
    var box = document.querySelector(".map-layers"); if (!box) return;
    var b = document.createElement("button");
    b.id = "chaseBtn"; b.textContent = "▶ LIVE CHASE";
    b.onclick = function () { running ? stop() : start(); };
    box.appendChild(b);
    var tb = document.createElement("button");
    tb.textContent = "⛰ TERRAIN";
    tb.onclick = function () {
      if (tb._on) { map.removeLayer(tb._lyr); tb._on = false; tb.textContent = "⛰ TERRAIN"; }
      else {
        tb._lyr = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, opacity: 0.5 }).addTo(map);
        tb._on = true; tb.textContent = "⛰ TERRAIN ON";
      }
    };
    box.appendChild(tb);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", addBtn);
  else addBtn();
})();
