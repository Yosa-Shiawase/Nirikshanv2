# -*- coding: utf-8 -*-
"""SIH template -> NIRAKSHAN visual deck v4 (big type, full space, heading kept)."""
import urllib.request
from pptx import Presentation
from pptx.util import Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.dml import MSO_LINE

TEAM_NAME = "TEAM CYPHORA"        # <-- EDIT
TEAM_ID   = "[YOUR TEAM ID]"      # <-- EDIT

CYAN=RGBColor(0x1e,0x8a,0xb5); DARK=RGBColor(0x0b,0x16,0x26); CARD=RGBColor(0x0c,0x18,0x2c)
BORD=RGBColor(0x14,0x26,0x3f); WHITE=RGBColor(0xf1,0xf5,0xf9); MUT=RGBColor(0x51,0x5f,0x70)
GREEN=RGBColor(0x0c,0x8f,0x6d); AMB=RGBColor(0xb4,0x7d,0x08)
NAVY=RGBColor(0x0f,0x2b,0x5b); INK=RGBColor(0x2a,0x33,0x40); PAPER=RGBColor(0xff,0xff,0xff)

prs = Presentation("sih_template.pptx")
S = list(prs.slides)
def IN(v): return Emu(int(v*914400))
C=PP_ALIGN.CENTER; L=PP_ALIGN.LEFT

def set_para(p,text,size=None):
    if p.runs:
        p.runs[0].text=text
        for r in p.runs[1:]: r.text=""
        if size: p.runs[0].font.size=Pt(size)
    else:
        p.text=text
        if size and p.runs: p.runs[0].font.size=Pt(size)

def repl(slide,needle,text,size=None):
    for sh in slide.shapes:
        if not sh.has_text_frame: continue
        for p in sh.text_frame.paragraphs:
            full="".join(r.text for r in p.runs) or p.text
            if needle in full: set_para(p,text,size); return True
    return False

def clear_bullets_keep_heading(slide,keyword,heading_needle):
    """Blank every paragraph except the heading line, inside the matching shape."""
    for sh in slide.shapes:
        if not sh.has_text_frame: continue
        tf=sh.text_frame
        if keyword not in tf.text: continue
        for p in tf.paragraphs:
            t="".join(r.text for r in p.runs) or p.text
            if heading_needle in t: continue          # keep heading paragraph
            for r in p.runs: r.text=""
            if not p.runs and t.strip(): p.text=""
        return True

def del_shapes(slide,exact_texts=(),contains=()):
    for sh in list(slide.shapes):
        if not sh.has_text_frame: continue
        t=sh.text_frame.text.strip()
        if t in exact_texts or any(c in t for c in contains):
            sh._element.getparent().remove(sh._element)

def add_logo(slide,x,y,w):
    try: slide.shapes.add_picture("sih.png",IN(x),IN(y),width=IN(w))
    except Exception: pass

def box(slide,x,y,w,h,fill=CARD,line=BORD,shape=MSO_SHAPE.ROUNDED_RECTANGLE,dash=None,lw=1.3):
    sh=slide.shapes.add_shape(shape,IN(x),IN(y),IN(w),IN(h))
    try: sh.adjustments[0]=0.10
    except Exception: pass
    if fill is None: sh.fill.background()
    else: sh.fill.solid(); sh.fill.fore_color.rgb=fill
    if line is None: sh.line.fill.background()
    else:
        sh.line.color.rgb=line; sh.line.width=Pt(lw)
        if dash: sh.line.dash_style=dash
    try: sh.shadow.inherit=False
    except Exception: pass
    tf=sh.text_frame; tf.word_wrap=True
    tf.margin_left=tf.margin_right=IN(0.14); tf.margin_top=tf.margin_bottom=IN(0.08)
    return sh

def put(sh,lines,anchor=MSO_ANCHOR.MIDDLE,space=6):
    tf=sh.text_frame; tf.vertical_anchor=anchor; first=True
    for i,(text,size,bold,color,align,mono) in enumerate(lines):
        p=tf.paragraphs[0] if first else tf.add_paragraph(); first=False
        p.alignment=align; p.space_after=Pt(space)
        r=p.add_run(); r.text=text
        r.font.size=Pt(size); r.font.bold=bold; r.font.color.rgb=color
        if mono: r.font.name="Consolas"

