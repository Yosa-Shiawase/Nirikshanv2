/* ENGINE ROOM — live transparency of the prediction machinery */
(function () {
  var PANE_ID = "pane-engine";
  function ensurePane() {
    if (document.getElementById(PANE_ID)) return;
    var body = document.querySelector(".z2-body"); if (!body) return;
    var pane = document.createElement("div");
    pane.id = PANE_ID; pane.className = "view-pane";
    pane.innerHTML =
      "<div class='pad-view' style='padding:14px;display:flex;flex-direction:column;gap:12px;'>" +
      "<div><h3 class='font-mono' style='font-size:13px;color:#fff;'>ENGINE ROOM — LIVE PREDICTION MACHINERY</h3>" +
      "<p style='font-size:9.5px;color:var(--text-muted);'>Every engine's internal state, updating with the stream. " +
      "This is how NIRAKSHAN decides where cash will surface next — fully auditable.</p></div>" +
      "<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;'>" +
        "<div style='background:var(--bg-card);border:1px solid var(--border);border-radius:3px;padding:10px;'>" +
          "<div class='hud-title'>\uD83D\uDD25 COMPLAINT INTAKE (last 60 min)</div>" +
          "<div id='erIntake' class='font-mono' style='font-size:10px;'>…</div></div>" +
        "<div style='background:var(--bg-card);border:1px solid var(--border);border-radius:3px;padding:10px;'>" +
          "<div class='hud-title'>\uD83C\uDF10 HAWKES RANKING — cash-out probability</div>" +
          "<div id='erHawkes' class='font-mono' style='font-size:10px;'>…</div></div>" +
      "</div>" +
      "<div style='background:var(--bg-card);border:1px solid var(--border);border-radius:3px;padding:10px;'>" +
        "<div class='hud-title'>\u26D3 CHAIN ANATOMY — complaint to cash-out (alpha=0.42 per hop)</div>" +
        "<div id='erChain' class='font-mono' style='font-size:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;'></div></div>" +
      "<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;'>" +
        "<div style='background:var(--bg-card);border:1px solid var(--border);border-radius:3px;padding:10px;'>" +
          "<div class='hud-title'>\uD83D\uDCC8 EWMA BASELINES (spike detector)</div>" +
          "<div id='erEwma' class='font-mono' style='font-size:10px;'>…</div></div>" +
        "<div style='background:var(--bg-card);border:1px solid var(--border);border-radius:3px;padding:10px;'>" +
          "<div class='hud-title'>\uD83E\uDDFE DECISION LOG (system narrating itself)</div>" +
          "<div id='erLog' class='font-mono' style='font-size:9.5px;max-height:180px;overflow:auto;'></div></div>" +
      "</div></div>";
    body.appendChild(pane);
  }
  function navBtn() {
    var nav = document.querySelector(".rail-nav"); if (!nav) return;
    var b = document.createElement("button");
    b.className = "rail-btn"; b.setAttribute("data-v", "engine");
    b.innerHTML = "<span class='ico'>⚙</span><span class='txt'>ENGINE ROOM<small>Live model state</small></span>";
    b.onclick = function () { if (typeof switchTab === "function") switchTab("engine"); };
    nav.appendChild(b);
    if (typeof switchTab === "function") {
      var orig = switchTab, titles = TITLES || {};
      window.switchTab = function (k) {
        orig.apply(this, arguments);
        if (k === "engine") {
          var t = document.getElementById("viewHeading"), s = document.getElementById("viewSub");
          if (t) t.innerText = "ENGINE ROOM — PREDICTION MACHINERY";
          if (s) s.innerText = "Transparent, auditable, live";
          setTimeout(load, 150);
        }
      };
    }
  }
  function load() {
    fetch((location.origin) + "/engine/state").then(function (r) { return r.json(); }).then(function (d) {
      var i = document.getElementById("erIntake");
      if (i) {
        var ks = Object.keys(d.counts).sort(function (a, b) { return d.counts[b] - d.counts[a]; }).slice(0, 6);
        var max = d.counts[ks[0]] || 1;
        i.innerHTML = "<div style='margin-bottom:4px;color:#10b981;'>TOTAL: " + d.total + " complaints / " + d.window_min + " min</div>" +
          ks.map(function (k) {
            return "<div style='display:flex;align-items:center;gap:6px;margin:2px 0;'><b style='width:60px;'>" + k +
              "</b><div style='flex:1;height:8px;background:#040812;border-radius:2px;overflow:hidden;'>" +
              "<div style='width:" + Math.round(d.counts[k] / max * 100) + "%;height:100%;background:#53c7f0;'></div></div>" +
              "<b style='width:24px;text-align:right;'>" + d.counts[k] + "</b></div>";
          }).join("");
      }
      var h = document.getElementById("erHawkes");
      if (h) {
        h.innerHTML = d.nodes.slice(0, 6).map(function (n, idx) {
          var col = n.score >= 80 ? "#ef4444" : n.score >= 65 ? "#f97316" : "#53c7f0";
          return "<div style='display:flex;align-items:center;gap:6px;margin:3px 0;'>" +
            "<b style='color:" + col + ";width:28px;'>#" + (idx + 1) + "</b>" +
            "<b style='width:64px;'>" + n.id + "</b>" +
            "<span style='color:#7e91a7;'>λ=" + n.lambda.toFixed(3) + " · P(+2h)=" +
            Math.round(n.p * 100) + "%</span>" +
            "<b style='margin-left:auto;color:" + col + ";'>" + n.score + "</b></div>";
        }).join("");
      }
      var c = document.getElementById("erChain");
      if (c) {
        var hops = ["COMPLAINT", "LAYER-1 MULE", "LAYER-2 MULE", "ATM CASH-OUT"];
        c.innerHTML = hops.map(function (x, j) {
          return "<span style='background:#040812;border:1px solid #1c3357;padding:4px 8px;border-radius:2px;'>" + x +
            (j ? " <span style='color:#eab308;'>×0.42^" + j + "</span>" : "") + "</span>" +
            (j < 3 ? "<span style='color:#53c7f0;'>→</span>" : "");
        }).join("") + "<div style='width:100%;color:#7e91a7;font-size:9px;margin-top:4px;'>" +
          "A complaint at terminal X means a chain started; cash surfaces at X-area ATMs within the horizon window.</div>";
      }
      var e = document.getElementById("erEwma");
      if (e) {
        var ks = Object.keys(d.ewma);
        e.innerHTML = ks.length ? ks.map(function (k) {
          return "<span class='pill' style='margin:2px;'>" + k + " baseline " + d.ewma[k] + "</span>";
        }).join("") : "<span class='lbl'>baselines forming…</span>";
      }
      var l = document.getElementById("erLog");
      if (l) l.innerHTML = d.log.map(function (x) {
        return "<div style='border-bottom:1px dashed #1c3357;padding:2px 0;'>" + x + "</div>";
      }).join("") || "<span class='lbl'>log filling…</span>";
    }).catch(function () {});
  }
  function go() {
    ensurePane(); navBtn();
    setInterval(function () {
      var p = document.getElementById(PANE_ID);
      if (p && p.classList.contains("active")) load();
    }, 4000);
    setTimeout(load, 800);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", go);
  else go();
})();
