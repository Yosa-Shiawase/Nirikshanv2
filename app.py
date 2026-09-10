"""NIRAKSHAN v4 — static + live API + anomaly AI + SMS (all routes, rebuilt clean)."""
import os, json, sqlite3, time, random, threading, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", 8080))
PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
NTFY_TOPIC = os.environ.get("NTFY_TOPIC", "").strip()
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT = os.environ.get("TELEGRAM_CHAT_ID", "")

DB_LOCK = threading.Lock()
DB = sqlite3.connect("live_data.db", check_same_thread=False)
DB.execute("""CREATE TABLE IF NOT EXISTS complaints(
  ack_no TEXT, ts TEXT, victim_vpa TEXT, target_terminal_id TEXT,
  disputed_amount_inr INTEGER, hop_count INTEGER, source TEXT)""")
DB.execute("""CREATE TABLE IF NOT EXISTS atm_cache(
  node_id TEXT PRIMARY KEY, fetched_at REAL, payload TEXT)""")
DB.execute("""CREATE TABLE IF NOT EXISTS sms(
  ts TEXT, sender TEXT, text TEXT, verdict TEXT, risk INTEGER)""")
DB.commit()

TERMINALS = ["DL-01","MUM-01","BLR-01","HYD-01","LKO-01","JAI-01","SGR-01",
             "AMD-01","IND-01","CCU-01","MAA-01"]
WEIGHTS = [22,20,12,9,8,6,3,6,5,5,4]
VPAS = ["rahul.k","priya_s","arun_t","meena.b","vikram99","shop_no4","geeta.dev",
        "anil_88","qshop.mart","fastag.recharge","krishna.traders","sahil_99"]
DOMS = ["okaxis","icici","paytm","ybl","sbi","okhdfcbank"]
CLIENTS = []; CL_LOCK = threading.Lock()
RECENT = []; RECENT_LOCK = threading.Lock()
ANOM = {}
AMTS = [4999,18900,42500,78000,120000,185000,240000]

def broadcast(obj):
    line = ("data: " + json.dumps(obj) + "\n\n").encode()
    with CL_LOCK:
        dead = []
        for c in CLIENTS:
            try: c["w"].write(line); c["w"].flush()
            except Exception: dead.append(c)
        for d in dead: CLIENTS.remove(d)

def record_complaint(c):
    with DB_LOCK:
        DB.execute("INSERT INTO complaints VALUES(?,?,?,?,?,?,?)",
            (c["ack_no"], c["timestamp"], c["victim_vpa"], c["target_terminal_id"],
             c["disputed_amount_inr"], c["hop_count"], c["source"]))
        DB.commit()
    now = time.time()
    with RECENT_LOCK:
        RECENT.append((now, c["target_terminal_id"], c["disputed_amount_inr"]))
        while RECENT and now - RECENT[0][0] > 3600: RECENT.pop(0)
        c30 = sum(1 for t,term,_ in RECENT if t > now-30 and term==c["target_terminal_id"])
    st = ANOM.setdefault(c["target_terminal_id"], {"ewma":1.0,"last":0})
    st["ewma"] = 0.8*st["ewma"] + 0.2*min(c30,20)
    if c30 >= 5 and c30 > st["ewma"]*2.2 and now - st["last"] > 60:
        st["last"] = now
        broadcast({"type":"anomaly","terminal_id":c["target_terminal_id"],
                   "count_30s":c30,"baseline":round(st["ewma"],1),
                   "note":"EWMA burst detector (threshold 2.2x baseline)"})

def emit(term=None, source="SIM"):
    amt = int(random.choice(AMTS) * random.uniform(.8,1.25))
    c = {"ack_no": "NCRP-2026-%d" % random.randint(104813,999999),
         "timestamp": time.strftime("%H:%M:%S"),
         "victim_vpa": random.choice(VPAS)+"@"+random.choice(DOMS),
         "target_terminal_id": term or random.choices(TERMINALS, weights=WEIGHTS)[0],
         "disputed_amount_inr": amt, "hop_count": random.choice([1,2,2,3,3,4]),
         "source": source}
    record_complaint(c); broadcast(c)