def txt(slide,x,y,w,h,lines,space=4):
    tb=slide.shapes.add_textbox(IN(x),IN(y),IN(w),IN(h)); tf=tb.text_frame
    tf.word_wrap=True; first=True
    for text,size,bold,color,align,mono in lines:
        p=tf.paragraphs[0] if first else tf.add_paragraph(); first=False
        p.alignment=align; p.space_after=Pt(space)
        r=p.add_run(); r.text=text
        r.font.size=Pt(size); r.font.bold=bold; r.font.color.rgb=color
        if mono: r.font.name="Consolas"

def bar(slide,x,y,w,color,h=0.09):
    b=slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,IN(x),IN(y),IN(w),IN(h))
    b.fill.solid(); b.fill.fore_color.rgb=color; b.line.fill.background()
    try: b.shadow.inherit=False
    except Exception: pass

# ---------- SLIDE 1 : TITLE ----------
repl(S[0],"Problem Statement ID","Problem Statement ID – SIH26184",17)
repl(S[0],"Problem Statement Title",
     "Problem Statement Title- Predictive Analytics Framework for Cybercrime Complaints "
     "to Forecast Likely Cash Withdrawal Locations (MHA)",14)
repl(S[0],"Theme","Theme- Software, Blockchain & Cybersecurity",17)
repl(S[0],"PS Category","PS Category- Software",17)
repl(S[0],"Team ID","Team ID- "+TEAM_ID,17)
repl(S[0],"Team Name","Team Name (Registered on portal)- "+TEAM_NAME,15)
add_logo(S[0],0.55,6.15,0.7)

for sl in S[1:6]:
    for sh in sl.shapes:
        if sh.has_text_frame and "Your" in sh.text_frame.text and "Team" in sh.text_frame.text:
            sh.text_frame.text=TEAM_NAME
            for p in sh.text_frame.paragraphs:
                for r in p.runs: r.font.size=Pt(10)

# ---------- SLIDE 2 : SOLUTION (heading kept, big cards) ----------
repl(S[1],"IDEA TITLE","NIRAKSHAN — SEE. PREDICT. INTERCEPT.",32)
clear_bullets_keep_heading(S[1],"Detailed explanation","Proposed Solution")
del_shapes(S[1],exact_texts=("❖","✾"))

cards2=[(0.45,"◎  PREDICT","Hawkes engine forecasts cash-out hotspots before they happen","+2h · +6h · +24h lead windows",CYAN),
        (4.70,"▣  INTERCEPT","Real ATM/bank layer (OpenStreetMap) for pre-positioning forces","Live geospatial data",GREEN),
        (8.95,"⚠  PREVENT","QR fraud sensor stops scams at the payment entry point","NPCI rule engine + camera",AMB)]
for x,t,l1,l2,ac in cards2:
    sh=box(S[1],x,2.62,3.95,2.42); bar(S[1],x+0.24,2.9,0.95,ac)
    put(sh,[(t,17,True,ac,L,True),(l1,12.5,False,WHITE,L,False),(l2,10,True,MUT,L,True)],space=8)
sh=box(S[1],0.45,5.3,12.45,0.92,fill=DARK,line=CYAN)
put(sh,[("SHIFT:  Reactive — freeze after money is gone (HOURS)   →   Proactive — intercept before cash-out (MINUTES)",
         13.5,True,WHITE,C,True)])
txt(S[1],0.45,6.42,12.45,0.4,
    [("\u201CWe watch, so you\u2019re safe.\u201D  —  working prototype live 24/7",12.5,True,INK,C,False)])
add_logo(S[1],12.55,6.35,0.55)

