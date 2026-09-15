#!/data/data/com.termux/files/usr/bin/bash
cd ~/sih26184-app || exit 1
echo "== GATE: py =="
python3 -m py_compile app.py || { echo "PY BROKEN - ABORT"; exit 1; }
echo "== GATE: js =="
for f in public/*.js; do node --check "$f" || { echo "JS BROKEN: $f - ABORT"; exit 1; }; done
echo "== DEPLOY =="
git add -A && git commit -m "${1:-update}" && git push
echo "== pushed - wait for Render Live, then verify =="
