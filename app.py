"""NIRAKSHAN v4 — static + live API + anomaly AI + SMS (all routes, rebuilt clean)."""
import os, json, sqlite3, time, random, threading, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", 8080))
PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
# React app's own public dir (404.html / sw.js) and built dist.
WEBAPP_PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "webapp", "public")
DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "webapp", "dist")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
NTFY_TOPIC = os.environ.get("NTFY_TOPIC", "").strip()
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT = os.environ.get("TELEGRAM_CHAT_ID", "")
INGEST_KEY = os.environ.get("INGEST_KEY", "")
RATE_LIMIT = {"writes": (30, 60), "reads": (120, 60)}
HITS = {}

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
    baseline = st["ewma"]                    # PRE-update baseline
    fired = (c30 >= 5 and c30 > baseline*2.2 and now - st["last"] > 60)
    st["ewma"] = 0.8*baseline + 0.2*min(c30,20)   # update AFTER the test
    if fired:
        st["last"] = now
        broadcast({"type":"anomaly","terminal_id":c["target_terminal_id"],
                   "count_30s":c30,"baseline":round(baseline,1),
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

PSP_NAMES = {"okaxis":"Axis Bank","okhdfcbank":"HDFC Bank","okicici":"ICICI Bank",
  "oksbi":"State Bank of India","okbizaxis":"Axis Bank","paytm":"Paytm Payments Bank",
  "ybl":"Yes Bank","ibl":"IDFC First Bank","apl":"Amazon Pay (Axis)",
  "axisbank":"Axis Bank","icici":"ICICI Bank","sbi":"SBI","hdfcbank":"HDFC Bank",
  "kotak":"Kotak Mahindra Bank","idfcbank":"IDFC First Bank","pnb":"Punjab National Bank",
  "barodampay":"Bank of Baroda","cnrb":"Canara Bank","unionbankofindia":"Union Bank",
  "au":"AU Small Finance Bank","fam":"FamPay","airtel":"Airtel Payments Bank",
  "jupiter":"Jupiter","federal":"Federal Bank","yesbank":"Yes Bank"}

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
    upi_id = pa
    bank = PSP_NAMES.get(handle, "Unknown / non-PSP")
    conf = min(99, max(5, 100 - score)) if score < 45 else max(60, score)
    return {"verdict":verdict,"risk_score":score,"payee":pn,"vpa":pa,
            "amount":am or "0","matched_rules":rules,"reasons":reasons,
            "deep": {"upi_id": upi_id, "psp_handle": handle or "none",
                     "bank": bank, "confidence": conf,
                     "note_text": tn or "-", "has_ref": bool(q.get("tr")),
                     "params_found": sorted(q.keys())}}

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

ATM_CACHE_TTL = 21600
OVERPASS_STATUS_TIMEOUT = 4
OVERPASS_QUERY_TIMEOUT = 15
TOP_RISK_NODE = "MUM-01"  # highest baseline risk (92) in the terminal model
TOP_RISK_LAT, TOP_RISK_LON = 19.076, 72.8777

# Seeded data is intentionally labeled when Overpass is unavailable, but covers
# every monitored city so the degraded map still gives an operator a full view.
FALLBACK_ATMS = [
  # Delhi — 8
  {"name":"SBI ATM - Connaught Place","operator":"State Bank of India","lat":28.6304,"lon":77.2177},
  {"name":"HDFC Bank ATM - Karol Bagh","operator":"HDFC Bank","lat":28.6519,"lon":77.1909},
  {"name":"Axis Bank ATM - Nehru Place","operator":"Axis Bank","lat":28.5521,"lon":77.2517},
  {"name":"ICICI ATM - Nehru Place Metro","operator":"ICICI Bank","lat":28.5494,"lon":77.2519},
  {"name":"Canara Bank ATM - Lajpat Nagar","operator":"Canara Bank","lat":28.5677,"lon":77.2433},
  {"name":"Punjab National Bank ATM - Dwarka","operator":"Punjab National Bank","lat":28.5921,"lon":77.0460},
  {"name":"Kotak Mahindra ATM - Saket","operator":"Kotak Mahindra Bank","lat":28.5245,"lon":77.2066},
  {"name":"Bank of Baroda ATM - Okhla Phase II","operator":"Bank of Baroda","lat":28.5307,"lon":77.2706},
  # Mumbai — 6
  {"name":"SBI ATM - Bandra West","operator":"State Bank of India","lat":19.0596,"lon":72.8295},
  {"name":"HDFC Bank ATM - Andheri East","operator":"HDFC Bank","lat":19.1136,"lon":72.8697},
  {"name":"ICICI Bank ATM - Lower Parel","operator":"ICICI Bank","lat":18.9977,"lon":72.8267},
  {"name":"Axis Bank ATM - Fort","operator":"Axis Bank","lat":18.9358,"lon":72.8356},
  {"name":"Kotak Mahindra ATM - Dadar West","operator":"Kotak Mahindra Bank","lat":19.0180,"lon":72.8430},
  {"name":"Bank of Maharashtra ATM - Powai","operator":"Bank of Maharashtra","lat":19.1176,"lon":72.9060},
  # Bengaluru — 6
  {"name":"SBI ATM - MG Road","operator":"State Bank of India","lat":12.9757,"lon":77.6068},
  {"name":"Kotak Mahindra Bank ATM - Indiranagar","operator":"Kotak Mahindra Bank","lat":12.9784,"lon":77.6408},
  {"name":"HDFC Bank ATM - Koramangala","operator":"HDFC Bank","lat":12.9352,"lon":77.6245},
  {"name":"ICICI Bank ATM - Whitefield","operator":"ICICI Bank","lat":12.9698,"lon":77.7500},
  {"name":"Axis Bank ATM - Jayanagar","operator":"Axis Bank","lat":12.9250,"lon":77.5938},
  {"name":"Canara Bank ATM - Rajajinagar","operator":"Canara Bank","lat":12.9919,"lon":77.5537},
  # Hyderabad — 4
  {"name":"HDFC Bank ATM - Banjara Hills","operator":"HDFC Bank","lat":17.4126,"lon":78.4482},
  {"name":"SBI ATM - Secunderabad","operator":"State Bank of India","lat":17.4399,"lon":78.4983},
  {"name":"ICICI Bank ATM - Gachibowli","operator":"ICICI Bank","lat":17.4401,"lon":78.3489},
  {"name":"Axis Bank ATM - Kukatpally","operator":"Axis Bank","lat":17.4028,"lon":78.4930},
  # Lucknow — 4
  {"name":"Axis Bank ATM - Hazratganj","operator":"Axis Bank","lat":26.8500,"lon":80.9470},
  {"name":"HDFC Bank ATM - Gomti Nagar","operator":"HDFC Bank","lat":26.8544,"lon":81.0198},
  {"name":"ICICI Bank ATM - Aliganj","operator":"ICICI Bank","lat":26.8885,"lon":80.9422},
  {"name":"State Bank ATM - Indira Nagar","operator":"State Bank of India","lat":26.8830,"lon":80.9950},
  # Jaipur — 4
  {"name":"HDFC Bank ATM - MI Road","operator":"HDFC Bank","lat":26.9085,"lon":75.8100},
  {"name":"SBI ATM - Malviya Nagar","operator":"State Bank of India","lat":26.8540,"lon":75.8130},
  {"name":"ICICI Bank ATM - Vaishali Nagar","operator":"ICICI Bank","lat":26.9120,"lon":75.7380},
  {"name":"Axis Bank ATM - Mansarovar","operator":"Axis Bank","lat":26.8510,"lon":75.7600},
  # Ahmedabad — 3
  {"name":"HDFC Bank ATM - CG Road","operator":"HDFC Bank","lat":23.0290,"lon":72.5670},
  {"name":"SBI ATM - Satellite","operator":"State Bank of India","lat":23.0300,"lon":72.5100},
  {"name":"ICICI Bank ATM - Maninagar","operator":"ICICI Bank","lat":22.9970,"lon":72.6020},
  # Indore — 3
  {"name":"HDFC Bank ATM - Vijay Nagar","operator":"HDFC Bank","lat":22.7530,"lon":75.8940},
  {"name":"SBI ATM - Palasia","operator":"State Bank of India","lat":22.7240,"lon":75.8830},
  {"name":"ICICI Bank ATM - Rau","operator":"ICICI Bank","lat":22.6520,"lon":75.8120},
  # Kolkata — 4
  {"name":"SBI ATM - Park Street","operator":"State Bank of India","lat":22.5530,"lon":88.3520},
  {"name":"HDFC Bank ATM - Salt Lake Sector V","operator":"HDFC Bank","lat":22.5800,"lon":88.4200},
  {"name":"ICICI Bank ATM - Gariahat","operator":"ICICI Bank","lat":22.5840,"lon":88.3630},
  {"name":"Axis Bank ATM - Howrah","operator":"Axis Bank","lat":22.5950,"lon":88.2630},
  # Chennai — 3
  {"name":"SBI ATM - T. Nagar","operator":"State Bank of India","lat":13.0418,"lon":80.2341},
  {"name":"HDFC Bank ATM - Anna Nagar","operator":"HDFC Bank","lat":13.0850,"lon":80.2600},
  {"name":"ICICI Bank ATM - Adyar","operator":"ICICI Bank","lat":13.0067,"lon":80.2570},
  # Srinagar — 3
  {"name":"SBI ATM - Lal Chowk","operator":"State Bank of India","lat":34.0830,"lon":74.7970},
  {"name":"J&K Bank ATM - Residency Road","operator":"Jammu & Kashmir Bank","lat":34.0780,"lon":74.8060},
  {"name":"HDFC Bank ATM - Karan Nagar","operator":"HDFC Bank","lat":34.0740,"lon":74.8070}
]

OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.ch/api/interpreter"
]
OVERPASS_STATUS = [ep.replace("/api/interpreter", "/api/status") for ep in OVERPASS]
ATM_WARM_LOCK = threading.Lock()
ATM_WARMING = set()


def _cache_atms(node_id, atms, degraded=""):
    payload = json.dumps({"atms": atms, "degraded": degraded}, separators=(",", ":"))
    with DB_LOCK:
        DB.execute("INSERT OR REPLACE INTO atm_cache VALUES(?,?,?)",
                   (node_id, time.time(), payload))
        DB.commit()


def _read_atm_cache(node_id):
    with DB_LOCK:
        row = DB.execute("SELECT fetched_at,payload FROM atm_cache WHERE node_id=?",
                         (node_id,)).fetchone()
    if not row or time.time() - row[0] >= ATM_CACHE_TTL:
        return None
    try:
        cached = json.loads(row[1])
        if isinstance(cached, dict) and "atms" in cached:
            return cached
        return {"atms": cached, "degraded": ""}  # migrate pre-resilience rows
    except (TypeError, ValueError):
        return None


def _overpass_working_endpoints():
    results = [None] * len(OVERPASS)
    def probe(index, status_ep):
        try:
            req = urllib.request.Request(status_ep, headers={"User-Agent": "NirakshanSIH/1.0"})
            with urllib.request.urlopen(req, timeout=OVERPASS_STATUS_TIMEOUT) as response:
                if 200 <= response.status < 400:
                    results[index] = OVERPASS[index]
        except Exception:
            pass
    probes = [threading.Thread(target=probe, args=(i, status_ep), daemon=True)
              for i, status_ep in enumerate(OVERPASS_STATUS)]
    for thread in probes: thread.start()
    for thread in probes: thread.join(OVERPASS_STATUS_TIMEOUT + 1)
    return [ep for ep in results if ep]


def get_atms(node_id, lat, lon, r):
    cached = _read_atm_cache(node_id)
    if cached is not None:
        return cached
    q = ('[out:json][timeout:25];('
         'node(around:%d,%f,%f)["amenity"="atm"];way(around:%d,%f,%f)["amenity"="atm"];'
         'node(around:%d,%f,%f)["amenity"="bank"];way(around:%d,%f,%f)["amenity"="bank"];);out center 80;'
         ) % (r,lat,lon,r,lat,lon,r,lat,lon,r,lat,lon)
    working = _overpass_working_endpoints()
    last = "no Overpass endpoint passed status check"
    for ep in working:
        for attempt in range(2):
            try:
                req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data":q}).encode(),
                                             headers={"User-Agent": "NirakshanSIH/1.0"})
                with urllib.request.urlopen(req, timeout=OVERPASS_QUERY_TIMEOUT) as response:
                    raw = json.loads(response.read())
                out = []
                for e in raw.get("elements", []):
                    c = e.get("center") or {}
                    la, lo = e.get("lat", c.get("lat")), e.get("lon", c.get("lon"))
                    if la is None or lo is None: continue
                    t = e.get("tags", {})
                    out.append({"name": t.get("name") or t.get("operator") or "ATM",
                                "operator": t.get("operator",""), "lat": la, "lon": lo})
                if not out:
                    last = "%s returned 0 elements" % ep
                    continue
                result = {"atms": out, "degraded": ""}
                _cache_atms(node_id, out)
                return result
            except Exception as ex:
                last = "%s attempt %d -> %s" % (ep, attempt + 1, ex)
    with DB_LOCK:
        stale = DB.execute("SELECT payload FROM atm_cache WHERE node_id=?", (node_id,)).fetchone()
    if stale:
        try:
            old = json.loads(stale[0])
            return {"atms": old.get("atms", FALLBACK_ATMS) if isinstance(old, dict) else old,
                    "degraded": "served from older cache - Overpass busy"}
        except (TypeError, ValueError):
            pass
    result = {"atms": FALLBACK_ATMS,
              "degraded": "Overpass unavailable - showing seeded ATM set (labeled)"}
    _cache_atms(node_id, FALLBACK_ATMS, result["degraded"])
    return result