# ---------- SLIDE 3 : TECHNICAL ----------
clear_bullets_keep_heading(S[2],"Technologies to be used","Technical Approach")
txt(S[2],0.45,1.5,12.45,0.45,[("DATA   →   DECISION   →   ACTION",14,True,NAVY,C,True)])
flow=[("LIVE INGEST","SSE + SQLite"),("PREDICT","Hawkes process"),("VISUALIZE","Satellite + OSM ATMs"),
      ("DETECT","QR rules + EWMA AI"),("ACT","Sec.102 dossier")]
n=len(flow); wch=2.70; step=(12.45-wch)/(n-1)
for i,(t,sub) in enumerate(flow):
    ch=box(S[2],0.45+i*step,2.02,wch,1.08,fill=DARK,line=CYAN,shape=MSO_SHAPE.CHEVRON)
    put(ch,[(t,12.5,True,WHITE,C,True),(sub,9.5,False,CYAN,C,True)])
sh=box(S[2],0.45,3.32,12.45,0.58,fill=None,line=BORD)
put(sh,[("Python stdlib  ·  SSE  ·  SQLite  ·  Leaflet + ESRI/OSM  ·  BarcodeDetector  ·  Gemini LLM (optional)",
         12,False,NAVY,C,True)])
b1=box(S[2],0.45,4.12,6.0,2.42,fill=None,line=MUT,dash=MSO_LINE.DASH)
put(b1,[("DROP SCREENSHOT",13.5,True,MUT,C,True),
        ("Satellite risk map — Hawkes heatmap, live pulses, real ATM layer",11,False,MUT,C,False)])
b2=box(S[2],6.9,4.12,6.0,2.42,fill=None,line=MUT,dash=MSO_LINE.DASH)
put(b2,[("DROP SCREENSHOTS",13.5,True,MUT,C,True),
        ("QR verdict FLAGGED_FRAUD_RISK · burst-anomaly banner · PDF dossier",11,False,MUT,C,False)])
add_logo(S[2],12.55,6.35,0.55)

# ---------- SLIDE 4 : FEASIBILITY (risk -> mitigation rows) ----------
clear_bullets_keep_heading(S[3],"Analysis of the feasibility","Feasibility")
sh=box(S[3],0.45,1.62,4.1,4.4)
bar(S[3],0.69,1.95,0.95,GREEN)
put(sh,[("✓  FEASIBLE NOW",15.5,True,GREEN,L,True),
        ("•  Prototype live 24/7 on cloud",12.5,False,WHITE,L,False),
        ("•  Zero dependencies — stdlib only",12.5,False,WHITE,L,False),
        ("•  Deployable on-prem / air-gapped",12.5,False,WHITE,L,False),
        ("•  Full demo replays in < 1 min",12.5,False,WHITE,L,False)],
    anchor=MSO_ANCHOR.TOP,space=12)

txt(S[3],4.85,1.52,3.6,0.35,[("RISK",12,True,AMB,L,True)])
txt(S[3],9.05,1.52,3.6,0.35,[("MITIGATION",12,True,CYAN,L,True)])
pairs=[("No public NCRP / CFCFRMS API","Adapter ingest + live SMS-forwarder path"),
       ("Victim PII sensitivity","On-prem deployment — PII never leaves"),
       ("Free-tier uptime / cold starts","Keep-alive monitor + 1-command port")]
y=1.95
for rk,mit in pairs:
    b=box(S[3],4.85,y,3.6,1.2,fill=DARK,line=AMB)
    put(b,[(rk,11.5,True,WHITE,L,False)])
    ar=box(S[3],8.5,y+0.34,0.5,0.5,fill=None,line=None,shape=MSO_SHAPE.RIGHT_ARROW)
    ar.fill.solid(); ar.fill.fore_color.rgb=MUT
    b=box(S[3],9.05,y,3.6,1.2,fill=DARK,line=CYAN)
    put(b,[(mit,11.5,True,WHITE,L,False)])
    y+=1.38
sh=box(S[3],2.7,5.62,8.0,0.78,fill=DARK,line=GREEN)
put(sh,[("PROTOTYPE LIVE NOW  →  nirikshanv2.onrender.com",15,True,GREEN,C,True)])
add_logo(S[3],12.55,6.35,0.55)