def simulator():
    while True:
        emit()
        if random.random() < 0.055:
            t = random.choices(TERMINALS, weights=WEIGHTS)[0]
            for _ in range(random.randint(5,9)):
                time.sleep(random.uniform(.15,.5)); emit(t)
        time.sleep(random.uniform(2.5,6))

KNOWN_HANDLES = {"okaxis","okhdfcbank","okicici","oksbi","okbizaxis","paytm","ybl","ibl",
  "apl","axisbank","icici","sbi","hdfcbank","kotak","idfcbank","pnb","barodampay",
  "cnrb","unionbankofindia","au","fam","airtel","jupiter","federal","yesbank"}
BAD_WORDS = ["refund","cashback","kyc","lottery","bonus","verify","wallet update",
             "tax","customs","customer care","manager","official","insurance lapsed"]
WATCHLIST = {"fraud@upi","refund-nodal09@icici","kyc-update2024@ybl","win-kyc99@paytm"}

def verify_qr(uri):
    try: q = urllib.parse.parse_qs(uri.split("?",1)[1])
    except Exception: return {"verdict":"INVALID_URI","risk_score":0,
                              "matched_rules":[],"reasons":["Not a parseable UPI URI"]}
    pa=(q.get("pa") or [""])[0]; pn=(q.get("pn") or [""])[0]
    am=(q.get("am") or [""])[0]; tn=(q.get("tn") or [""])[0]
    handle = pa.split("@")[1].lower() if "@" in pa else ""
    score, rules, reasons = 0, [], []
    def hit(pts, code, msg):
        nonlocal score
        score += pts; rules.append(code); reasons.append(msg)
    if pa.lower() in WATCHLIST: hit(60,"WL-HIT","VPA on internal fraud watchlist")
    if not pa: reasons.append("Missing payee VPA (pa)")
    if handle and handle not in KNOWN_HANDLES:
        hit(15,"PSP-UNKNOWN","Handle '@%s' not a registered PSP handle" % handle)
    low = (pn+" "+tn).lower()
    for w in BAD_WORDS:
        if w in low: hit(45,"SE-PHRASE","Social-engineering keyword: '%s'" % w); break
    if am:
        hit(15,"AMT-PRE","Amount pre-filled (Rs.%s) — unsolicited push" % am)
        if am.isdigit() and int(am) >= 50000: hit(10,"AMT-HIGH","High-value demand (>=50k)")
    if handle and pa.split("@")[0].isdigit() and len(pa.split("@")[0]) >= 8:
        hit(10,"VPA-NUMHEAP","Numeric-heap personal VPA pattern")
    if not q.get("tr"): reasons.append("No transaction reference (tr) — traceability gap")
    score = min(99, score)
    verdict = "FLAGGED_FRAUD_RISK" if score>=45 else ("SAFE_WITH_CAUTION" if score>=20 else "LIKELY_LEGIT")
    return {"verdict":verdict,"risk_score":score,"payee":pn,"vpa":pa,
            "amount":am or "0","matched_rules":rules,"reasons":reasons}

SMS_RULES = [
    (25, ["kyc","e-kyc","re-kyc","account blocked","account suspended",
          "will be blocked","block your","expire","suspended"]),
    (25, ["otp","one time password","share your pin"]),
    (30, ["lottery","lucky draw","prize","you have won","won rs","kbc"]),
    (20, ["refund","cashback","upi failed","reverse the amount","unblock","fake","unauthorized","failed transaction"]),
    (25, ["anydesk","teamviewer","screen share","download app",
          "download the app","apk file"]),
    (20, ["click here","bit.ly","tinyurl","tiny.cc","http://","https://"]),
    (15, ["income tax","cbdt","electricity","disconnected","power cut",
          "gas booking","insurance lapsed"]),
    (10, ["customer care","helpline","whatsapp us","call now"]),
]

