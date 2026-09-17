// The 11 NIRAKSHAN terminals — coordinates, baseline metrics and risk factors
// ported verbatim from the legacy console (public/app.js NODES table).
export const NODES = [
  { id: "DL-01", name: "DELHI (DL-01)", city: "Delhi", zone: "North", lat: 28.6139, lon: 77.209, baseScore: 85, baseFlow: 380000, baseHops: 2, factors: ["High UPI Anomaly", "New QR Spike", "Shell Accounts", "Velocity Change"] },
  { id: "SGR-01", name: "SRINAGAR (JK-01)", city: "Srinagar", zone: "North", lat: 34.0837, lon: 74.7973, baseScore: 32, baseFlow: 45000, baseHops: 4, factors: ["Low Dormancy Reactivation", "Normal Flow"] },
  { id: "LKO-01", name: "LUCKNOW (UP-01)", city: "Lucknow", zone: "North", lat: 26.8467, lon: 80.9462, baseScore: 72, baseFlow: 210000, baseHops: 2, factors: ["New QR Spike", "Layer-2 Mule Inflow"] },
  { id: "JAI-01", name: "JAIPUR (RJ-01)", city: "Jaipur", zone: "North", lat: 26.9124, lon: 75.7873, baseScore: 28, baseFlow: 30000, baseHops: 3, factors: ["Controlled Flow", "Isolated Run"] },
  { id: "AMD-01", name: "AHMEDABAD (GJ-01)", city: "Ahmedabad", zone: "West", lat: 23.0225, lon: 72.5714, baseScore: 68, baseFlow: 185000, baseHops: 2, factors: ["Surge Inflow", "Typosquatted VPA"] },
  { id: "IND-01", name: "INDORE (MP-01)", city: "Indore", zone: "Central", lat: 22.7196, lon: 75.8577, baseScore: 45, baseFlow: 95000, baseHops: 3, factors: ["Secondary Cluster", "Velocity Change"] },
  { id: "MUM-01", name: "MUMBAI (MH-01)", city: "Mumbai", zone: "West", lat: 19.076, lon: 72.8777, baseScore: 92, baseFlow: 640000, baseHops: 1, factors: ["High UPI Anomaly", "Shell Account Fanout", "Offsite ATM Run"] },
  { id: "HYD-01", name: "HYDERABAD (TS-01)", city: "Hyderabad", zone: "South", lat: 17.385, lon: 78.4867, baseScore: 81, baseFlow: 310000, baseHops: 2, factors: ["Pre-filled Debit QR", "Mule Swarm"] },
  { id: "BLR-01", name: "BENGALURU (KA-01)", city: "Bengaluru", zone: "South", lat: 12.9716, lon: 77.5946, baseScore: 84, baseFlow: 420000, baseHops: 2, factors: ["High UPI Anomaly", "New QR Spike", "Transit Dispersion"] },
  { id: "CCU-01", name: "KOLKATA (WB-01)", city: "Kolkata", zone: "East", lat: 22.5726, lon: 88.3639, baseScore: 76, baseFlow: 260000, baseHops: 2, factors: ["Border Lineage", "Layering Delay"] },
  { id: "MAA-01", name: "CHENNAI (TN-01)", city: "Chennai", zone: "South", lat: 13.0827, lon: 80.2707, baseScore: 62, baseFlow: 140000, baseHops: 3, factors: ["Merchant POS Fraud", "ATM Clustering"] },
];

export const INDIA_CENTER = [22.5, 79.5];
export const INDIA_ZOOM = 4.8;

export const NODE_BY_ID = NODES.reduce((acc, n) => {
  acc[n.id] = n;
  return acc;
}, {});

/** F2 LIVE CHASE sequence — verbatim from public/chase.js. */
export const CHASE_SEQ = [
  ["DL-01", "JAI-01", 220000, 1],
  ["DL-01", "MUM-01", 160000, 1],
  ["JAI-01", "BLR-01", 120000, 2],
  ["JAI-01", "HYD-01", 100000, 2],
  ["MUM-01", "LKO-01", 160000, 2],
  ["BLR-01", "BLR-01", 120000, 3],
  ["HYD-01", "MUM-01", 100000, 3],
  ["LKO-01", "DL-01", 160000, 3],
];

export const CHASE_VICTIM_INR = 380000;

export const BASEMAPS = {
  dark: {
    label: "Dark Ops (ESRI)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 16,
  },
  satellite: {
    label: "Satellite (ESRI)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 18,
  },
  streets: {
    label: "Streets (OSM)",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
  },
};

export const LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

export const TERRAIN_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}";
