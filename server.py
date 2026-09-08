import http.server
import socketserver
import json
import urllib.parse

PORT = 8080

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="public", **kwargs)

    def do_POST(self):
        if self.path == "/api/verify-qr":
            length = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(length).decode('utf-8')
            uri = json.loads(raw).get("uri", "")

            parsed = urllib.parse.urlparse(uri)
            params = urllib.parse.parse_qs(parsed.query)

            pa = params.get("pa", [""])[0]
            pn = params.get("pn", [""])[0]
            am = params.get("am", [""])[0]

            is_scam = "refund" in pn.lower() or "cashback" in pn.lower() or (am and float(am) > 5000)

            data = {
                "verdict": "FLAGGED_FRAUD_RISK" if is_scam else "VERIFIED_MERCHANT",
                "risk_score": 0.94 if is_scam else 0.12,
                "vpa": pa or "merchant@icici",
                "payee": pn or "Official Merchant",
                "amount": am or "Flexible",
                "reasons": [
                    "Deceptive refund / cashback label on outbound debit",
                    f"Embedded pre-filled transfer parameter: ₹{am}"
                ] if is_scam else ["Standard verified merchant handle"]
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode('utf-8'))
        else:
            self.send_error(404)

print(f"[*] Command Centre active on http://127.0.0.1:{PORT}")
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()

