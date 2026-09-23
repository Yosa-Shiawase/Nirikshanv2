#!/data/data/com.termux/files/usr/bin/bash
# rewrite each import specifier to the actual on-disk file casing
cd "$(dirname "$0")"
find src -name "*.jsx" -o -name "*.js" | while read f; do
  python3 - "$f" << 'PYEOF'
import sys, re, os
f = sys.argv[1]
s = open(f, encoding='utf-8').read()
orig = s
def repl(m):
    spec = m.group(1)
    if not spec.startswith('.'):
        return m.group(0)
    base = os.path.normpath(os.path.join(os.path.dirname(f), spec))
    d = os.path.dirname(base); b = os.path.basename(base)
    if not os.path.isdir(d): return m.group(0)
    target = None
    for e in ['', '.jsx', '.js', '.css']:
        cand = b + e
        p = os.path.join(d, cand)
        if os.path.isfile(p): target = cand; break
        # case-insensitive probe
        if os.path.isdir(d):
            for a in os.listdir(d):
                if a.lower() == cand.lower(): target = a; break
        if target: break
    if not target: return m.group(0)
    if target != b:
        fixed = re.sub(re.escape(b), target, spec)
        return m.group(0).replace(spec, fixed)
    return m.group(0)
s2 = re.sub(r'from\s+["\'](\.[^"\']+)["\']', repl, s)
s2 = re.sub(r'import\s+["\'](\.[^"\']+)["\']', lambda m: re.sub(r'import\s+["\'][^"\']+["\']',
    'import "%s"' % __import__('os').path.normpath(os.path.join(os.path.dirname(f), m.group(1))
        .replace(os.getcwd()+os.sep,'')).replace('\\','/'), m.group(0), 1) if False else m.group(0), s2)
if s2 != orig:
    open(f, 'w', encoding='utf-8').write(s2)
    print('fixed imports:', f)
PYEOF
done
echo "IMPORT SCAN COMPLETE"