def prewarm_top_atms():
    """Kick off one cache warm for UptimeRobot without delaying /health."""
    if _read_atm_cache(TOP_RISK_NODE) is not None:
        return
    with ATM_WARM_LOCK:
        if TOP_RISK_NODE in ATM_WARMING:
            return
        ATM_WARMING.add(TOP_RISK_NODE)
    def warm():
        try:
            get_atms(TOP_RISK_NODE, TOP_RISK_LAT, TOP_RISK_LON, 4000)
        except Exception as ex:
            print("[atm-prewarm] %s: %s" % (TOP_RISK_NODE, ex), flush=True)
        finally:
            with ATM_WARM_LOCK:
                ATM_WARMING.discard(TOP_RISK_NODE)
    threading.Thread(target=warm, daemon=True).start()

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

def _hit(ip, kind):
    mx, win = RATE_LIMIT[kind]
    now = time.time()
    q = HITS.setdefault(kind, {}).setdefault(ip, [])
    while q and now - q[0] > win: q.pop(0)
    q.append(now)
    return len(q) <= mx

def _ok_origin(o):
    return (not o) or o.startswith("https://nirikshanv2.onrender.com") or "localhost" in o or "127.0.0.1" in o

MIME = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
        ".css":"text/css; charset=utf-8",".png":"image/png",".json":"application/json",
        ".svg":"image/svg+xml",".ico":"image/x-icon"}

