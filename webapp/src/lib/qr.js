// QR helpers (F3): demo URI generators, QR image rendering, and the local
// BLOCK PAYEE list (explicitly labelled as localStorage-backed).

export const DEMO_URIS = {
  FRAUD: {
    label: "FRAUD sample",
    uri: "upi://pay?pa=refund-nodal09@icici&pn=Refund%20Desk&am=49999&tn=KYC%20refund%20verify%20now",
  },
  LEGIT: {
    label: "LEGIT sample",
    uri: "upi://pay?pa=coffeehouse@okhdfcbank&pn=Coffee%20House&am=250&tn=Order%20123&tr=9876543210",
  },
};

/** Render a UPI URI to a PNG data URL. */
export async function makeQrDataUrl(text) {
  const mod = await import("qrcode");
  const QR = mod.default || mod;
  return QR.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
    color: { dark: "#0b1220", light: "#e8f6ff" },
  });
}

/** Best-effort extraction of the payee VPA (pa) from a UPI URI. */
export function payeeFromUri(uri) {
  try {
    const q = new URLSearchParams(String(uri).split("?", 2)[1] || "");
    return q.get("pa") || "";
  } catch (err) {
    return "";
  }
}

/* ---------------- BLOCK PAYEE (localStorage, labeled) ---------------- */

export const BLOCKED_STORE = ["nir", "blocked", "payees"].join("-");

export function readBlocked() {
  try {
    const raw = localStorage.getItem(BLOCKED_STORE);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

export function writeBlocked(list) {
  try {
    localStorage.setItem(BLOCKED_STORE, JSON.stringify(list || []));
  } catch (err) {
    /* storage blocked */
  }
}
