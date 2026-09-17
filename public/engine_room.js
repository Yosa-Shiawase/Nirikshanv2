/* ENGINE ROOM v3 — fully client-side: same NODES + math as the map */
(function () {
  var PANE_ID = "pane-engine", mine = [], es = null;
  function ensurePane() {
    if (document.getElementById(PANE_ID)) return;
    var body = document.querySelector(".z2-body"); if (!body) return;
    var p = document.createElement("div");
    p.id = PANE_ID; p.className = "view-pane";
    p.innerHTML = "<div style='padding:14px;display:flex;flex-direction:column;gap:12px;'>" +
      "<div><h3 class='font-mono' style='font-size:13px;color:#fff;'>ENGINE ROOM — LIVE PREDICTION MACHINERY</h3>" +
      "<p style='font-size:9.5px;color:var(--text-muted);'>The system explaining itself: intake, ranking, chain physics, baselines, decisions.</p></div>" +
      "<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;'>" +
      "<div style='background:var(--bg-card);border:1px solid var(--border);border-radius:3px;padding:10px;'>" +
      "<div class='hud-title'>\uD83D\uDD25 COMPLAINT INTAKE (60 min)</div>" +
      "<div id='erIntake' class='font-mono' style='font-size:10px;'>…</div></div>" +
      "<div style='background:var(--bg-card);border:1px solid var(--border);border-radius:3px;padding:10px;'>" +
      "<div class='hud-title'>\uD83C\uDF10 HAWKES RANKING — cash-out probability</div>" +
      "<div id='erHawkes' class='font-mono' style='font-size:10px;'>…</div></div></div>" +
      "<div style='background:var(--bg-card);border:1px solid var(--border);border-radius:3px;padding:10px;'>" +
      "<div class='hud-title'>\u26D3 CHAIN ANATOMY — complaint to cash-out</div>" +
      "<div id='erChain' class='font-mono' style='font-size:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;'></div></div>" +
      "<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;'>" +
      "<div style='background:var(--bg-card);border:1px solid var(--border);border-radius:3px;padding:10px;'>" +
      "<div class='hud-title'>\uD83D\uDCC8 SPIKE WATCH (current vs baseline)</div>" +
      "<div id='erEwma' class='font-mono' style='font-size:10px;'>…</div></div>" +
      "<div style='background:var(--bg-card);border:1px solid var(--border);border-radius:3px;padding:10px;'>" +
      "<div class='hud-title'>\uD83E\uDDFE DECISION LOG <span id='erLogCount' style='color:var(--text-dim);'>(0)</span></div>" +
      "<div id='erLog' class='font-mono' style='font-size:9.5px;max-height:180px;overflow:auto;'></div></div></div></div>";
    body.appendChild(p);
  }
  var logs = [];
  function pushLog(msg, col) {
    logs.unshift("<div style='border-bottom:1px dashed #1c3357;padding:2px 0;color:" +
      (col || "#bae6fd") + ";'>[" + new Date().toLocaleTimeString() + "] " + msg + "</div>");
    if (logs.length > 40) logs.pop();
    var l = document.getElementById("erLog");
    if (l) {
      l.innerHTML = logs.join("");
      l.scrollTop = 0;              /* newest on top - already visible */
      var head = document.getElementById("erLogCount");
      if (head) head.textContent = "(" + logs.length + " entries)";
    }
  }
  function hav(a, b) {
    var R = 6371, dLa = (b.lat - a.lat) * Math.PI / 180, dLo = (b.lon - a.lon) * Math.PI / 180;
    var x = Math.sin(dLa/2)*Math.sin(dLa/2) +
      Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLo/2)*Math.sin(dLo/2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function rank(horizon) {
    var N = (typeof NODES !== "undefined") ? NODES : [];
    var out = N.map(function (n) {
      var lam = (n.baseScore / 100) * Math.pow(0.42, n.baseHops || 2) * 0.45;
      N.forEach(function (o) {
        if (o.id === n.id || (o.baseScore || 0) < 70) return;
        var d = hav(n, o);
        lam += Math.log1p((o.baseFlow || 100000) / 10000) *
          Math.exp(-1.38 * (horizon + 0.5)) *
          Math.exp(-(d * d) / (2 * 350 * 350));
      });
      var p = 1 - Math.exp(-lam * Math.max(1, horizon * 0.5));
      return { id: n.id, lam: lam, p: p,
        score: Math.min(99, Math.max(12, Math.round(p * 100))) };
    });
    out.sort(function (a, b) { return b.p - a.p; });
    return out;
  }
  function listen() {
    es = new EventSource(location.origin + "/events");
    es.onmessage = function (ev) {
      try {
        var c = JSON.parse(ev.data);
        if (c.type === "sms_alert") {
          pushLog("SMS " + c.verdict + " (" + c.risk_score + ") from " + c.sender, "#fca5a5"); return;
        }
        if (c.type === "anomaly") {
          pushLog("BURST at " + c.terminal_id + " — " + c.count_30s + "/30s vs baseline " + c.baseline, "#ef4444"); return;
        }
        mine.push({ t: Date.now(), term: c.target_terminal_id,
          amt: c.disputed_amount_inr, ack: (c.ack_no || "").slice(-6), src: c.source });
        pushLog("complaint " + ((c.ack_no || "").slice(-6)) + " @ " + c.target_terminal_id +
          " ₹" + Number(c.disputed_amount_inr).toLocaleString("en-IN") +
          " → chain active, cash-out watch +2h");
        var el = document.getElementById("erLog");
      } catch (e) {}
    };
    es.onerror = function () { es.close(); setTimeout(listen, 5000); };
  }
  function openEngine() {
    ensurePane();
    document.querySelectorAll(".view-pane").forEach(function (x) { x.classList.remove("active"); });
    document.getElementById(PANE_ID).classList.add("active");
    document.querySelectorAll(".rail-btn").forEach(function (x) { x.classList.remove("active"); });
    var r = document.getElementById("erRailBtn"); if (r) r.classList.add("active");
    render();
  }
  function render() {
    var now = Date.now();
    mine = mine.filter(function (x) { return now - x.t < 3600000; });
    var counts = {};
    mine.forEach(function (x) { counts[x.term] = (counts[x.term] || 0) + 1; });
    var i = document.getElementById("erIntake");
    if (i) {
      var ks = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 6);
      var mx = counts[ks[0]] || 1;
      i.innerHTML = "<div style='color:#10b981;margin-bottom:4px;'>TOTAL: " + mine.length + " / 60 min</div>" +
        (ks.length ? ks.map(function (k) {
          return "<div style='display:flex;gap:6px;align-items:center;margin:2px 0;'><b style='width:60px;'>" + k +
            "</b><div style='flex:1;height:8px;background:#040812;'><div style='width:" +
            Math.round(counts[k]/mx*100) + "%;height:100%;background:#53c7f0;'></div></div><b style='width:24px;text-align:right;'>" +
            counts[k] + "</b></div>";
        }).join("") : "<span class='lbl'>waiting for stream…</span>");
    }
    var h = document.getElementById("erHawkes");
    if (h) h.innerHTML = rank(2).slice(0, 6).map(function (n, ix) {
      var col = n.score >= 80 ? "#ef4444" : n.score >= 65 ? "#f97316" : "#53c7f0";
      return "<div style='display:flex;align-items:center;gap:6px;margin:3px 0;'><b style='color:" + col +
        ";width:26px;'>#" + (ix + 1) + "</b><b style='width:62px;'>" + n.id +
        "</b><span style='color:#7e91a7;'>λ=" + n.lam.toFixed(3) + " · P(+2h)=" +
        Math.round(n.p * 100) + "%</span><b style='margin-left:auto;color:" + col + ";'>" + n.score + "</b></div>";
    }).join("");
    var c = document.getElementById("erChain");
    if (c) {
      var hops = ["COMPLAINT", "L1 MULE", "L2 MULE", "ATM CASH-OUT"];
      c.innerHTML = hops.map(function (x, j) {
        return "<span style='background:#040812;border:1px solid #1c3357;padding:4px 8px;'>" + x +
          (j ? " <span style='color:#eab308;'>×0.42^" + j + "</span>" : "") + "</span>" +
          (j < 3 ? "<span style='color:#53c7f0;'>→</span>" : "");
      }).join("");
    }
    var e = document.getElementById("erEwma");
    if (e) {
      var base = {}, cur = {};
      mine.forEach(function (x) {
        base[x.term] = (base[x.term] || 0) + 1;
        if (now - x.t < 300000) cur[x.term] = (cur[x.term] || 0) + 1;
      });
      var rows = Object.keys(base).map(function (k) {
        var b = base[k] / 60, cu = (cur[k] || 0) / 5;
        var hot = cu >= 5 && cu > 2.2 * b;
        return "<span class='pill' style='margin:2px;" + (hot ? "border-color:#ef4444;color:#fca5a5;" : "") + "'>" +
          k + " · now " + cu.toFixed(1) + "/min vs base " + b.toFixed(2) + (hot ? " ⚠ BURST" : "") + "</span>";
      });
      e.innerHTML = rows.join("") || "<span class='lbl'>baselines forming…</span>";
    }
  }
  window.__openEngine = openEngine;
  function go() {
    ensurePane();
    var nav = document.querySelector(".rail-nav");
    if (nav && !document.getElementById("erRailBtn")) {
      var b = document.createElement("button");
      b.id = "erRailBtn"; b.className = "rail-btn";
      b.innerHTML = "<span class='ico'>⚙</span><span class='txt'>ENGINE ROOM<small>Live model state</small></span>";
      b.onclick = openEngine; nav.appendChild(b);
    }
    listen();
    setInterval(function () {
      var p = document.getElementById(PANE_ID);
      if (p && p.classList.contains("active")) render();
    }, 3000);
    setTimeout(render, 1500);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", go);
  else go();
})();
