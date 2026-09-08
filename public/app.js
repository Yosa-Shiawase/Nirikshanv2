let NODES = [
  { id: "DL-01", name: "DELHI (DL-01)", lat: 28.6139, lon: 77.2090, baseScore: 85, baseFlow: 380000, baseHops: 2, factors: ["High UPI Anomaly", "New QR Spike", "Shell Accounts", "Velocity Change"] },
  { id: "SGR-01", name: "SRINAGAR (JK-01)", lat: 34.0837, lon: 74.7973, baseScore: 32, baseFlow: 45000, baseHops: 4, factors: ["Low Dormancy Reactivation", "Normal Flow"] },
  { id: "LKO-01", name: "LUCKNOW (UP-01)", lat: 26.8467, lon: 80.9462, baseScore: 72, baseFlow: 210000, baseHops: 2, factors: ["New QR Spike", "Layer-2 Mule Inflow"] },
  { id: "JAI-01", name: "JAIPUR (RJ-01)", lat: 26.9124, lon: 75.7873, baseScore: 28, baseFlow: 30000, baseHops: 3, factors: ["Controlled Flow", "Isolated Run"] },
  { id: "AMD-01", name: "AHMEDABAD (GJ-01)", lat: 23.0225, lon: 72.5714, baseScore: 68, baseFlow: 185000, baseHops: 2, factors: ["Surge Inflow", "Typosquatted VPA"] },
  { id: "IND-01", name: "INDORE (MP-01)", lat: 22.7196, lon: 75.8577, baseScore: 45, baseFlow: 95000, baseHops: 3, factors: ["Secondary Cluster", "Velocity Change"] },
  { id: "MUM-01", name: "MUMBAI (MH-01)", lat: 19.0760, lon: 72.8777, baseScore: 92, baseFlow: 640000, baseHops: 1, factors: ["High UPI Anomaly", "Shell Account Fanout", "Offsite ATM Run"] },
  { id: "HYD-01", name: "HYDERABAD (TS-01)", lat: 17.3850, lon: 78.4867, baseScore: 81, baseFlow: 310000, baseHops: 2, factors: ["Pre-filled Debit QR", "Mule Swarm"] },
  { id: "BLR-01", name: "BENGALURU (KA-01)", lat: 12.9716, lon: 77.5946, baseScore: 84, baseFlow: 420000, baseHops: 2, factors: ["High UPI Anomaly", "New QR Spike", "Transit Dispersion"] },
  { id: "CCU-01", name: "KOLKATA (WB-01)", lat: 22.5726, lon: 88.3639, baseScore: 76, baseFlow: 260000, baseHops: 2, factors: ["Border Lineage", "Layering Delay"] },
  { id: "MAA-01", name: "CHENNAI (TN-01)", lat: 13.0827, lon: 80.2707, baseScore: 62, baseFlow: 140000, baseHops: 3, factors: ["Merchant POS Fraud", "ATM Clustering"] }
];

let INGESTED_COMPLAINTS = [];
let map = null, markers = [];
let isPlaying = false, playTimer = null;
let codeReader = null, isCamActive = false;
let activeNode = NODES[0];
let currentHorizon = 2;

window.addEventListener("DOMContentLoaded", () => {
  setInterval(() => {
    const el = document.getElementById("syncClock");
    if (el) el.innerText = new Date().toTimeString().split(" ")[0] + " IST";
  }, 1000);
  initMap();
  recalculateHawkesEngine(currentHorizon);
  checkForSeedData();
});

// --- ESRI DARK VECTOR BASEMAP ---
function initMap() {
  const mapContainer = document.getElementById("map");
  if (!mapContainer || map) return;

  map = L.map("map", { zoomControl: false }).setView([22.5, 79.5], 4.8);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 16,
    attribution: "ESRI & OpenStreetMap"
  }).addTo(map);

  setTimeout(() => { if (map) map.invalidateSize(); }, 300);
}