CASE_TRACE = {
  "case_id": "NCRP-2026-991823",
  "stolen_inr": 380000,
  "victim": "victim_891@okaxis",
  "layers": [
    {"hop": 0, "label": "Victim account", "amount": 380000, "vpas": ["victim_891@okaxis"]},
    {"hop": 1, "label": "Layer-1 splitters", "amount": 380000,
     "vpas": ["mule_tier1_A@paytm", "mule_tier1_B@icici"]},
    {"hop": 2, "label": "Layer-2 aggregators", "amount": 340000,
     "vpas": ["acc_runner_8891@sbi", "acc_runner_4412@kotak", "acc_runner_7709@ybl"]},
    {"hop": 3, "label": "Cash-out ATMs", "amount": 310000,
     "vpas": ["DL-01", "MUM-01", "BLR-01"]}
  ]
}

def score_sms(sender, text):
    t = (text or "").lower(); score = 0; hits = []
    for pts, words in SMS_RULES:
        for w in words:
            if w in t:
                score += pts; hits.append(w); break
    if sender:
        if sender.lower().startswith("+92") or sender.lower().startswith("92"):
            score += 25; hits.append("foreign sender")
        elif sum(c.isdigit() for c in sender) >= 10:
            score += 10; hits.append("numeric sender")
    score = min(99, score)
    verdict = "SMS_FRAUD_ALERT" if score >= 45 else ("SMS_SUSPICIOUS" if score >= 20 else "SMS_INFO")
    return {"verdict": verdict, "risk_score": score, "matched": hits,
            "sender": sender or "unknown", "text": (text or "")[:200]}

def ntfy_push(title, body, click=None):
    if not NTFY_TOPIC: return
    try:
        data = (title + "\n" + body).encode("utf-8")
        req = urllib.request.Request("https://ntfy.sh/" + NTFY_TOPIC,
            data=data, headers={"Priority": "high", "Tags": "rotating_light"})
        urllib.request.urlopen(req, timeout=10)
        print("[ntfy] pushed to topic:", repr(NTFY_TOPIC), "|", title, flush=True)
    except Exception as ex:
        print("[ntfy] failed:", ex, flush=True)

def tg_push(title, body):
    if not (TELEGRAM_TOKEN and TELEGRAM_CHAT): return
    try:
        u = ("https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage?"
             + urllib.parse.urlencode({"chat_id": TELEGRAM_CHAT,
             "text": "\U0001F6A8 " + title + "\n" + body}))
        urllib.request.urlopen(u, timeout=10)
        print("[tg] pushed:", title, flush=True)
    except Exception as ex:
        print("[tg] failed:", ex, flush=True)

def tg_send(chat_id, text):
    try:
        u = ("https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage?"
             + urllib.parse.urlencode({"chat_id": chat_id, "text": text}))
        urllib.request.urlopen(u, timeout=10)
    except Exception as ex:
        print("[tg] reply failed:", ex, flush=True)

def telegram_listener():
    """Citizen-report channel: anyone who messages the bot gets scored,
    the operator gets alarmed, the reporter gets a verdict reply."""
    if not (TELEGRAM_TOKEN and TELEGRAM_CHAT):
        print("[tg-listener] disabled (no token/chat)"); return
    offset = 0
    while True:
        try:
            u = ("https://api.telegram.org/bot" + TELEGRAM_TOKEN
                 + "/getUpdates?timeout=25&offset=%d" % offset)
            data = json.loads(urllib.request.urlopen(u, timeout=35).read())
            for upd in data.get("result", []):
                offset = upd["update_id"] + 1
                msg = upd.get("message") or {}
                txt = msg.get("text") or ""
                chat = msg.get("chat") or {}
                cid = chat.get("id")
                if not txt or cid is None: continue
                frm = str((msg.get("from") or {}).get("username")
                          or (msg.get("from") or {}).get("first_name") or "tg-user")
                r = sms_process(frm, txt, "tg-in")
                col = "FRAUD" if r["risk_score"] >= 45 else ("SUSPICIOUS" if r["risk_score"] >= 20 else "OK")
                reply = ("\U0001F6E1 NIRAKSHAN SMS report received.\n"
                         "Verdict: %s (risk %d/100)\n"
                         "Matched rules: %s\n"
                         "Forwarded to command console.") % (
                         r["verdict"], r["risk_score"],
                         ", ".join(r["matched"]) or "none")
                tg_send(cid, reply)
                print("[tg-in] from %r score %d (%s)" % (frm, r["risk_score"], col), flush=True)
        except Exception as ex:
            time.sleep(5)