class H(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",(lambda o: o if _ok_origin(o) else "null")(self.headers.get("Origin","")))
        self.send_header("Access-Control-Allow-Headers","Content-Type")
        self.send_header("Access-Control-Allow-Methods","GET,POST,OPTIONS")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("X-Frame-Options","DENY")
        self.send_header("Referrer-Policy","no-referrer")
    def do_OPTIONS(self): self.send_response(204); self._cors(); self.end_headers()
    def _json(self,obj,code=200):
        b=json.dumps(obj).encode(); self.send_response(code)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(b))); self._cors(); self.end_headers()
        self.wfile.write(b)
    def _static(self,path):
        if path in ("/",""): path="/index.html"

        # 1) legacy console stays reachable for side-by-side comparison
        if path == "/legacy" or path.startswith("/legacy/"):
            sub = path[len("/legacy"):] or "/"
            return self._send_file(PUBLIC, "/index.html" if sub == "/" else sub, False)

        # 2) React build takes the root when present
        if os.path.isdir(DIST):
            return self._send_file(DIST, path, True)

        # 3) otherwise the legacy static site, exactly as before
        return self._send_file(PUBLIC, path, False)

    def _send_file(self, root, path, spa):
        fp = os.path.normpath(os.path.join(root, path.lstrip("/")))
        if not fp.startswith(root) or not os.path.isfile(fp):
            ext = os.path.splitext(path)[1]
            # SPA: unknown *navigation* (no extension) -> index.html
            if spa and not ext:
                idx = os.path.join(root, "index.html")
                if os.path.isfile(idx):
                    return self._raw(idx, 200)
            # unknown path WITH an extension -> branded 404 page
            if ext:
                nf = os.path.join(WEBAPP_PUBLIC, "404.html")   # source of truth
                if not os.path.isfile(nf):
                    nf = os.path.join(root, "404.html")        # built copy
                if os.path.isfile(nf):
                    return self._raw(nf, 404)
            return self._json({"error":"nf"},404)
        return self._raw(fp, 200)

    def _raw(self, fp, code):
        body = open(fp,"rb").read()
        self.send_response(code)
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
        elif p.path in ("/atms","/ai/briefing","/case/trace") and not _hit(self.client_address[0]+"g","reads"):
            return self._json({"error":"rate limited"},429)
        elif p.path == "/atms":
            q = urllib.parse.parse_qs(p.query)
            res = get_atms(q.get("node",[""])[0], float(q.get("lat",[22.5])[0]),
                           float(q.get("lon",[79.5])[0]), int(q.get("r",[6000])[0]))
            res["source"] = ("OpenStreetMap/Overpass (LIVE)" if not res.get("degraded")
                             else "Seeded ATM fallback (degraded)")
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
        elif p.path == "/ai/briefing":
            self._json(ai_briefing())
        elif p.path == "/health":
            # UptimeRobot calls this every 5 minutes; warm the highest-risk
            # node asynchronously so health stays a sub-second liveness check.
            prewarm_top_atms()
            self._json({"ok": True, "clients": len(CLIENTS),
                        "ntfy": ("set" if NTFY_TOPIC else "NOT SET")})
        else:
            self._static(p.path)
    def do_POST(self):
        ip = self.client_address[0]
        if not _hit(ip, "writes"):
            return self._json({"error":"rate limited"},429)
        self.path = self.path.strip().rstrip("/")
        n = min(int(self.headers.get("Content-Length",0) or 0), 8192)
        body = self.rfile.read(n)
        if self.path in ("/ingest","/ingest-sms") and INGEST_KEY:
            if self.headers.get("X-Nirakshan-Key") != INGEST_KEY:
                return self._json({"error":"forbidden"},403)
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