// --- OPTION 2: AUTO SEED INGESTION ---
async function checkForSeedData() {
  try {
    const res = await fetch("seed_data.json");
    if (!res.ok) return;
    const data = await res.json();
    INGESTED_COMPLAINTS = data.complaints || [];

    if (data.terminals && data.terminals.length > 0) {
      NODES = data.terminals.map(t => {
        const linked = INGESTED_COMPLAINTS.filter(c => c.target_terminal_id === t.id);
        const count = linked.length;
        const totalAmount = linked.reduce((sum, c) => sum + c.disputed_amount_inr, 0);

        return {
          id: t.id,
          name: t.name,
          lat: t.lat,
          lon: t.lon,
          baseScore: Math.min(96, Math.max(25, count * 4)),
          baseFlow: totalAmount > 0 ? totalAmount : t.base_flow,
          baseHops: linked[0]?.hop_count || 2,
          factors: ["NCRP Stream Linked", `Complaints: ${count}`, "Layering Intercept", "Live Ingest"]
        };
      });

      activeNode = NODES[0];
      recalculateHawkesEngine(currentHorizon);
      populateAlertsFromIngest();
    }
  } catch (err) {
    // Default nodes remain active if no seed file exists
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- OPTION 1: HAWKES TEMPORAL DECAY ENGINE ---
function evaluateNodeIntensity(targetNode, forecastHorizon) {
  const beta = 1.38;
  const sigmaKm = 350.0;
  const alphaDecay = 0.42;

  const hopFactor = Math.pow(alphaDecay, targetNode.baseHops || 2);
  let lambda = (targetNode.baseScore / 100.0) * hopFactor * 0.45;

  NODES.filter(n => n.id !== targetNode.id && n.baseScore >= 70).forEach(other => {
    const deltaT = forecastHorizon + 0.5;
    const temporalKernel = Math.exp(-beta * deltaT);
    const dist = haversineKm(targetNode.lat, targetNode.lon, other.lat, other.lon);
    const spatialKernel = Math.exp(-(dist * dist) / (2 * sigmaKm * sigmaKm));
    const markWeight = Math.log1p((other.baseFlow || 100000) / 10000.0);

    lambda += markWeight * temporalKernel * spatialKernel;
  });

  const prob = 1.0 - Math.exp(-lambda * Math.max(1.0, forecastHorizon * 0.5));
  const dynamicScore = Math.min(99, Math.max(12, Math.round(prob * 100)));
  const projectedFlow = Math.round(targetNode.baseFlow * (prob / (targetNode.baseScore / 100.0)));

  return {
    intensity: lambda.toFixed(3),
    probability: prob.toFixed(3),
    score: dynamicScore,
    projectedFlow: projectedFlow
  };
}

function getRiskColor(score) {
  if (score >= 80) return "#ef4444";
  if (score >= 65) return "#f97316";
  if (score >= 40) return "#eab308";
  if (score >= 25) return "#06b6d4";
  return "#10b981";
}

function recalculateHawkesEngine(horizonHours) {
  if (!map) return;
  currentHorizon = horizonHours;
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  NODES.forEach(n => {
    const metrics = evaluateNodeIntensity(n, horizonHours);
    const c = getRiskColor(metrics.score);
    const isP0 = metrics.score >= 80;

    if (isP0) {
      const outerRing = L.circleMarker([n.lat, n.lon], {
        radius: 20 + Math.min(8, horizonHours * 0.3),
        fillColor: c,
        color: c,
        weight: 1,
        opacity: 0.35,
        fillOpacity: 0.15
      }).addTo(map);
      markers.push(outerRing);
    }

    const glyph = L.circleMarker([n.lat, n.lon], {
      radius: isP0 ? 9 : 6,
      fillColor: c,
      color: "#ffffff",
      weight: 1.5,
      opacity: 0.95,
      fillOpacity: 0.9
    }).addTo(map);

    glyph.bindTooltip(`<b>${n.name}</b><br>Score: ${metrics.score} | Flow: ₹${metrics.projectedFlow.toLocaleString("en-IN")}`, { className: "font-mono" });
    glyph.on("click", () => {
      activeNode = n;
      updateContextDrawer(n, metrics);
    });
    markers.push(glyph);

    if (activeNode.id === n.id) {
      updateContextDrawer(n, metrics);
    }
  });
}

function updateContextDrawer(node, metrics) {
  const color = getRiskColor(metrics.score);

  document.getElementById("ctxTitle").innerText = `CONTEXT: ${node.name}`;
  document.getElementById("ctxScore").innerHTML = `${metrics.score} <small>/ 100</small>`;

  const badge = document.getElementById("ctxBadge");
  badge.innerText = metrics.score >= 80 ? "VERY HIGH RISK" : (metrics.score >= 65 ? "HIGH RISK" : (metrics.score >= 40 ? "MEDIUM RISK" : "LOW RISK"));
  badge.style.background = color;

  document.getElementById("ctxWindow").innerText = currentHorizon === 0 ? "NOW (Immediate Lead)" : `+${currentHorizon}h Window`;
  document.getElementById("ctxHold").innerText = `₹${metrics.projectedFlow.toLocaleString("en-IN")}`;

  const fDiv = document.getElementById("ctxFactors");
  if (fDiv) fDiv.innerHTML = node.factors.map(f => `<span class="pill">${f}</span>`).join("");

  const spark = document.querySelector(".sparkline");
  if (spark) {
    const basePoints = [
      [0, 26], [14, 24], [28, 28], [42, 20], [56, 22],
      [70, Math.max(4, 30 - Math.round(metrics.score * 0.28))],
      [84, Math.max(2, 26 - Math.round(metrics.score * 0.32))],
      [100, Math.max(2, 32 - Math.round(metrics.score * 0.35))]
    ];
    spark.innerHTML = `<polyline points="${basePoints.map(p => p.join(",")).join(" ")}" fill="none" stroke="${color}" stroke-width="2.2" />`;
  }
}

function populateAlertsFromIngest() {
  const tbody = document.querySelector("#pane-alerts tbody");
  if (!tbody) return;

  const topNodes = [...NODES].sort((a, b) => b.baseScore - a.baseScore).slice(0, 5);
  tbody.innerHTML = topNodes.map((n, i) => `
    <tr>
      <td class="font-mono">10:${22 - i * 3}:14</td>
      <td style="color:${getRiskColor(n.baseScore)};font-weight:700;">${n.baseScore >= 80 ? 'TIER 1 (P0)' : 'TIER 2 (P1)'}</td>
      <td><b>${n.name}</b></td>
      <td class="font-mono">₹${n.baseFlow.toLocaleString("en-IN")}</td>
      <td style="color:#eab308">HC-RAJ-AUG26 Disputed Lien</td>
    </tr>
  `).join("");
}

function recenterMap() { if (map) map.setView([22.5, 79.5], 4.8); }
function toggleLayer() {
  const on = document.getElementById("chkRisk").checked;
  markers.forEach(m => on ? m.addTo(map) : map.removeLayer(m));
}
function refreshLayers() { recalculateHawkesEngine(parseInt(document.getElementById("hzRange").value)); }

function onSliderMove(val) {
  const h = parseInt(val);
  document.querySelectorAll(".tick").forEach(t => t.classList.remove("active"));
  if (h <= 0) document.getElementById("tk-0")?.classList.add("active");
  else if (h <= 2) document.getElementById("tk-2")?.classList.add("active");
  else if (h <= 6) document.getElementById("tk-6")?.classList.add("active");
  else document.getElementById("tk-24")?.classList.add("active");

  const conf = Math.max(54, 86 - Math.round(h * 1.35));
  document.getElementById("confRate").innerText = `${conf}%`;

  recalculateHawkesEngine(h);
}

function setHorizon(h) {
  document.getElementById("hzRange").value = h;
  onSliderMove(h);
}

function togglePlayback() {
  const btn = document.getElementById("playBtn");
  if (isPlaying) {
    clearInterval(playTimer);
    isPlaying = false;
    btn.innerText = "▷";
  } else {
    isPlaying = true;
    btn.innerText = "❚❚";
    playTimer = setInterval(() => {
      let r = document.getElementById("hzRange");
      let nextVal = (parseInt(r.value) + 2);
      if (nextVal > 24) nextVal = 0;
      r.value = nextVal;
      onSliderMove(nextVal);
    }, 1200);
  }
}

// --- RELIABLE ROUTER (PRESERVES MAP TILES) ---
const TITLES = {
  "risk-map": ["RISK MAP OVERVIEW", "Real-time Predictive Risk Intelligence"],
  "qr": ["QR FORENSIC ANALYSIS", "Optical Hardware Sensor & Payload Check"],
  "alerts": ["ALERTS LIVE FEED", "Tier-1 & Tier-2 Intercept Advisories"],
  "entities": ["ENTITIES & MULE NETWORKS", "Suspect Registry & Linked Accounts"],
  "transactions": ["TRANSACTIONS & FINANCIAL FLOW", "Attenuated Decay Topology"],
  "dashboard": ["DASHBOARD OVERVIEW", "National Macro Ingestion Telemetry"],
  "reports": ["INTELLIGENCE REPORTS", "High Court Proportionality Audits"],
  "system": ["SYSTEM SETTINGS", "Role-Based Access Controls"]
};

function switchTab(k) {
  // Update sidebar selection
  document.querySelectorAll(".rail-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-v") === k);
  });

  // Toggle active pane class
  document.querySelectorAll(".view-pane").forEach(el => {
    el.classList.remove("active");
  });

  const target = document.getElementById("pane-" + k);
  if (target) {
    target.classList.add("active");
  }

  // Update top title
  const meta = TITLES[k] || ["COMMAND CONSOLE", "Operational View"];
  document.getElementById("viewHeading").innerText = meta[0];
  document.getElementById("viewSub").innerText = meta[1];

  // Invalidate and force Leaflet tile redraw if switching to map
  if (k === "risk-map") {
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
        recalculateHawkesEngine(currentHorizon);
      }
    }, 200);
  }

  // Stop camera if navigating away from QR tab
  if (k !== "qr" && isCamActive) {
    stopCamera();
  }
}