def sms_process(frm, txt, tag):
    r = score_sms(frm, txt)
    r["type"] = "sms_alert"; r["ts"] = time.strftime("%H:%M:%S")
    with DB_LOCK:
        DB.execute("INSERT INTO sms VALUES(?,?,?,?,?)",
            (r["ts"], r["sender"], r["text"], r["verdict"], r["risk_score"]))
        DB.commit()
    broadcast(r)
    print("[%s] from %r score %d %s text %r" % (tag, r["sender"],
          r["risk_score"], r["verdict"], r["text"][:100]), flush=True)
    if r["risk_score"] >= 45:
        ntfy_push("SMS FRAUD ALERT (" + str(r["risk_score"]) + ")",
                  r["text"][:120] + " | From: " + r["sender"])
        tg_push("SMS FRAUD ALERT (" + str(r["risk_score"]) + ")", r["text"][:120])
    elif r["risk_score"] >= 20:
        ntfy_push("SMS suspicious (" + str(r["risk_score"]) + ")", r["text"][:120])
        tg_push("SMS suspicious (" + str(r["risk_score"]) + ")", r["text"][:120])
    return r

OVERPASS = ["https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter"]

def get_atms(node_id, lat, lon, r):
    with DB_LOCK:
        row = DB.execute("SELECT fetched_at,payload FROM atm_cache WHERE node_id=?",(node_id,)).fetchone()
    if row and time.time()-row[0] < 21600: return {"atms": json.loads(row[1])}
    q = ('[out:json][timeout:60];('
         'node(around:%d,%f,%f)["amenity"="atm"];way(around:%d,%f,%f)["amenity"="atm"];'
         'node(around:%d,%f,%f)["amenity"="bank"];way(around:%d,%f,%f)["amenity"="bank"];);out center 80;'
         ) % (r,lat,lon,r,lat,lon,r,lat,lon,r,lat,lon)
    last = "no attempt"
    for ep in OVERPASS:
        try:
            req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data":q}).encode(),
                                         headers={"User-Agent":"NirakshanSIH/1.0"})
            raw = json.loads(urllib.request.urlopen(req, timeout=75).read())
            out = []
            for e in raw.get("elements", []):
                c = e.get("center") or {}
                la, lo = e.get("lat", c.get("lat")), e.get("lon", c.get("lon"))
                if la is None or lo is None: continue
                t = e.get("tags", {})
                out.append({"name": t.get("name") or t.get("operator") or "ATM",
                            "operator": t.get("operator",""), "lat": la, "lon": lo})
            if not out: last = ep+" 0 elements"; continue
            with DB_LOCK:
                DB.execute("INSERT OR REPLACE INTO atm_cache VALUES(?,?,?)",
                           (node_id,time.time(),json.dumps(out))); DB.commit()
            return {"atms": out}
        except Exception as ex: last = "%s -> %s" % (ep, ex)
    return {"atms": [], "error": last}