# ---------- SLIDE 5 : IMPACT ----------
clear_bullets_keep_heading(S[4],"Potential impact","Impact")
stats=[(0.45,"MINUTES","interception lead time, not hours —\npre-position before cash-out",CYAN),
       (4.70,"ZERO","blanket freezes — every lien capped to\ndisputed value (Sec.102 BNSS)",GREEN),
       (8.95,"HOUR 1","the critical recovery window —\nKPIs instrumented live on dashboard",AMB)]
for x,big,cap,ac in stats:
    sh=box(S[4],x,1.6,3.95,2.3); bar(S[4],x+0.24,1.9,0.95,ac)
    put(sh,[(big,30,True,ac,C,True),(cap,12,False,WHITE,C,False)],space=10)
bens=[(0.45,"I4C & CYBER CELLS","minutes-level proactive interception",CYAN),
      (4.70,"BANK NODAL OFFICERS","precise, legally-capped lien advisories",GREEN),
      (8.95,"CITIZENS","protection at the scam entry point itself",AMB)]
for x,t,d,ac in bens:
    sh=box(S[4],x,4.15,3.95,1.2,fill=DARK,line=BORD)
    put(sh,[(t,12.5,True,ac,L,True),(d,10.5,False,WHITE,L,False)],space=6)
sh=box(S[4],0.45,5.6,12.45,0.85,fill=DARK,line=BORD)
put(sh,[("SOCIAL: faster recovery, trust in digital payments     ·     ECONOMIC: near-zero infra cost, scales nationally     ·     MEASURED: live KPIs",
         12,True,WHITE,C,True)])
add_logo(S[4],12.55,6.35,0.55)

# ---------- SLIDE 6 : REFERENCES ----------
clear_bullets_keep_heading(S[5],"Details / Links","Research")
sh=box(S[5],0.45,1.6,6.1,4.55,fill=PAPER,line=BORD)
put(sh,[("MODEL & RULES",14,True,NAVY,L,True),
        ("Hawkes (1971) — self-exciting point processes",11.5,False,INK,L,False),
        ("Mohler et al. (2011) — predictive crime mapping",11.5,False,INK,L,False),
        ("NPCI UPI technical documentation (upi:// spec)",11.5,False,INK,L,False),
        ("Rajasthan HC (Aug 2026) — Sec.102 proportionality",11.5,False,INK,L,False),
        ("RBI Annual Report — payment-fraud trends",11.5,False,INK,L,False)],
    anchor=MSO_ANCHOR.TOP,space=10)
sh=box(S[5],6.8,1.6,6.05,2.45,fill=PAPER,line=BORD)
put(sh,[("DATA & MAPS",14,True,NAVY,L,True),
        ("I4C · cybercrime.gov.in (NCRP)",11.5,False,INK,L,False),
        ("OpenStreetMap Overpass API — live ATM layer",11.5,False,INK,L,False),
        ("ESRI World Imagery basemaps",11.5,False,INK,L,False)],
    anchor=MSO_ANCHOR.TOP,space=10)
sh=box(S[5],6.8,4.3,4.35,1.85,fill=PAPER,line=GREEN)
put(sh,[("THIS PROTOTYPE — LIVE",13,True,NAVY,L,True),
        ("github.com/Yosa-Shiawase/Nirikshanv2",11.5,True,CYAN,L,True),
        ("nirikshanv2.onrender.com",11.5,True,CYAN,L,True),
        ("scan → open live demo",10,False,INK,L,False)],
    anchor=MSO_ANCHOR.TOP,space=8)
try:
    urllib.request.urlretrieve(
      "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https%3A%2F%2Fnirikshanv2.onrender.com",
      "site_qr.png")
    S[5].shapes.add_picture("site_qr.png",IN(11.3),IN(4.4),width=IN(1.5))
except Exception: pass
add_logo(S[5],0.45,6.35,0.55)

# ---------- drop instructions slide ----------
xml=prs.slides._sldIdLst; ids=list(xml)
if len(ids)>=7: xml.remove(ids[6])

prs.save("NIRAKSHAN_SIH26184_Idea.pptx")
print("Saved v4 — bigger type, full space, heading restored")
