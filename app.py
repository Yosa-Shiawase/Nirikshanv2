"""NIRAKSHAN unified server — static frontend + live API in one process. stdlib only."""
import os, json, sqlite3, time, random, threading, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", 8080))
PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

DB_LOCK = threading.Lock()
DB = sqlite3.connect("live_data.db", check_same_thread=False)
DB.execute("""CREATE TABLE IF NOT EXISTS complaints(
  ack_no TEXT, ts TEXT, victim_vpa TEXT, target_terminal_id TEXT,
  disputed_amount_inr INTEGER, hop_count INTEGER, source TEXT)""")
DB.execute("""CREATE TABLE IF NOT EXISTS atm_cache(
  node_id TEXT PRIMARY KEY, fetched_at REAL, payload TEXT)""")
DB.commit()

TERMINALS = ["DL-01","MUM-01","BLR-01","HYD-01","LKO-01","JAI-01","SGR-01",
             "AMD-01","IND-01","CCU-01","MAA-01"]
VPAS = ["rahul.k","priya_s","arun_t","meena.b","vikram99","shop_no4","geeta.dev","anil_88"]
DOMS = ["okaxis","icici","paytm","ybl","sbi","okhdfcbank"]
CLIENTS = []; CL_LOCK = threading.Lock()

def broadcast(obj):
    line = ("data: " + json.dumps(obj) + "\n\n").encode()
    with CL_LOCK:
        dead = []
        for c in CLIENTS:
            try: c["w"].write(line); c["w"].flush()
            except Exception: dead.append(c)
        for d in dead: CLIENTS.remove(d)

def insert_complaint(c):
    with DB_LOCK:
        DB.execute("INSERT INTO complaints VALUES(?,?,?,?,?,?,?)",
            (c["ack_no"], c["timestamp"], c["victim_vpa"], c["target_terminal_id"],
             c["disputed_amount_inr"], c["hop_count"], c["source"]))
        DB.commit()

def simulator():
    n = 104812
    while True:
        n += 1
        amt = int(random.choice([4999, 18900, 42500, 78000, 120000, 185000, 240000]) * random.uniform(.8, 1.2))
        c = {"ack_no": "NCRP-2026-%d" % n,
             "timestamp": time.strftime("%H:%M:%S"),
             "victim_vpa": random.choice(VPAS) + "@" + random.choice(DOMS),
             "target_terminal_id": random.choice(TERMINALS),
             "disputed_amount_inr": amt,
             "hop_count": random.choice([1,2,2,3,3,4]),
             "source": "SIM"}
        insert_complaint(c); broadcast(c)
        time.sleep(random.uniform(3, 7))

KNOWN_HANDLES = {"okaxis","okhdfcbank","okicici","oksbi","okbizaxis","paytm","ybl","ibl",
  "apl","axisbank","icici","sbi","hdfcbank","kotak","idfcbank","pnb","barodampay",
  "cnrb","unionbankofindia","au","fam","airtel","jupiter","federal","yesbank"}
BAD_WORDS = ["refund","cashback","kyc","lottery","bonus","verify","wallet update","tax","customs"]

def verify_qr(uri):
    try: q = urllib.parse.parse_qs(uri.split("?",1)[1])
    except Exception: return {"verdict":"INVALID_URI","risk_score":0,"reasons":["Not a UPI URI"]}
    pa = (q.get("pa") or [""])[0]; pn = (q.get("pn") or [""])[0]
    am = (q.get("am") or [""])[0]; tn = (q.get("tn") or [""])[0]
    handle = pa.split("@")[1].lower() if "@" in pa else ""
    score, reasons = 0, []
    if not pa: reasons.append("Missing payee VPA (pa)")
    if handle and handle not in KNOWN_HANDLES:
        score += 15; reasons.append("Handle '@%s' not a registered PSP handle" % handle)
    low = (pn + " " + tn).lower()
    for w in BAD_WORDS:
        if w in low: score += 45; reasons.append("Social-engineering keyword: '%s'" % w); break
    if am:
        score += 15; reasons.append("Amount pre-filled (Rs.%s) — unsolicited push risk" % am)
    if handle and pa.split("@")[0].isdigit() and len(pa.split("@")[0]) >= 8:
        score += 10; reasons.append("Numeric-heap personal VPA pattern")
    if not q.get("tr"): reasons.append("No transaction reference (tr)")
    score = min(99, score)
    verdict = "FLAGGED_FRAUD_RISK" if score >= 45 else ("SAFE_WITH_CAUTION" if score >= 20 else "LIKELY_LEGIT")
    return {"verdict": verdict, "risk_score": score, "payee": pn, "vpa": pa,
            "amount": am or "0", "reasons": reasons}