// --- OPTICAL QR CAMERA ENGINE ---
async function toggleCamera() { isCamActive ? stopCamera() : startCamera(); }

async function startCamera() {
  const tag = document.getElementById("sensorTag");
  const video = document.getElementById("qrVideo");
  const btn = document.getElementById("camBtn");
  tag.innerText = "Accessing rear lens...";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    isCamActive = true;
    btn.innerText = "Stop Sensor";
    tag.innerText = "Sensor Active • Align QR";

    codeReader = new ZXing.BrowserQRCodeReader();
    codeReader.decodeFromVideoElement(video, (res) => {
      if (res) {
        document.getElementById("qrUri").value = res.getText();
        tag.innerText = "Payload Captured!";
        runQRAnalysis();
      }
    });
  } catch (err) {
    tag.innerText = "Camera restricted. Tap 'Snap with Camera'";
    alert("Live video permission restricted on mobile browser. Tap 'Snap with Camera' to snap directly!");
    stopCamera();
  }
}

function stopCamera() {
  if (codeReader) { codeReader.reset(); codeReader = null; }
  const v = document.getElementById("qrVideo");
  if (v && v.srcObject) {
    v.srcObject.getTracks().forEach(t => t.stop());
    v.srcObject = null;
  }
  document.getElementById("sensorTag").innerText = "Sensor Standby";
  document.getElementById("camBtn").innerText = "Start Camera";
  isCamActive = false;
}

function decodeSnap(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.src = e.target.result;
    img.onload = function() {
      new ZXing.BrowserQRCodeReader().decodeFromImage(img).then(res => {
        document.getElementById("qrUri").value = res.getText();
        document.getElementById("sensorTag").innerText = "Snapshot Decoded!";
        runQRAnalysis();
      }).catch(() => alert("No QR code detected. Retake closer with focus."));
    };
  };
  reader.readAsDataURL(file);
}

function loadScamDemo() {
  document.getElementById("qrUri").value = "upi://pay?pa=refund-nodal09@icici&pn=HPCL_Cashback_Refund&am=18900&cu=INR";
  runQRAnalysis();
}

async function runQRAnalysis() {
  const uri = document.getElementById("qrUri").value;
  const out = document.getElementById("qrOutput");
  out.innerHTML = "<span style=\"color:#38bdf8\">Evaluating heuristics against NPCI rules...</span>";

  try {
    const res = await fetch("/api/verify-qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uri })
    });
    const d = await res.json();
    out.innerHTML = `
      <div style="color:${d.verdict === "FLAGGED_FRAUD_RISK" ? "#ef4444" : "#10b981"}; font-weight:bold; margin-bottom:4px;">
        VERDICT: ${d.verdict}
      </div>
      <div>CONFIDENCE: <strong>${d.risk_score}</strong></div>
      <div style="margin:2px 0;">PAYEE: ${d.payee} | VPA: ${d.vpa}</div>
      <div style="color:#38bdf8;">OUTBOUND AMOUNT: ₹${d.amount}</div>
      <ul style="margin:6px 0 0 14px; color:${d.verdict === "FLAGGED_FRAUD_RISK" ? "#fca5a5" : "#86efac"}; font-size:8px;">
        ${d.reasons.map(r => `<li>${r}</li>`).join("")}
      </ul>
    `;
  } catch (err) {
    out.innerHTML = "<span style=\"color:#ef4444\">Backend API unreachable.</span>";
  }
}