def ai_briefing():
    now = time.time()
    with RECENT_LOCK: rows = list(RECENT)
    per = {}
    for t,term,amt in rows:
        d = per.setdefault(term, {"n":0,"inr":0}); d["n"]+=1; d["inr"]+=amt
    hot = sorted(per.items(), key=lambda kv:-kv[1]["n"])[:3]
    anomalous = [k for k,v in ANOM.items() if time.time()-v["last"] < 300]
    top = ", ".join("%s(%d evt, Rs.%d)" % (k, v["n"], v["inr"]) for k,v in hot) or "no data yet"
    fact = ("Live NCRP-sim stream, last 60 min: total=%d events, Rs.%d disputed. "
            "Hot terminals: %s. Active burst anomalies: %s. "
            "Draft a <=120-word LE situation briefing. Lines starting with '- '. "
            "End with one recommended Section-102 action.") % (
            sum(v["n"] for _,v in per.items()), sum(v["inr"] for _,v in per.items()),
            top, ", ".join(anomalous) or "none")
    if GEMINI_KEY:
        try:
            body = json.dumps({"contents":[{"parts":[{"text":fact}]}]}).encode()
            req = urllib.request.Request(
              "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key="+GEMINI_KEY,
              data=body, headers={"Content-Type":"application/json"})
            r = json.loads(urllib.request.urlopen(req, timeout=20).read())
            return {"engine":"gemini-1.5-flash","text":r["candidates"][0]["content"]["parts"][0]["text"].strip()}
        except Exception as ex:
            fact += " [LLM unavailable: %s]" % ex
    burst = ("ACTIVE BURST: %s — treat as coordinated cash-out." % ", ".join(anomalous)) if anomalous else "No burst anomalies in last 5 min."
    return {"engine":"rules-v1","text":
      "- Window: %d events / Rs.%d disputed in last 60 min.\n"
      "- Hot terminals: %s.\n- %s\n- Recommended Sec-102 action: cap liens at disputed value on top terminal; alert bank nodal for ATM pre-positioning." % (
        sum(v["n"] for _,v in per.items()), sum(v["inr"] for _,v in per.items()), top, burst)}

MIME = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
        ".css":"text/css; charset=utf-8",".png":"image/png",".json":"application/json",
        ".svg":"image/svg+xml",".ico":"image/x-icon"}

class H(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Headers","Content-Type")
        self.send_header("Access-Control-Allow-Methods","GET,POST,OPTIONS")
    def do_OPTIONS(self): self.send_response(204); self._cors(); self.end_headers()
    def _json(self,obj,code=200):
        b=json.dumps(obj).encode(); self.send_response(code)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(b))); self._cors(); self.end_headers()
        self.wfile.write(b)
    def _static(self,path):
        if path in ("/",""): path="/index.html"
        fp=os.path.normpath(os.path.join(PUBLIC,path.lstrip("/")))
        if not fp.startswith(PUBLIC) or not os.path.isfile(fp):
            return self._json({"error":"nf"},404)
        body=open(fp,"rb").read()
        self.send_response(200)
        self.send_header("Content-Type",MIME.get(os.path.splitext(fp)[1].lower(),"application/octet-stream"))
        self.send_header("Content-Length",str(len(body)))
        self.send_header("Cache-Control","no-cache"); self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        self.path = self.path.strip().rstrip("/") or "/"
        p = urllib.parse.urlparse(self.path)
        if p.path == "/events":
            self.send_response(200)
            self.send_header("Content-Type","text/event-stream")
            self.send_header("Cache-Control","no-cache"); self._cors(); self.end_headers()
            self.wfile.write(b"retry: 3000\n\n"); self.wfile.flush()
            c={"w":self.wfile}
            with CL_LOCK: CLIENTS.append(c)
            try:
                while True: time.sleep(5)
            except Exception:
                with CL_LOCK:
                    if c in CLIENTS: CLIENTS.remove(c)
        elif p.path == "/sms":
            q = urllib.parse.parse_qs(p.query)
            r = sms_process(q.get("from",[""])[0], q.get("text",[""])[0], "sms")
            self._json(r)
        elif p.path == "/atms":
            q = urllib.parse.parse_qs(p.query)
            res = get_atms(q.get("node",[""])[0], float(q.get("lat",[22.5])[0]),
                           float(q.get("lon",[79.5])[0]), int(q.get("r",[6000])[0]))
            res["source"] = "OpenStreetMap/Overpass (LIVE)"
            self._json(res)
        elif p.path == "/case/trace":
            now = time.time()
            with RECENT_LOCK:
                rows = [(t, term, amt) for (t, term, amt) in RECENT if now - t < 1800]
            seen = {}
            for t, term, amt in rows:
                d = seen.setdefault(term, {"events": 0, "inr": 0, "last_seen": t})
                d["events"] += 1; d["inr"] += amt; d["last_seen"] = max(d["last_seen"], t)
            layers = []
            for L in CASE_TRACE["layers"]:
                live = []
                for v in L["vpas"]:
                    if v in seen:
                        d = seen[v]
                        live.append({"id": v, "events": d["events"], "inr": d["inr"],
                                     "minutes_ago": int((now - d["last_seen"]) / 60)})
                layers.append(dict(L, live=live))
