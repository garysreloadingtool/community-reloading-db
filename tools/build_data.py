#!/usr/bin/env python3
"""Convert a checkout of github.com/zen/grt_databases (CC0) into web/data.js.
Usage: python3 -I tools/build_data.py <repo_dir> <out.js>"""
import sys, os, re, json, urllib.parse
import xml.etree.ElementTree as ET

def fix(s):  # rename brand mentions
    s = re.sub(r"Gordons", "Garys", s); s = re.sub(r"Gordon", "Gary", s)
    s = re.sub(r"GORDONS", "GARYS", s); return re.sub(r"(?i)gordon", "gary", s)

def vars_of(el):
    out = {}
    for v in el:
        if v.tag in ("var", "svar", "input", "config"):
            n = v.get("name"); val = urllib.parse.unquote(v.get("value") or "")
            if n and n not in out: out[n] = fix(val)
    return out

def parse(path):
    txt = open(path, encoding="utf-8", errors="replace").read().replace("<svar", "<var")
    return ET.fromstring(txt.encode())

def num(d, k, default=0.0):
    try: return float(d.get(k, default))
    except ValueError: return default

repo, out = sys.argv[1], sys.argv[2]
db = {"calibers": [], "projectiles": [], "powders": [], "loads": []}
src = lambda f: fix(os.path.basename(f))
for f in sorted(os.listdir(f"{repo}/powders")):
    for pf in parse(f"{repo}/powders/{f}").iter("propellantfile"):
        d = vars_of(pf)
        db["powders"].append({"name": f'{d.get("mname","")} {d.get("pname","")}'.strip() + (f' ({d["lotid"]})' if d.get("lotid") else ""),
            **{k: num(d, k) for k in ("Ba","Qex","k","a0","z1","z2","eta","pc","pcd","tcc","tch")}, "src": src(f)})
for f in sorted(os.listdir(f"{repo}/projectiles")):
    for pf in parse(f"{repo}/projectiles/{f}").iter("projectilefile"):
        d = vars_of(pf)
        db["projectiles"].append({"name": f'{d.get("mname","")} {d.get("pname","")} {d.get("caliber","")} {d.get("gmass","")}gr'.strip(),
            "dia": num(d,"gdia"), "len": num(d,"glen"), "massGr": num(d,"gmass"), "g1": num(d,"g1bc"), "g7": num(d,"g7bc"),
            "friction": num(d,"gfriction"), "descr": d.get("descr",""), "src": src(f)})
for f in sorted(os.listdir(f"{repo}/calibers")):
    if not f.endswith(".caliber"): continue
    for cf in parse(f"{repo}/calibers/{f}").iter("caliberfile"):
        d = vars_of(cf); g = num(d,"G1") or num(d,"c_G1")
        name = d.get("cipname","") + (f' / {d["altname"]}' if d.get("altname") else "")
        db["calibers"].append({"name": name, "caselen": num(d,"L3") or num(d,"c_L3"), "oal": num(d,"L6"),
            "casevolGrH2O": num(d,"V"), "groove": g, "pmax": num(d,"Pmax"), "sebert": num(d,"sebert",0.5) or 0.5,
            "standard": d.get("standard",""), "src": src(f)})
for f in sorted(os.listdir(f"{repo}/loads")):
    r = parse(f"{repo}/loads/{f}"); ib = r.find("InnerBallistikInput")
    if ib is None: continue
    sec = lambda t: vars_of(ib.find(t)) if ib.find(t) is not None else {}
    c, g, pj, pw = sec("caliber"), sec("gun"), sec("projectile"), sec("propellant")
    t = ib.find("title"); title = (fix(urllib.parse.unquote(t.text or "")) if t is not None else "") or src(f).rsplit(".",1)[0].replace("_"," ")
    db["loads"].append({"name": title, "src": src(f),
      "caliber": {"name": c.get("CaliberName",""), "oal": num(c,"oal"), "caselen": num(c,"caselen"), "casevol": num(c,"casevol"),
                  "groove": num(c,"Dz"), "aeff": num(c,"Aeff"), "pmax": num(c,"pMaxZul"), "sebert": num(c,"sebert",0.5), "ps": num(c,"ps",250)},
      "gun": {"barrel": num(g,"xe",610), "twist": num(g,"twistlen",254)},
      "projectile": {"name": pj.get("ProjectileName",""), "dia": num(pj,"Dbul"), "mass": num(pj,"mp"), "len": num(pj,"glen"), "friction": num(pj,"gfriction")},
      "powder": {"name": f'{pw.get("mname","")} {pw.get("pname","")}', **{k: num(pw,k) for k in ("Ba","Qex","k","a0","z1","z2","eta","pc","pcd","tcc","tch","mc","pt")},
                 "laddercnt": num(pw,"laddercnt",1), "laddermc": num(pw,"laddermc",0)}})
with open(out, "w") as fh:
    fh.write("// Generated from github.com/zen/grt_databases (CC0 1.0). Do not edit by hand.\nwindow.GRT_DB = ")
    json.dump(db, fh, separators=(",", ":")); fh.write(";\n")
print({k: len(v) for k, v in db.items()})