// --- OPTION 3: SECTION 102 BNSS / HC REPORT GENERATOR ---
function exportCompliancePDF() {
  const metrics = evaluateNodeIntensity(activeNode, currentHorizon);
  const nowStr = new Date().toISOString();
  const reportRef = `AIR-I4C-${Date.now().toString().slice(-6)}`;

  const linked = INGESTED_COMPLAINTS.filter(c => c.target_terminal_id === activeNode.id);
  const compListHtml = linked.length > 0
    ? linked.slice(0, 3).map(c => `
        <li style="margin-bottom: 4px;">
          <b>${c.ack_no}</b> | Disputed: ₹${c.disputed_amount_inr.toLocaleString("en-IN")} | Hops: ${c.hop_count} (α^${c.hop_count})<br>
          <span style="font-size: 8px; color: #555;">Lineage: ${c.victim_vpa} &rarr; ${c.layer_1_mule} &rarr; ${c.layer_2_mule}</span>
        </li>
      `).join("")
    : `<li>NCRP-2026-991823 | Disputed: ₹${metrics.projectedFlow.toLocaleString("en-IN")} | Hops: 2 (α² = 0.176)<br><span style="font-size: 8px; color: #555;">Lineage: victim@okbank &rarr; mule_l1@paytm &rarr; target_terminal</span></li>`;

  const printElem = document.createElement("div");
  printElem.style.padding = "24px";
  printElem.style.fontFamily = "Arial, sans-serif";
  printElem.style.color = "#111";
  printElem.style.background = "#fff";
  printElem.style.fontSize = "10px";
  printElem.style.lineHeight = "1.4";

  printElem.innerHTML = `
    <div style="border-bottom: 2px solid #003366; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <h2 style="margin: 0; font-size: 14px; color: #003366; letter-spacing: 0.5px;">INDIAN CYBER CRIME COORDINATION CENTRE (I4C)</h2>
        <div style="font-size: 9px; color: #555; font-weight: bold;">CIS DIVISION • NATIONAL PREDICTIVE MITIGATION UNIT</div>
      </div>
      <div style="text-align: right; font-family: monospace; font-size: 9px;">
        REF: <b>${reportRef}</b><br>
        DATE: ${nowStr.split("T")[0]}
      </div>
    </div>

    <div style="background: #f4f6f9; border: 1px solid #dcdfe6; padding: 8px 12px; margin-bottom: 14px; border-radius: 4px;">
      <h3 style="margin: 0 0 6px 0; font-size: 11px; color: #003366;">ACTIONABLE INTERCEPT DOSSIER (FORECAST LEAD)</h3>
      <table style="width: 100%; font-size: 9px; border-collapse: collapse;">
        <tr>
          <td style="padding: 3px 0;"><b>Target Terminal:</b> ${activeNode.name}</td>
          <td style="padding: 3px 0;"><b>Terminal ID:</b> ${activeNode.id}</td>
        </tr>
        <tr>
          <td style="padding: 3px 0;"><b>Coordinates:</b> ${activeNode.lat.toFixed(4)}, ${activeNode.lon.toFixed(4)}</td>
          <td style="padding: 3px 0;"><b>Predicted Window:</b> +${currentHorizon} Hours Lead Time</td>
        </tr>
        <tr>
          <td style="padding: 3px 0;"><b>Hawkes Hazard Intensity:</b> ${metrics.intensity} hr⁻¹</td>
          <td style="padding: 3px 0;"><b>Event Probability:</b> ${metrics.probability} (Score: ${metrics.score}/100)</td>
        </tr>
      </table>
    </div>

    <div style="margin-bottom: 14px;">
      <h4 style="margin: 0 0 4px 0; font-size: 10px; color: #003366; text-transform: uppercase;">1. Evidentiary Lineage & Contributing NCRP Chains</h4>
      <ul style="margin: 0; padding-left: 16px; font-family: monospace; font-size: 9px;">
        ${compListHtml}
      </ul>
    </div>

    <div style="border: 1px solid #c8a200; background: #fffdf2; padding: 10px; border-radius: 4px; margin-bottom: 16px;">
      <h4 style="margin: 0 0 4px 0; font-size: 10px; color: #8a6d00;">2. STATUTORY MANDATE & PROPORTIONALITY LIMITS (HC-RAJ-AUG26)</h4>
      <p style="margin: 0; font-size: 8.5px; color: #5c4800; line-height: 1.35;">
        In strict conformance with Section 102 CrPC / BNSS guidelines affirmed by the Rajasthan High Court (Aug 20, 2026), 
        any proactive account or terminal lien is <b>RESTRICTED EXCLUSIVELY TO THE DISPUTED AMOUNT</b> capped at 
        <b>₹${metrics.projectedFlow.toLocaleString("en-IN")}</b>. Blanket freezes or full account suspensions at intermediate 
        mule tiers are legally prohibited under this order.
      </p>
    </div>

    <div style="border-top: 1px dashed #bbb; padding-top: 8px; display: flex; justify-content: space-between; font-size: 8px; color: #777;">
      <div>DISPATCHED TO: JURISDICTIONAL POLICE CELL / BANK NODAL WATCH</div>
      <div>SECURITY CLEARANCE: LEA RESTRICTED • NON-PUBLIC</div>
    </div>
  `;

  const opt = {
    margin: 10,
    filename: `${reportRef}_Dossier.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  };

  html2pdf().set(opt).from(printElem).save();
}
// --- PATH A: INTERACTIVE MONEY TRAIL (DAG) ENGINE ---
const DAG_GRAPH = {
  nodes: [
    { id: "VIC-01", label: "victim_vpa@okaxis", role: "VICTIM (ORIGIN)", hop: 0, x: 70, y: 215, color: "#10b981", inflow: "₹0", suspicion: 0.05, lien: "Victim account. Protected under RBI mandate." },
    { id: "M1-A", label: "mule_tier1_A@paytm", role: "LAYER 1 MULE (SPLITTER)", hop: 1, x: 230, y: 110, color: "#f97316", inflow: "₹2,20,000", suspicion: 0.884, lien: "Lien restricted to ₹2,20,000. Blanket freeze prohibited." },
    { id: "M1-B", label: "mule_tier1_B@icici", role: "LAYER 1 MULE (SPLITTER)", hop: 1, x: 230, y: 320, color: "#f97316", inflow: "₹1,60,000", suspicion: 0.841, lien: "Lien restricted to ₹1,60,000. Blanket freeze prohibited." },
    { id: "M2-1", label: "acc_runner_8891", role: "LAYER 2 AGGREGATOR", hop: 2, x: 420, y: 70, color: "#ef4444", inflow: "₹1,20,000", suspicion: 0.915, lien: "Disputed portion capped at ₹1,20,000." },
    { id: "M2-2", label: "acc_runner_4412", role: "LAYER 2 AGGREGATOR", hop: 2, x: 420, y: 215, color: "#ef4444", inflow: "₹1,50,000", suspicion: 0.932, lien: "Disputed portion capped at ₹1,50,000." },
    { id: "M2-3", label: "acc_runner_7709", role: "LAYER 2 AGGREGATOR", hop: 2, x: 420, y: 355, color: "#ef4444", inflow: "₹1,10,000", suspicion: 0.890, lien: "Disputed portion capped at ₹1,10,000." },
    { id: "ATM-DEST", label: "SBI ATM - Kalkaji B", role: "LIQUIDATION TERMINAL", hop: 3, x: 600, y: 215, color: "#ef4444", inflow: "₹3,80,000", suspicion: 0.982, lien: "Physical cash dispatch point. Intercept advisory dispatched." }
  ],
  edges: [
    { from: "VIC-01", to: "M1-A", amount: "₹2.20L", alpha: "α¹ = 0.42" },
    { from: "VIC-01", to: "M1-B", amount: "₹1.60L", alpha: "α¹ = 0.42" },
    { from: "M1-A", to: "M2-1", amount: "₹1.20L", alpha: "α² = 0.176" },
    { from: "M1-A", to: "M2-2", amount: "₹1.00L", alpha: "α² = 0.176" },
    { from: "M1-B", to: "M2-2", amount: "₹0.50L", alpha: "α² = 0.176" },
    { from: "M1-B", to: "M2-3", amount: "₹1.10L", alpha: "α² = 0.176" },
    { from: "M2-1", to: "ATM-DEST", amount: "₹1.20L", alpha: "α³ = 0.074" },
    { from: "M2-2", to: "ATM-DEST", amount: "₹1.50L", alpha: "α³ = 0.074" },
    { from: "M2-3", to: "ATM-DEST", amount: "₹1.10L", alpha: "α³ = 0.074" }
  ]
};

function renderTransactionDAG() {
  const svg = document.getElementById("txDagSvg");
  if (!svg) return;

  let html = `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" opacity="0.8"/>
    </marker>
  </defs>`;

  // 1. Draw Edges with Flow Labels and Hop Attenuation
  DAG_GRAPH.edges.forEach(e => {
    const src = DAG_GRAPH.nodes.find(n => n.id === e.from);
    const dst = DAG_GRAPH.nodes.find(n => n.id === e.to);
    if (!src || !dst) return;

    const midX = (src.x + dst.x) / 2;
    const midY = (src.y + dst.y) / 2;

    html += `
      <g>
        <line x1="${src.x}" y1="${src.y}" x2="${dst.x}" y2="${dst.y}" stroke="#1e3a5f" stroke-width="1.8" marker-end="url(#arrow)" />
        <rect x="${midX - 28}" y="${midY - 11}" width="56" height="15" fill="#040813" stroke="#15263d" rx="2" />
        <text x="${midX}" y="${midY}" fill="#38bdf8" font-size="7.5" font-family="monospace" text-anchor="middle" dominant-baseline="central">${e.amount}</text>
      </g>
    `;
  });

  // 2. Draw Nodes
  DAG_GRAPH.nodes.forEach(n => {
    const isEnd = n.hop === 3;
    const isStart = n.hop === 0;

    html += `
      <g style="cursor:pointer;" onclick="selectDagNode('${n.id}')">
        <!-- Outer glow ring -->
        <circle cx="${n.x}" cy="${n.y}" r="${isEnd ? 18 : (isStart ? 15 : 13)}" fill="${n.color}" opacity="0.18" />
        <!-- Core circle -->
        <circle cx="${n.x}" cy="${n.y}" r="${isEnd ? 10 : 8}" fill="${n.color}" stroke="#ffffff" stroke-width="1.5" />
        <!-- Node label text -->
        <text x="${n.x}" y="${n.y + 20}" fill="#ffffff" font-size="8" font-family="monospace" font-weight="bold" text-anchor="middle">${n.label}</text>
        <text x="${n.x}" y="${n.y + 30}" fill="#7e91a7" font-size="7" font-family="monospace" text-anchor="middle">${n.role}</text>
      </g>
    `;
  });

  svg.innerHTML = html;
  selectDagNode("M1-A");
}

function selectDagNode(nodeId) {
  const node = DAG_GRAPH.nodes.find(n => n.id === nodeId);
  if (!node) return;

  const idEl = document.getElementById("dagNodeId");
  const roleEl = document.getElementById("dagNodeRole");
  const inEl = document.getElementById("dagInflow");
  const suspEl = document.getElementById("dagSuspicion");
  const hopEl = document.getElementById("dagHopFactor");
  const lienEl = document.getElementById("dagLienText");

  if (idEl) idEl.innerText = node.label;
  if (roleEl) {
    roleEl.innerText = node.role;
    roleEl.style.color = node.color;
  }
  if (inEl) inEl.innerText = node.inflow;
  if (suspEl) {
    suspEl.innerText = node.suspicion.toFixed(3);
    suspEl.style.color = node.suspicion >= 0.85 ? "var(--c-very-high)" : (node.suspicion >= 0.5 ? "var(--c-medium)" : "var(--c-safe)");
  }
  if (hopEl) {
    const factor = Math.pow(0.42, node.hop).toFixed(4);
    hopEl.innerHTML = `&alpha;<sup>${node.hop}</sup> = ${factor} (Hop ${node.hop})`;
  }
  if (lienEl) lienEl.innerText = node.lien;
}

// Hook DAG render into tab switcher
const origSwitchTab = window.switchTab;
window.switchTab = function(k) {
  origSwitchTab(k);
  if (k === "transactions") {
    setTimeout(renderTransactionDAG, 100);
  }
};

// --- PATH B: SUSPECT CLUSTER & MULE RING ENGINE ---
const ENTITY_DATA = {
  suspects: [
    {
      id: "SUS-01",
      name: 'Tariq @ "Ghost_Ops"',
      uid: "SUS-2026-DL-8819",
      x: 340, y: 215,
      color: "#ef4444",
      vpaCount: "6 Accounts",
      riskAmount: "₹18,40,000",
      hardware: "IMEI: 864219044819201<br>MAC: 4A:2B:99:C1:F2:10<br>SIM: +91 98711 00291 (Delhi)",
      watched: false,
      nodes: [
        { id: "PH-1", label: "+91 98711 00291", type: "PHONE", x: 170, y: 120, color: "#38bdf8" },
        { id: "DEV-1", label: "OnePlus Nord (IMEI: 8642...)", type: "DEVICE", x: 170, y: 310, color: "#06b6d4" },
        { id: "ACC-1", label: "mule_tier1_A@paytm", type: "VPA", x: 510, y: 110, color: "#f97316" },
        { id: "ACC-2", label: "acc_runner_8891@sbi", type: "VPA", x: 520, y: 215, color: "#f97316" },
        { id: "ACC-3", label: "refund-nodal09@icici", type: "VPA", x: 510, y: 320, color: "#ef4444" }
      ]
    },
    {
      id: "SUS-02",
      name: 'Arjun M. @ "CashRunner"',
      uid: "SUS-2026-MH-4412",
      x: 340, y: 215,
      color: "#f97316",
      vpaCount: "3 Accounts",
      riskAmount: "₹9,20,000",
      hardware: "IMEI: 359182049102844<br>MAC: 1E:88:41:A2:88:99<br>SIM: +91 99201 44812 (Mumbai)",
      watched: false,
      nodes: [
        { id: "PH-2", label: "+91 99201 44812", type: "PHONE", x: 170, y: 160, color: "#38bdf8" },
        { id: "DEV-2", label: "Redmi 12 (IMEI: 3591...)", type: "DEVICE", x: 170, y: 270, color: "#06b6d4" },
        { id: "ACC-4", label: "mule_tier1_B@icici", type: "VPA", x: 510, y: 160, color: "#f97316" },
        { id: "ACC-5", label: "acc_runner_4412@kotak", type: "VPA", x: 510, y: 270, color: "#ef4444" }
      ]
    }
  ]
};

let currentSuspect = ENTITY_DATA.suspects[0];

function renderEntityCluster() {
  const svg = document.getElementById("entityClusterSvg");
  if (!svg) return;

  let html = `<defs>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>`;

  // Draw Edges connecting Suspect Central Node to its linked peripherals
  currentSuspect.nodes.forEach(sub => {
    html += `
      <line x1="${currentSuspect.x}" y1="${currentSuspect.y}" x2="${sub.x}" y2="${sub.y}" stroke="#162942" stroke-width="1.6" stroke-dasharray="3,3" />
    `;
  });

  // Draw Peripheral Nodes (Phones, Devices, VPAs)
  currentSuspect.nodes.forEach(sub => {
    html += `
      <g style="cursor:pointer;" onclick="alert('Peripheral Selected: ${sub.label}\\nType: ${sub.type}')">
        <circle cx="${sub.x}" cy="${sub.y}" r="11" fill="#040812" stroke="${sub.color}" stroke-width="1.8" />
        <text x="${sub.x}" y="${sub.y + 19}" fill="#ffffff" font-size="8" font-family="monospace" text-anchor="middle">${sub.label}</text>
        <text x="${sub.x}" y="${sub.y + 28}" fill="#7e91a7" font-size="7" font-family="monospace" text-anchor="middle">[${sub.type}]</text>
      </g>
    `;
  });

  // Draw Central Primary Suspect Node
  html += `
    <g style="cursor:pointer;" filter="url(#glow)">
      <circle cx="${currentSuspect.x}" cy="${currentSuspect.y}" r="26" fill="${currentSuspect.color}" opacity="0.2" />
      <circle cx="${currentSuspect.x}" cy="${currentSuspect.y}" r="16" fill="${currentSuspect.color}" stroke="#ffffff" stroke-width="2" />
      <text x="${currentSuspect.x}" y="${currentSuspect.y + 36}" fill="#ffffff" font-size="9" font-family="monospace" font-weight="bold" text-anchor="middle">${currentSuspect.name}</text>
      <text x="${currentSuspect.x}" y="${currentSuspect.y + 46}" fill="var(--accent-cyan)" font-size="7.5" font-family="monospace" text-anchor="middle">PRIMARY SUSPECT CORE</text>
    </g>
  `;

  svg.innerHTML = html;
  loadSuspectProfile(currentSuspect);
}

function loadSuspectProfile(sus) {
  currentSuspect = sus;
  const nameEl = document.getElementById("entProfileName");
  const uidEl = document.getElementById("entProfileId");
  const vpaEl = document.getElementById("entVpaCount");
  const riskEl = document.getElementById("entRiskAmount");
  const hwEl = document.getElementById("entHardware");
  const btnWatch = document.getElementById("btnWatchlistToggle");

  if (nameEl) nameEl.innerText = sus.name;
  if (uidEl) uidEl.innerText = `UID: ${sus.uid}`;
  if (vpaEl) vpaEl.innerText = sus.vpaCount;
  if (riskEl) riskEl.innerText = sus.riskAmount;
  if (hwEl) hwEl.innerHTML = sus.hardware;

  if (btnWatch) {
    btnWatch.innerText = sus.watched ? "REMOVE FROM WATCHLIST" : "ADD TO NATIONAL WATCHLIST";
    btnWatch.className = sus.watched ? "act-btn" : "act-btn primary";
  }
}

function toggleSuspectWatch() {
  currentSuspect.watched = !currentSuspect.watched;
  loadSuspectProfile(currentSuspect);
  alert(`CFCFRMS status updated: ${currentSuspect.name} is now ${currentSuspect.watched ? "ACTIVE on National Watchlist" : "REMOVED from Watchlist"}.`);
}

function filterEntityRings(query) {
  const q = (query || "").toLowerCase();
  const match = ENTITY_DATA.suspects.find(s => 
    s.name.toLowerCase().includes(q) || 
    s.nodes.some(n => n.label.toLowerCase().includes(q))
  );

  if (match) {
    currentSuspect = match;
    renderEntityCluster();
  }
}

// Hook into router to render when clicking ENTITIES tab
const existingSwitchTab = window.switchTab;
window.switchTab = function(k) {
  existingSwitchTab(k);
  if (k === "entities") {
    setTimeout(renderEntityCluster, 100);
  }
};

// --- PATH C: HACKATHON PITCH & JUDGE DEMO MODE ---
let isDemoRunning = false;

function setDemoStatus(text) {
  const banner = document.getElementById("demoBanner");
  const stepText = document.getElementById("demoStepText");
  if (banner && stepText) {
    banner.style.display = "block";
    stepText.innerText = text;
  }
}

function clearDemoStatus() {
  const banner = document.getElementById("demoBanner");
  if (banner) banner.style.display = "none";
}

async function runJudgePitchDemo() {
  if (isDemoRunning) return;
  isDemoRunning = true;
  const demoBtn = document.getElementById("btnRunDemo");
  if (demoBtn) {
    demoBtn.disabled = true;
    demoBtn.innerText = "SIMULATION IN PROGRESS...";
  }

  const delay = ms => new Promise(res => setTimeout(res, ms));

  try {
    // --- STAGE 1: CITIZEN QR INTAKE ---
    setDemoStatus("1/5: CITIZEN QR INTAKE & HEURISTIC AUDIT");
    switchTab("qr");
    await delay(1200);

    const qrInput = document.getElementById("qrUri");
    if (qrInput) qrInput.value = "upi://pay?pa=refund-nodal09@icici&pn=HPCL_Cashback_Refund&am=18900&cu=INR";
    await runQRAnalysis();
    await delay(2200);

    // --- STAGE 2: TIER-1 WITHDRAWAL ALERTS FEED ---
    setDemoStatus("2/5: TIER-1 FIELD DISPATCH & 1930 SYNC");
    switchTab("alerts");
    await delay(2200);

    // --- STAGE 3: HAWKES RISK MAP DIFFUSION ---
    setDemoStatus("3/5: HAWKES PROCESS SPATIAL EXPANSION (+2H)");
    switchTab("risk-map");
    await delay(1000);

    setHorizon(2);
    const targetNode = NODES.find(n => n.id === "DL-01") || NODES[0];
    if (map) {
      map.flyTo([targetNode.lat, targetNode.lon], 7, { duration: 1.5 });
    }
    await delay(1800);

    // --- STAGE 4: CONTEXT DRAWER & STATUTORY COMPLIANCE ---
    setDemoStatus("4/5: SECTION 102 CRPC LIEN CEILING ENFORCEMENT");
    activeNode = targetNode;
    const metrics = evaluateNodeIntensity(targetNode, 2);
    updateContextDrawer(targetNode, metrics);
    await delay(2400);

    // --- STAGE 5: AUTOMATED COMPLIANCE DOSSIER EXPORT ---
    setDemoStatus("5/5: GENERATING RAJASTHAN HC COMPLIANT PDF");
    exportCompliancePDF();
    await delay(1500);

    setDemoStatus("SIMULATION COMPLETE • SYSTEM STABLE");
    await delay(3000);
  } catch (err) {
    console.error("Demo failed:", err);
  } finally {
    clearDemoStatus();
    isDemoRunning = false;
    if (demoBtn) {
      demoBtn.disabled = false;
      demoBtn.innerText = "RUN LIVE SIMULATION ▷";
    }
  }
}

// --- PHASE 1: MACRO TELEMETRY STREAM RENDERER ---
function renderDashboardFeed() {
  const tbody = document.getElementById("dashboardStreamBody");
  if (!tbody) return;

  const records = INGESTED_COMPLAINTS.length > 0 ? INGESTED_COMPLAINTS.slice(0, 10) : [
    { ack_no: "NCRP-2026-104812", timestamp: "10:24:10", victim_vpa: "user_891@okaxis", target_terminal_id: "ATM-DL-01", disputed_amount_inr: 380000, hop_count: 2 },
    { ack_no: "NCRP-2026-104811", timestamp: "10:22:45", victim_vpa: "sharma_v@icici", target_terminal_id: "ATM-MH-01", disputed_amount_inr: 640000, hop_count: 1 },
    { ack_no: "NCRP-2026-104810", timestamp: "10:20:12", victim_vpa: "merchant_ops@paytm", target_terminal_id: "ATM-KA-01", disputed_amount_inr: 420000, hop_count: 2 },
    { ack_no: "NCRP-2026-104809", timestamp: "10:18:33", victim_vpa: "arun_traders@sbi", target_terminal_id: "ATM-UP-01", disputed_amount_inr: 210000, hop_count: 3 },
    { ack_no: "NCRP-2026-104808", timestamp: "10:15:02", victim_vpa: "retail_desk@axis", target_terminal_id: "ATM-DL-04", disputed_amount_inr: 520000, hop_count: 2 },
    { ack_no: "NCRP-2026-104807", timestamp: "10:11:19", victim_vpa: "gupta_p@kotak", target_terminal_id: "ATM-MH-02", disputed_amount_inr: 490000, hop_count: 2 }
  ];

  tbody.innerHTML = records.map(r => `
    <tr>
      <td class="font-mono" style="color:var(--accent-cyan);">${r.ack_no}</td>
      <td class="font-mono">${r.timestamp.includes("T") ? r.timestamp.split("T")[1].replace("Z", "") : r.timestamp}</td>
      <td class="font-mono">${r.victim_vpa}</td>
      <td><b>${r.target_terminal_id}</b></td>
      <td class="font-mono" style="color:#fff; font-weight:bold;">₹${r.disputed_amount_inr.toLocaleString("en-IN")}</td>
      <td class="font-mono" style="color:${r.hop_count <= 2 ? 'var(--c-very-high)' : 'var(--c-medium)'};">&alpha;<sup>${r.hop_count}</sup> (Hop ${r.hop_count})</td>
    </tr>
  `).join("");
}

// Hook into router to render when clicking DASHBOARD tab
const prevSwitchTab = window.switchTab;
window.switchTab = function(k) {
  prevSwitchTab(k);
  if (k === "dashboard") {
    setTimeout(renderDashboardFeed, 100);
  }
};

// --- PHASE 2: SYSTEM ADMIN & CALIBRATION ENGINE ---
let HAWKES_PARAMS = {
  beta: 1.38,
  sigma: 350.0,
  alpha: 0.42
};

let IS_STRICT_BNSS_MANDATE = true;

function updateHawkesParam(param, value) {
  const val = parseFloat(value);
  HAWKES_PARAMS[param] = val;

  if (param === "beta") {
    const el = document.getElementById("valBeta");
    if (el) el.innerText = `${val.toFixed(2)} hr⁻¹`;
  } else if (param === "sigma") {
    const el = document.getElementById("valSigma");
    if (el) el.innerText = `${Math.round(val)} km`;
  } else if (param === "alpha") {
    const el = document.getElementById("valAlpha");
    if (el) el.innerText = val.toFixed(2);
  }

  // Recalibrate current map state immediately with new parameters
  recalculateHawkesEngine(currentHorizon);
}

function toggleLienPolicy(isStrict) {
  IS_STRICT_BNSS_MANDATE = isStrict;
  const exp = document.getElementById("policyExplanation");
  if (!exp) return;

  if (isStrict) {
    exp.style.color = "var(--c-safe)";
    exp.innerHTML = "ACTIVE: Partial disputed lien strictly enforced under Section 102 BNSS / CrPC. Blanket freezing of intermediate accounts is blocked.";
  } else {
    exp.style.color = "var(--c-very-high)";
    exp.innerHTML = "WARNING: Blanket freeze mode enabled. This violates the August 2026 Rajasthan High Court mandate prohibiting non-proportional liens.";
  }
}

function resetSystemDefaults() {
  HAWKES_PARAMS = { beta: 1.38, sigma: 350.0, alpha: 0.42 };
  
  const bEl = document.getElementById("rngBeta");
  const sEl = document.getElementById("rngSigma");
  const aEl = document.getElementById("rngAlpha");
  
  if (bEl) { bEl.value = 1.38; updateHawkesParam("beta", 1.38); }
  if (sEl) { sEl.value = 350; updateHawkesParam("sigma", 350); }
  if (aEl) { aEl.value = 0.42; updateHawkesParam("alpha", 0.42); }
  
  const chk = document.getElementById("chkStrictLien");
  if (chk) { chk.checked = true; toggleLienPolicy(true); }
  
  alert("System parameters restored to operational defaults.");
}

// --- REPORTS VIEW: AUDIT ARCHIVE & DOSSIER PREVIEW ---
const ARCHIVED_REPORTS = [
  { ref: "AIR-I4C-992014", time: "10:20:12", terminal: "SBI ATM - Kalkaji B-Block, New Delhi", lien: "₹3,80,000", mandate: "Sec 102 BNSS / HC-RAJ", status: "DISPATCHED" },
  { ref: "AIR-I4C-991823", time: "10:14:40", terminal: "Axis Bank - Bandra West, Mumbai", lien: "₹6,40,000", mandate: "Sec 102 BNSS / HC-RAJ", status: "DISPATCHED" },
  { ref: "AIR-I4C-990941", time: "09:48:19", terminal: "HDFC ATM - Hazratganj, Lucknow", lien: "₹2,10,000", mandate: "Sec 102 BNSS / HC-RAJ", status: "CONFIRMED" },
  { ref: "AIR-I4C-989201", time: "08:32:05", terminal: "SBI E-Corner - Koramangala, BLR", lien: "₹4,20,000", mandate: "Sec 102 BNSS / HC-RAJ", status: "CONFIRMED" },
  { ref: "AIR-I4C-988410", time: "07:19:54", terminal: "Canara ATM - Pari Chowk, Gr. Noida", lien: "₹3,10,000", mandate: "Sec 102 BNSS / HC-RAJ", status: "CONFIRMED" }
];

function renderReportsArchive() {
  const tbody = document.getElementById("reportsTableBody");
  if (!tbody) return;

  tbody.innerHTML = ARCHIVED_REPORTS.map(r => `
    <tr>
      <td class="font-mono" style="color:var(--accent-cyan); font-weight:bold;">${r.ref}</td>
      <td class="font-mono">${r.time}</td>
      <td><b>${r.terminal}</b></td>
      <td class="font-mono" style="color:var(--c-safe); font-weight:bold;">${r.lien}</td>
      <td style="color:#eab308; font-size:8px;">${r.mandate}</td>
      <td>
        <button class="cbtn" onclick="selectReportPreview('${r.ref}')" style="padding:2px 6px; font-size:7.5px;">VIEW</button>
      </td>
    </tr>
  `).join("");

  selectReportPreview(ARCHIVED_REPORTS[0].ref);
}

function selectReportPreview(ref) {
  const report = ARCHIVED_REPORTS.find(r => r.ref === ref) || ARCHIVED_REPORTS[0];
  const targetEl = document.getElementById("repPreviewTarget");
  const lienEl = document.getElementById("repPreviewLien");
  const leadEl = document.getElementById("repPreviewLead");

  if (targetEl) targetEl.innerText = report.terminal;
  if (lienEl) lienEl.innerText = report.lien;
  if (leadEl) leadEl.innerText = `+${currentHorizon}h Horizon`;
}

// Hook into router to render when clicking REPORTS tab
const existingReportsSwitchTab = window.switchTab;
window.switchTab = function(k) {
  existingReportsSwitchTab(k);
  if (k === "reports") {
    setTimeout(renderReportsArchive, 100);
  }
};

// --- TACTICAL PALETTE & THEME CONTROLLER ---
const THEMES = ["cobalt", "emerald", "amber", "crimson", "monolith"];

function setAppTheme(themeName) {
  // 1. Remove all existing theme classes from body
  THEMES.forEach(t => document.body.classList.remove(`theme-${t}`));

  // 2. Add selected class (default cobalt uses base :root variables)
  if (themeName !== "cobalt") {
    document.body.classList.add(`theme-${themeName}`);
  }

  // 3. Highlight the active button in the system panel
  THEMES.forEach(t => {
    const btn = document.getElementById(`th-${t}`);
    if (btn) {
      if (t === themeName) {
        btn.style.borderColor = "var(--accent-cyan)";
        btn.style.color = "var(--accent-cyan)";
        btn.style.fontWeight = "bold";
      } else {
        btn.style.borderColor = "var(--border)";
        btn.style.color = "var(--text-muted)";
        btn.style.fontWeight = "normal";
      }
    }
  });

  // 4. Save preference in local storage
  try {
    localStorage.setItem("le_command_theme", themeName);
  } catch (e) {}

  // 5. Trigger graph redraws to harmonize colors
  if (typeof renderTransactionDAG === "function") renderTransactionDAG();
  if (typeof renderEntityCluster === "function") renderEntityCluster();
}

// Restore saved theme on startup
window.addEventListener("DOMContentLoaded", () => {
  try {
    const saved = localStorage.getItem("le_command_theme");
    if (saved && THEMES.includes(saved)) {
      setAppTheme(saved);
    }
  } catch (e) {}
});