self._json({"case": CASE_TRACE, "layers": layers,
                        "window_min": 30, "total_live_events": len(rows)})
        elif p.path == "/case/trace":
            now = time.time()
            with RECENT_LOCK:
                rows = [(t, term, amt) for (t, term, amt) in RECENT if now - t < 1800]
            seen = {}
            for t, term, amt in rows:
                d = seen.setdefault(term, {"events": 0, "inr": 0, "last_seen": t})
                d["events"] += 1; d["inr"] += amt
                d["last_seen"] = max(d["last_seen"], t)
            layers = []
            for L in CASE_TRACE["layers"]:
                live = []
                for v in L["vpas"]:
                    if v in seen:
                        d = seen[v]
                        live.append({"id": v, "events": d["events"],
                            "inr": d["inr"], "minutes_ago": int((now - d["last_seen"]) / 60)})
        elif p.path == "/ai/briefing":
            self._json(ai_briefing())
        elif p.path == "/health":
            self._json({"ok": True, "clients": len(CLIENTS),
                        "ntfy": ("set" if NTFY_TOPIC else "NOT SET")})
        else:
            self._static(p.path)
    def do_POST(self):
        self.path = self.path.strip().rstrip("/")
        n = int(self.headers.get("Content-Length",0) or 0)
        body = self.rfile.read(n)
        if self.path == "/ingest-sms":
            try:
                d = json.loads(body)
                r = sms_process(str(d.get("from","")), str(d.get("text","")), "ingest-sms")
            except Exception:
                return self._json({"error":"bad json"},400)
            self._json(r)
        elif self.path == "/sms-plain":
            raw = body.decode("utf-8","replace")
            if "|" in raw: frm, txt = raw.split("|",1)
            else: frm, txt = "unknown", raw
            r = sms_process(frm.strip(), txt, "sms-plain")
            self._json(r)
        elif self.path in ("/qr/verify","/api/verify-qr"):
            try: self._json(verify_qr(json.loads(body).get("uri","")))
            except Exception: self._json({"error":"bad json"},400)
        elif self.path == "/ingest":
            try: c = json.loads(body)
            except Exception: return self._json({"error":"bad json"},400)
            c.setdefault("source","WEB"); c.setdefault("timestamp", time.strftime("%H:%M:%S"))
            c.setdefault("hop_count",2); c.setdefault("ack_no","MANUAL-%d"%int(time.time()))
            record_complaint(c); broadcast(c); self._json({"ok":True})
        else:
            print("[404 POST]", repr(self.path), flush=True)
            self._json({"error":"nf"},404)

if __name__ == "__main__":
    threading.Thread(target=simulator, daemon=True).start()
    threading.Thread(target=telegram_listener, daemon=True).start()
    print("NIRAKSHAN v4 on :%d | LLM:%s | ntfy:%s" % (PORT,
          "gemini" if GEMINI_KEY else "rules",
          NTFY_TOPIC or "unset"), flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
