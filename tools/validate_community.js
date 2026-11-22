#!/usr/bin/env node
// Validate a community calibration submission and merge it into community/calibrations.json.
// Usage: ISSUE_BODY="..." ISSUE_NUMBER=12 node tools/validate_community.js community/calibrations.json
//        node tools/validate_community.js community/calibrations.json submission.json
// The body/file is untrusted input. Only whitelisted fields with checked types and ranges are kept.
'use strict';
const fs = require('fs');
const [dbPath, filePath] = process.argv.slice(2);
const fail = (msg) => { console.error('INVALID: ' + msg); process.exit(1); };

let raw = filePath ? fs.readFileSync(filePath, 'utf8') : (process.env.ISSUE_BODY || '');
const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) raw = m[1];
let s; try { s = JSON.parse(raw); } catch (e) { fail('could not parse JSON: ' + e.message); }

const str = (v, max = 80) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : undefined);
const num = (v, lo, hi, name, req) => {
  if (v == null || v === '') { if (req) fail(name + ' is required'); return undefined; }
  const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) fail(`${name} out of range (${lo}–${hi}): ${v}`); return n;
};
const L = s.load || fail('missing load');
const out = {
  id: (str(s.id, 40) || '').replace(/[^\w-]/g, '') || Date.now().toString(36),
  sharedAt: new Date().toISOString().slice(0, 10), month: /^\d{4}-\d{2}$/.test(s.month || '') ? s.month : undefined,
  make: str(s.make), model: str(s.model), powderLot: str(s.powderLot, 40), primer: str(s.primer), brass: str(s.brass), chrono: str(s.chrono),
  submittedBy: str(s.submittedBy, 40), notes: str(s.notes, 500),
  barrel: num(s.barrel, 40, 1600, 'barrel (mm)', true), twist: num(s.twist, 50, 2000, 'twist (mm)'),
  T: num(s.T, -40, 60, 'powder temp (°C)'), ambient: num(s.ambient, -40, 60, 'air temp (°C)'),
  casevol: num(s.casevol, 0.1, 60, 'case volume (cm³)'), oal: num(s.oal, 10, 200, 'OAL (mm)'),
  baCal: num(s.baCal, 0.2, 5, 'Ba factor', true),
  load: {
    caliberName: str(L.caliberName) || fail('caliber name is required'), projName: str(L.projName, 120), powderName: str(L.powderName) || fail('powder name is required'),
    caselen: num(L.caselen, 5, 150, 'case length'), groove: num(L.groove, 2, 30, 'groove', true), aeff: num(L.aeff, 0, 700, 'Aeff'),
    pmax: num(L.pmax, 100, 8000, 'Pmax'), ps: num(L.ps, 0, 2000, 'shot-start'), sebert: num(L.sebert, 0, 2, 'sebert'),
    mp: num(L.mp, 0.1, 200, 'bullet mass (g)', true), blen: num(L.blen, 1, 120, 'bullet length'), friction: num(L.friction, 0, 2000, 'friction'),
    Ba: num(L.Ba, 0.01, 20, 'Ba', true), a0: num(L.a0, -10, 50, 'a0'), z1: num(L.z1, 0, 1, 'z1'), z2: num(L.z2, 0, 1, 'z2'),
    Qex: num(L.Qex, 1000, 7000, 'Qex', true), k: num(L.k, 1, 1.5, 'k', true), pc: num(L.pc, 500, 3000, 'pc'), pcd: num(L.pcd, 200, 2000, 'pcd'),
    eta: num(L.eta, 0, 5, 'eta'), tcc: num(L.tcc, -1, 1, 'tcc'), tch: num(L.tch, -1, 1, 'tch')
  },
  shots: Array.isArray(s.shots) && s.shots.length && s.shots.length <= 30 ? s.shots.map((x, i) => ({
    mc: num(x && x.mc, 0.01, 100, `charge ${i + 1} (g)`, true),
    v: Array.isArray(x.v) && x.v.length && x.v.length <= 50 ? x.v.map((v) => num(v, 50, 2000, `velocity in charge ${i + 1} (m/s)`, true)) : fail(`charge ${i + 1} has no velocities`)
  })) : fail('shots must be a list of 1–30 charges')
};
out.name = [out.make, out.model, out.load.caliberName, out.load.powderName].filter(Boolean).join(' ');
if (process.env.ISSUE_NUMBER) out.issue = Number(process.env.ISSUE_NUMBER);
const clean = (o) => { Object.keys(o).forEach((k) => { if (o[k] === undefined) delete o[k]; else if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) clean(o[k]); }); return o; };
clean(out);

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
if (db.format !== 'GarysReloadingTool-community') fail('database file has wrong format');
db.records = db.records.filter((r) => r.id !== out.id && (!out.issue || r.issue !== out.issue));
db.records.push(out); db.updated = out.sharedAt;
fs.writeFileSync(dbPath, JSON.stringify(db, null, 1) + '\n');
console.log('OK: ' + out.name + ' (' + out.shots.length + ' charges)');
