/* NIRAKSHAN live bridge v2 — SSE ingestion, ATM layer, provenance, visible feedback */
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

  function pulse(nodeId) {
    try {
      if (typeof map === "undefined" || !map || typeof NODES === "undefined") return;
      var n = NODES.find(function (x) { return x.id === nodeId; }); if (!n) return;
      var m = L.circleMarker([n.lat, n.lon], {
        radius: 16, fillColor: "#38bdf8", color: "#7dd3fc",
        weight: 2, opacity: 0.9, fillOpacity: 0.25
      }).addTo(map);
      setTimeout(function () { map.removeLayer(m); }, 4000);
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

  function connect() {
    var es = new EventSource(LIVE + "/events");
    es.onopen = function () {
      var el = document.getElementById("liveBadge");
      if (el) { el.style.color = "#10b981"; el.innerHTML = "INGEST: <span id='liveCount'>" + pulseCount + "</span> LIVE"; }
    };
    es.onmessage = function (ev) {
      try {
        var c = JSON.parse(ev.data);
        prependRow(c); pulse(c.target_terminal_id); bumpNode(c.target_terminal_id, c.disputed_amount_inr);
      } catch (e) {}
    };
    es.onerror = function () {
      var el = document.getElementById("liveBadge");
      if (el) { el.style.color = "#ef4444"; el.innerHTML = "INGEST: OFFLINE"; }
      es.close(); setTimeout(connect, 5000);
    };
  }

  function loadAtms(btn) {
    if (typeof map === "undefined" || !map || typeof NODES === "undefined") {
      alert("Map is not ready yet — stay on the Risk Map pane a moment and retry."); return;
    }
    var n = NODES.reduce(function (a, b) { return (b.baseScore || 0) > (a.baseScore || 0) ? b : a; });
    btn.disabled = true;
    btn.textContent = "FETCHING ATMs near " + n.id + " … (first query: up to 30s)";
    fetch(LIVE + "/atms?node=" + n.id + "&lat=" + n.lat + "&lon=" + n.lon + "&r=8000")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        btn.disabled = false;
        if (!atmLayer) atmLayer = L.layerGroup().addTo(map);
        atmLayer.clearLayers();
        d.atms.forEach(function (a) {
          L.marker([a.lat, a.lon], {
            icon: L.divIcon({ className: "", html:
              "<div style='font-size:13px;filter:drop-shadow(0 0 4px #38bdf8);'>▣</div>",
              iconSize: [16, 16] })
          }).bindTooltip("ATM (LIVE): " + a.name + (a.operator ? " · " + a.operator : ""))
            .addTo(atmLayer);
        });
        if (!d.atms.length) {
          btn.textContent = "0 ATMs — TAP TO RETRY ▣";
          alert("Overpass returned nothing (first query often times out). Tap again — the result is now cached server-side and will be instant.");
        } else {
          btn.textContent = "ATMs: " + d.atms.length + " (LIVE OSM) ▣";
        }
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = "ATM FETCH FAILED — RETRY ▣";
        alert("Could not reach the live service.\n\n1) Is live.py running? (Termux session 2: python live.py)\n2) Test in browser: " + LIVE + "/health\n\nDetail: " + err.message);
      });
  }

  function addAtmButton() {
    var box = document.querySelector(".map-layers"); if (!box) return;
    var b = document.createElement("button");
    b.textContent = "ATM LAYER (LIVE OSM) ▣";
    b.onclick = function () { loadAtms(b); };
    box.appendChild(b);
  }

  window.NIRAKSHAN_LIVE = { loadAtms: loadAtms, LIVE: LIVE };

  function boot() { addBadge(); addAtmButton(); connect(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