OVERPASS = ["https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter"]

def get_atms(node_id, lat, lon, r):
    with DB_LOCK:
        row = DB.execute("SELECT fetched_at,payload FROM atm_cache WHERE node_id=?",(node_id,)).fetchone()
    if row and time.time() - row[0] < 21600:
        return {"atms": json.loads(row[1])}
    q = ('[out:json][timeout:60];('
         'node(around:%d,%f,%f)["amenity"="atm"];'
         'way(around:%d,%f,%f)["amenity"="atm"];'
         'node(around:%d,%f,%f)["amenity"="bank"];'
         'way(around:%d,%f,%f)["amenity"="bank"];);out center 80;') % (r,lat,lon,r,lat,lon,r,lat,lon,r,lat,lon)
    last = "no attempt made"
    for ep in OVERPASS:
        try:
            req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode(),
                                         headers={"User-Agent": "NirakshanSIH/1.0"})
            raw = json.loads(urllib.request.urlopen(req, timeout=75).read())
            out = []
            for e in raw.get("elements", []):
                c = e.get("center") or {}
                la, lo = e.get("lat", c.get("lat")), e.get("lon", c.get("lon"))
                if la is None or lo is None: continue
                t = e.get("tags", {})
                out.append({"name": t.get("name") or t.get("operator") or "ATM",
                            "operator": t.get("operator",""), "lat": la, "lon": lo})
            if not out:
                last = ep + " returned 0 elements"; continue
            with DB_LOCK:
                DB.execute("INSERT OR REPLACE INTO atm_cache VALUES(?,?,?)",(node_id,time.time(),json.dumps(out))); DB.commit()
            return {"atms": out}
        except Exception as ex:
            last = "%s -> %s" % (ep, ex)
    return {"atms": [], "error": last}

MIME = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
        ".css":"text/css; charset=utf-8", ".png":"image/png", ".json":"application/json",
        ".svg":"image/svg+xml", ".ico":"image/x-icon", ".map":"application/json"}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Headers","Content-Type")
        self.send_header("Access-Control-Allow-Methods","GET,POST,OPTIONS")
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def _json(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(b))); self._cors(); self.end_headers()
        self.wfile.write(b)
    def _static(self, path):
        if path in ("/", ""): path = "/index.html"
        fp = os.path.normpath(os.path.join(PUBLIC, path.lstrip("/")))
        if not fp.startswith(PUBLIC) or not os.path.isfile(fp):
            return self._json({"error":"not found"},404)
        ext = os.path.splitext(fp)[1].lower()
        with open(fp,"rb") as f: body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        if p.path == "/events":
            self.send_response(200)
            self.send_header("Content-Type","text/event-stream")
            self.send_header("Cache-Control","no-cache"); self._cors()
            self.end_headers()
            self.wfile.write(b"retry: 3000\n\n"); self.wfile.flush()
            c = {"w": self.wfile}
            with CL_LOCK: CLIENTS.append(c)
            try:
                while True: time.sleep(5)
            except Exception:
                with CL_LOCK:
                    if c in CLIENTS: CLIENTS.remove(c)
        elif p.path == "/atms":
            q = urllib.parse.parse_qs(p.query)
            res = get_atms(q.get("node",[""])[0], float(q.get("lat",[22.5])[0]),
                           float(q.get("lon",[79.5])[0]), int(q.get("r",[6000])[0]))
            res["source"] = "OpenStreetMap/Overpass (LIVE)"
            self._json(res)
        elif p.path == "/health":
            self._json({"ok": True, "clients": len(CLIENTS)})
        else:
            self._static(p.path)
    def do_POST(self):
        n = int(self.headers.get("Content-Length",0)); body = self.rfile.read(n)
        if self.path == "/ingest":
            try: c = json.loads(body)
            except Exception: return self._json({"error":"bad json"},400)
            c.setdefault("source","WEB"); c.setdefault("timestamp", time.strftime("%H:%M:%S"))
            c.setdefault("hop_count",2); c.setdefault("ack_no","MANUAL-%d" % int(time.time()))
            insert_complaint(c); broadcast(c); self._json({"ok":True})
        elif self.path in ("/qr/verify", "/api/verify-qr"):
            try: self._json(verify_qr(json.loads(body).get("uri","")))
            except Exception: self._json({"error":"bad json"},400)
        else: self._json({"error":"not found"},404)

if __name__ == "__main__":
    threading.Thread(target=simulator, daemon=True).start()
    print("NIRAKSHAN unified server on port %d" % PORT, flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
