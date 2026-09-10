/* NIRAKSHAN live bridge v3 — SSE + pulses + ATM + anomaly banner + AI briefing + demo QRs */
(function () {
  var LIVE = location.origin;
  var atmLayer = null, pulseCount = 0;

  function addBadge() {
    var sync = document.querySelector(".z2-sync"); if (!sync) return;
    var d = document.createElement("div");
    d.id = "liveBadge"; d.className = "font-mono";
    d.style.cssText = "color:#eab308;font-weight:700;";
    d.innerHTML = "INGEST: <span id='liveCount'>0</span> …";
    sync.prepend(d);
  }
  function setBadge(state) {
    var el = document.getElementById("liveBadge"); if (!el) return;
    if (state === "live") { el.style.color = "#10b981"; el.innerHTML = "INGEST: <span id='liveCount'>" + pulseCount + "</span> LIVE"; }
    else { el.style.color = "#ef4444"; el.innerHTML = "INGEST: OFFLINE"; }
  }

  function pulse(nodeId, big) {
    try {
      if (typeof map === "undefined" || !map || typeof NODES === "undefined") return;
      var n = NODES.find(function (x) { return x.id === nodeId; }); if (!n) return;
      var m = L.circleMarker([n.lat, n.lon], {
        radius: big ? 26 : 16, fillColor: big ? "#ef4444" : "#38bdf8",
        color: big ? "#fca5a5" : "#7dd3fc", weight: 2, opacity: .9, fillOpacity: .25
      }).addTo(map);
      setTimeout(function () { map.removeLayer(m); }, big ? 7000 : 4000);
    } catch (e) {}
  }
  function bumpNode(nodeId, amt) {
    try {
      if (typeof NODES === "undefined") return;
      var n = NODES.find(function (x) { return x.id === nodeId; }); if (!n) return;
      n.baseScore = Math.min(96, (n.baseScore || 40) + 2);
      n.baseFlow = (n.baseFlow || 100000) + (amt || 0);
      n.factors = n.factors || [];
      if (n.factors.indexOf("LIVE INGEST") < 0) n.factors.unshift("LIVE INGEST");
      if (typeof recalculateHawkesEngine === "function") recalculateHawkesEngine(currentHorizon || 2);
    } catch (e) {}
  }
  function prependRow(c) {
    var tb = document.getElementById("dashboardStreamBody"); if (!tb) return;
    var tr = document.createElement("tr");
    tr.style.background = "rgba(56,189,248,.06)";
    tr.innerHTML =
      "<td class='font-mono' style='color:var(--accent-cyan);'>" + c.ack_no + "</td>" +
      "<td class='font-mono'>" + c.timestamp + "</td>" +
      "<td class='font-mono'>" + c.victim_vpa + "</td>" +
      "<td><b>" + c.target_terminal_id + "</b></td>" +
      "<td class='font-mono' style='font-weight:bold;'>₹" + Number(c.disputed_amount_inr).toLocaleString("en-IN") + "</td>" +
      "<td class='font-mono' style='color:var(--c-very-high);'>" + c.hop_count + "</td>" +
      "<td class='font-mono' style='color:" + (c.source === "SIM" ? "#eab308" : "#10b981") + ";'>" + c.source + "</td>";
    tb.prepend(tr);
    var el = document.getElementById("liveCount");
    if (el) el.textContent = ++pulseCount;
  }

  /* anomaly banner */
  var banner = null;
  function showAnomaly(c) {
    if (!banner) {
      banner = document.createElement("div");
      banner.style.cssText = "position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147482000;" +
        "background:#2a0709;border:1px solid #ef4444;color:#fecaca;font-family:monospace;font-size:11px;" +
        "padding:10px 16px;border-radius:4px;box-shadow:0 0 30px rgba(239,68,68,.5);display:none;max-width:90vw;";
      document.body.appendChild(banner);
    }
    banner.innerHTML = "⚠ <b>ANOMALY:</b> coordinated burst at " + c.terminal_id +
      " — " + c.count_30s + " events/30s (baseline " + c.baseline + ") · " + (c.note || "");
    banner.style.display = "block";
    pulse(c.terminal_id, true);
    clearTimeout(banner._t);
    banner._t = setTimeout(function () { banner.style.display = "none"; }, 9000);
  }

  function connect() {
    var es = new EventSource(LIVE + "/events");
    es.onopen = function () { setBadge("live"); };
    es.onmessage = function (ev) {
      try {
        var c = JSON.parse(ev.data);
        if (c.type === "anomaly") { showAnomaly(c); return; }
        if (c.type === "sms_alert") { showSms(c); return; }
        prependRow(c); pulse(c.target_terminal_id); bumpNode(c.target_terminal_id, c.disputed_amount_inr);
      } catch (e) {}
    };
    es.onerror = function () { setBadge("off"); es.close(); setTimeout(connect, 5000); };
  }

  /* ATM layer */
  function loadAtms(btn) {
    if (typeof map === "undefined" || !map || typeof NODES === "undefined") {
      alert("Map not ready — open Risk Map pane and retry."); return;
    }
    var n = NODES.reduce(function (a, b) { return (b.baseScore || 0) > (a.baseScore || 0) ? b : a; });
    btn.disabled = true; btn.textContent = "FETCHING ATMs near " + n.id + " … (~90s max)";
    fetch(LIVE + "/atms?node=" + n.id + "&lat=" + n.lat + "&lon=" + n.lon + "&r=8000")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        btn.disabled = false;
        if (!d.atms.length) { btn.textContent = "0 CASH POINTS — RETRY ▣";
          alert(d.error || "Overpass returned zero cash points."); return; }
        if (!atmLayer) atmLayer = L.layerGroup().addTo(map);
        atmLayer.clearLayers();
        d.atms.forEach(function (a) {
          L.marker([a.lat, a.lon], { icon: L.divIcon({ className: "", html:
            "<div style='font-size:13px;filter:drop-shadow(0 0 4px #38bdf8);'>▣</div>", iconSize: [16,16] }) })
            .bindTooltip("ATM (LIVE): " + a.name + (a.operator ? " · " + a.operator : "")).addTo(atmLayer);
        });
        btn.textContent = "ATMs: " + d.atms.length + " (LIVE OSM) ▣";
      })
      .catch(function (err) {
        btn.disabled = false; btn.textContent = "ATM FETCH FAILED — RETRY ▣";
        alert("live.py/app.py unreachable. Test: " + LIVE + "/health\nDetail: " + err.message);
      });
  }
  function addAtmButton() {
    var box = document.querySelector(".map-layers"); if (!box) return;
    var b = document.createElement("button");
    b.textContent = "ATM LAYER (LIVE OSM) ▣";
    b.onclick = function () { loadAtms(b); };
    box.appendChild(b);
  }

  /* generic modal */
  var modal = null;
  function openModal(html) {
    if (!modal) {
      modal = document.createElement("div");
      modal.style.cssText = "position:fixed;inset:0;z-index:2147482500;background:rgba(0,0,0,.8);" +
        "display:flex;align-items:center;justify-content:center;";
      modal.onclick = function (e) { if (e.target === modal) modal.style.display = "none"; };
      document.body.appendChild(modal);
    }
    modal.innerHTML = "<div style='background:#060c18;border:1px solid #14263f;border-radius:6px;" +
      "padding:18px;max-width:520px;width:92vw;max-height:85vh;overflow:auto;color:#e8fbff;" +
      "font-family:monospace;font-size:12px;line-height:1.6;'>" + html +
      "<div style='text-align:right;margin-top:12px;'><button class='cbtn' onclick='this.closest(\"div[style*=fixed]\").style.display=\"none\"'>CLOSE</button></div></div>";
    modal.style.display = "flex";
  }

  /* AI briefing button (always visible, bottom-right action bar) */
  function addAiButton() {
    var row = document.querySelector(".z3-actions .btn-row"); if (!row) return;
    var b = document.createElement("button");
    b.className = "act-btn"; b.style.flex = "1";
    b.textContent = "AI BRIEFING ✦";
    b.onclick = function () {
      b.textContent = "AI THINKING…"; b.disabled = true;
      fetch(LIVE + "/ai/briefing").then(function (r) { return r.json(); }).then(function (d) {
        b.textContent = "AI BRIEFING ✦"; b.disabled = false;
        openModal("<div style='color:var(--accent-cyan);font-weight:bold;margin-bottom:8px;'>SITUATION BRIEFING" +
          " <span style='float:right;font-size:10px;color:#eab308;'>ENGINE: " + d.engine + "</span></div>" +
          "<div style='white-space:pre-wrap;'>" + d.text.replace(/</g, "&lt;") + "</div>");
      }).catch(function () { b.textContent = "AI BRIEFING ✦"; b.disabled = false;
        alert("Backend unreachable: " + LIVE + "/ai/briefing"); });
    };
    row.appendChild(b);
  }

  /* demo QR generator (scannable with the real camera) */
  var DEMO = {
    fraud: "upi://pay?pa=refund-nodal09@icici&pn=HPCL%20Cashback%20Refund&am=18900&cu=INR&tn=KYC%20wallet%20update%20verify",
    legit: "upi://pay?pa=sharmastore2345@paytm&pn=Sharma%20General%20Store&cu=INR"
  };
  function showDemoQr(kind) {
    var uri = DEMO[kind];
    var img = "https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=" + encodeURIComponent(uri);
    openModal(
      "<div style='color:" + (kind === "fraud" ? "#ef4444" : "#10b981") + ";font-weight:bold;margin-bottom:8px;'>" +
      (kind === "fraud" ? "⚠ FRAUD PATTERN DEMO QR" : "✔ LEGIT MERCHANT DEMO QR") + "</div>" +
      "<div style='background:#fff;padding:10px;width:240px;margin:0 auto;border-radius:4px;'>" +
      "<img src='" + img + "' style='width:220px;height:220px;display:block;'></div>" +
      "<div style='margin-top:10px;word-break:break-all;color:#bae6fd;'>" + uri + "</div>" +
      "<div style='color:#7e91a7;margin-top:8px;'>Scan with the camera sensor on this device (or another phone), " +
      "or run heuristics directly:</div>" +
      "<button class='cbtn primary' style='margin-top:10px;' onclick='window.__runDemo(\"" + kind + "\")'>" +
      "RUN HEURISTIC ANALYSIS ▸</button>");
  }
  window.__runDemo = function (kind) {
    var input = document.getElementById("qrUri");
    if (input) input.value = DEMO[kind];
    if (modal) modal.style.display = "none";
    if (typeof switchTab === "function") switchTab("qr");
    setTimeout(function () { if (typeof runQRAnalysis === "function") runQRAnalysis(); }, 250);
  };
  function addQrDemoButtons() {
    var row = document.querySelector(".cam-btns"); if (!row) return;
    var f = document.createElement("button");
    f.className = "cbtn"; f.style.borderColor = "#ef4444"; f.textContent = "FRAUD QR DEMO ⚠";
    f.onclick = function () { showDemoQr("fraud"); };
    var l = document.createElement("button");
    l.className = "cbtn"; l.style.borderColor = "#10b981"; l.textContent = "LEGIT QR DEMO ✔";
    l.onclick = function () { showDemoQr("legit"); };
    row.appendChild(f); row.appendChild(l);
  }


  /* ==== SMS ALERT CENTER: banner + klaxon + vibrate + notification ==== */
  var audioCtx = null, alertsOn = false;
  function alarmSound() {
    if (!alertsOn || !audioCtx) return;
    try {
      var t0 = audioCtx.currentTime;
      for (var i = 0; i < 8; i++) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "square"; o.frequency.value = (i % 2) ? 980 : 660;
        g.gain.value = 0.09;
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0 + i * 0.17); o.stop(t0 + i * 0.17 + 0.13);
      }
    } catch (e) {}
  }
  function pushNotif(title, body) {
    try {
      if (!alertsOn || !("Notification" in window)) return;
      if (Notification.permission === "granted") {
        var n = new Notification(title, { body: body, icon: "sih.png", tag: "nirakshan" });
        n.onclick = function () { window.focus(); n.close(); };
      }
    } catch (e) {}
  }
  var smsBanner = null;
  function showSms(c) {
    if (!smsBanner) {
      smsBanner = document.createElement("div");
      smsBanner.style.cssText = "position:fixed;top:10px;left:50%;transform:translateX(-50%);" +
        "z-index:2147482000;background:#2a0709;border:1px solid #ef4444;color:#fecaca;" +
        "font-family:monospace;font-size:11px;padding:10px 16px;border-radius:4px;" +
        "box-shadow:0 0 30px rgba(239,68,68,.5);display:none;max-width:92vw;";
      document.body.appendChild(smsBanner);
    }
    var col = c.risk_score >= 45 ? "#ef4444" : "#eab308";
    smsBanner.style.borderColor = col;
    smsBanner.innerHTML = "\uD83D\uDCF1 <b>" + c.verdict + "</b> (" + c.risk_score +
      ") from <b>" + c.sender + "</b><br>" + c.text.replace(/</g, "&lt;") +
      (c.matched && c.matched.length ? "<br><span style='color:#eab308'>rules: " +
       c.matched.join(", ") + "</span>" : "");
    smsBanner.style.display = "block";
    alarmSound();
    if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 300]);
    pushNotif(c.verdict + " \u2014 " + c.sender, c.text.slice(0, 110));
    clearTimeout(smsBanner._t);
    smsBanner._t = setTimeout(function () { smsBanner.style.display = "none"; }, 10000);
    var tb = document.querySelector("#pane-alerts tbody");
    if (tb) {
      var tr = document.createElement("tr");
      tr.style.background = "rgba(239,68,68,.08)";
      tr.innerHTML = "<td class='font-mono'>" + c.ts + "</td>" +
        "<td style='color:" + col + ";font-weight:700;'>" + c.verdict + " \u00b7 " + c.risk_score + "</td>" +
        "<td><b>LIVE SMS</b> from " + c.sender + "<br><span style='font-size:8.5px;'>" +
        c.text.replace(/</g, "&lt;") + "</span></td>" +
        "<td class='font-mono'>\u2014</td>" +
        "<td style='color:#eab308;'>NIRAKSHAN SMS Sensor</td>";
      tb.prepend(tr);
    }
  }
  function addAlertsEnableButton() {
    var row = document.querySelector(".z3-actions .btn-row"); if (!row) return;
    var b = document.createElement("button");
    b.className = "act-btn"; b.style.flex = "1";
    b.textContent = "ENABLE ALERTS \uD83D\uDD14";
    b.onclick = function () {
      var arm = function () {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
        alertsOn = true;
        b.textContent = "ALERTS ARMED \uD83D\uDD14";
        if (navigator.vibrate) navigator.vibrate(200);
        alarmSound();
      };
      if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission().then(function () { arm(); });
      } else arm();
    };
    row.appendChild(b);
  }


  /* ==== LIVE SMS THREAT SENSOR (paste-intake + one-click samples) ==== */
  function addSmsSensor() {
    var pane = document.getElementById("pane-alerts"); if (!pane) return;
    var card = document.createElement("div");
    card.style.cssText = "background:var(--bg-card);border:1px solid var(--border);" +
      "border-left:3px solid var(--c-very-high);border-radius:3px;padding:10px;" +
      "margin-bottom:12px;display:flex;flex-direction:column;gap:8px;";
    card.innerHTML =
      "<div class='hud-title' style='margin:0;'>LIVE SMS THREAT SENSOR — paste any received SMS</div>" +
      "<input id='smsFrom' class='font-mono' placeholder='Sender number (optional)' " +
        "style='background:#040812;border:1px solid var(--border);color:#fff;padding:6px 10px;font-size:10px;border-radius:2px;' value='unknown'>" +
      "<textarea id='smsText' rows='3' placeholder='Paste the suspicious SMS text here…' " +
        "style='background:#040812;border:1px solid var(--border);color:#fff;padding:8px 10px;font-size:10px;font-family:monospace;border-radius:2px;resize:vertical;'></textarea>" +
      "<div style='display:flex;gap:6px;flex-wrap:wrap;'>" +
        "<button class='cbtn primary' id='smsAnalyze'>⚠ ANALYZE SMS</button>" +
        "<button class='cbtn' id='smsFillFraud'>FRAUD SAMPLE</button>" +
        "<button class='cbtn' id='smsFillLottery'>LOTTERY SAMPLE</button>" +
        "<button class='cbtn' id='smsFillBenign'>BENIGN CONTROL</button>" +
      "</div>" +
      "<div id='smsSensorOut' class='font-mono' style='font-size:9px;color:var(--text-muted);'></div>";
    pane.prepend(card);
    var SAMPLES = {
      smsFillFraud: ["+919876543210", "Dear Customer, Your KYC is expired. A/C will be blocked in 24 hrs. Update now: bit.ly/kyc-upd9"],
      smsFillLottery: ["+929811223344", "Congrats! You won Rs 25,00,000 LUCKY DRAW 2026. Claim your prize now: tinyurl.com/claim99"],
      smsFillBenign: ["VM-SHOPNOW", "Thank you for shopping. Your order #48211 has been dispatched, arriving Friday."]
    };
    Object.keys(SAMPLES).forEach(function (id) {
      document.getElementById(id).onclick = function () {
        document.getElementById("smsFrom").value = SAMPLES[id][0];
        document.getElementById("smsText").value = SAMPLES[id][1];
      };
    });
    document.getElementById("smsAnalyze").onclick = function () {
      var b = this; b.disabled = true; b.textContent = "SCORING…";
      var frm = document.getElementById("smsFrom").value || "unknown";
      var txt = document.getElementById("smsText").value || "";
      var out = document.getElementById("smsSensorOut");
      out.textContent = "running rule engine…";
      fetch(LIVE + "/sms-plain", { method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: frm + "|" + txt
      }).then(function (r) { return r.json(); }).then(function (d) {
        b.disabled = false; b.textContent = "⚠ ANALYZE SMS";
        var col = d.risk_score >= 45 ? "#ef4444" : (d.risk_score >= 20 ? "#eab308" : "#10b981");
        out.innerHTML = "<span style='color:" + col + ";font-weight:bold;'>" + d.verdict +
          " · risk " + d.risk_score + "</span>" +
          (d.matched && d.matched.length ? " — rules: " + d.matched.join(", ") : " — no rule hits");
      }).catch(function (e) {
        b.disabled = false; b.textContent = "⚠ ANALYZE SMS";
        out.textContent = "backend unreachable: " + e.message;
      });
    };
  }

  /* ==== CASE TRACE: one theft, split & tracked live ==== */
  function addCaseTrace() {
    var pane = document.getElementById("pane-transactions"); if (!pane) return;
    var card = document.createElement("div");
    card.style.cssText = "background:var(--bg-card);border:1px solid var(--border);" +
      "border-left:3px solid var(--c-very-high);border-radius:3px;padding:10px;margin-bottom:12px;";
    card.innerHTML = "<div style='display:flex;justify-content:space-between;align-items:center;'>" +
      "<div class='hud-title' style='margin:0;'>ACTIVE CASE TRACE — NCRP-2026-991823 · ₹3,80,000 stolen</div>" +
      "<button class='cbtn' id='ctRefresh'>REFRESH TRACE ⟳</button></div>" +
      "<div id='ctBody' class='font-mono' style='font-size:9.5px;margin-top:8px;color:var(--text-muted);'>loading…</div>";
    pane.prepend(card);
    document.getElementById("ctRefresh").onclick = loadTrace;
    loadTrace();
  }
  function loadTrace() {
    var body = document.getElementById("ctBody"); if (!body) return;
    fetch(LIVE + "/case/trace").then(function (r) { return r.json(); }).then(function (d) {
      var html = "";
      d.layers.forEach(function (L) {
        html += "<div style='margin:6px 0;'><b style='color:#fff;'>H" + L.hop + " · " +
          L.label + "</b> — ₹" + Number(L.amount).toLocaleString("en-IN") +
          " <span style='color:#7e91a7;'>(" + L.vpas.length + " legs)</span></div>";
        if (!L.live.length) {
          html += "<div style='padding-left:14px;color:#51605c;'>awaiting live activity…</div>";
        } else {
          L.live.forEach(function (v) {
            var hot = v.minutes_ago <= 10;
            html += "<div style='padding-left:14px;color:" + (hot ? "#ef4444" : "#38bdf8") + ";'>" +
              (hot ? "◉ LIVE " : "○ seen ") + v.id + " — " + v.events +
              " evt / ₹" + Number(v.inr).toLocaleString("en-IN") +
              " — " + v.minutes_ago + " min ago" + (hot ? " ⚠ INTERCEPT NOW" : "") + "</div>";
          });
        }
      });
      html += "<div style='margin-top:8px;color:#eab308;'>window: last " + d.window_min +
        " min · live events matched: " + d.total_live_events + "</div>";
      body.innerHTML = html;
    }).catch(function () { body.textContent = "trace endpoint unreachable"; });
  }

  window.NIRAKSHAN_LIVE = { loadAtms: loadAtms, LIVE: LIVE };

  function boot() { addBadge(); addAtmButton(); addAiButton(); addQrDemoButtons(); addAlertsEnableButton(); addSmsSensor(); addCaseTrace(); connect(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
