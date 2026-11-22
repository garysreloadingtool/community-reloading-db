#!/usr/bin/env node
// Validate a shared caliber / projectile / powder / load and merge it into community/items.json.
// Usage: ISSUE_BODY="..." ISSUE_NUMBER=12 node tools/validate_items.js community/items.json
//        node tools/validate_items.js community/items.json submission.json
// The body/file is untrusted input. Only whitelisted fields with checked types and ranges are kept.
'use strict';
const fs = require('fs');
const [dbPath, filePath] = process.argv.slice(2);
const fail = (msg) => { console.error('INVALID: ' + msg); process.exit(1); };

let raw = filePath ? fs.readFileSync(filePath, 'utf8') : (process.env.ISSUE_BODY || '');
const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) raw = m[1];
let s; try { s = JSON.parse(raw); } catch (e) { fail('could not parse JSON: ' + e.message); }
if (!s || typeof s !== 'object') fail('expected a JSON object');

const str = (v, max = 80) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : undefined);
const num = (v, lo, hi, name, req) => {
  if (v == null || v === '') { if (req) fail(name + ' is required'); return undefined; }
  const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) fail(`${name} out of range (${lo}–${hi}): ${v}`); return n;
};
const obj = (v, name) => (v && typeof v === 'object' && !Array.isArray(v) ? v : fail(name + ' is missing'));
const name = (v, what) => str(v, 120) || fail(what + ' name is required');

const caliber = (c) => ({
  name: name(c.name, 'caliber'), caselen: num(c.caselen, 5, 150, 'case length (mm)', true), oal: num(c.oal, 10, 200, 'OAL (mm)'),
  casevol: num(c.casevol, 0.1, 60, 'case volume (cm³)', true), groove: num(c.groove, 2, 30, 'groove diameter (mm)', true),
  aeff: num(c.aeff, 0, 700, 'bore area (mm²)'), pmax: num(c.pmax, 100, 8000, 'max. pressure (bar)', true),
  sebert: num(c.sebert, 0, 2, 'Sebert factor'), ps: num(c.ps, 0, 2000, 'shot-start pressure (bar)'), barrel: num(c.barrel, 40, 1600, 'barrel (mm)')
});
const projectile = (p) => ({
  name: name(p.name, 'bullet'), mass: num(p.mass, 0.1, 200, 'bullet mass (g)', true), len: num(p.len, 1, 120, 'bullet length (mm)', true),
  dia: num(p.dia, 2, 30, 'bullet diameter (mm)'), friction: num(p.friction, 0, 2000, 'extra bore friction (bar)')
});
const powder = (w, load) => Object.assign({
  name: name(w.name, 'powder'), Ba: num(w.Ba, 0.01, 20, 'Ba', true), a0: num(w.a0, -10, 50, 'a0'), z1: num(w.z1, 0, 1, 'z1'), z2: num(w.z2, 0, 1, 'z2'),
  Qex: num(w.Qex, 1000, 7000, 'Qex', true), k: num(w.k, 1, 1.5, 'k', true), pc: num(w.pc, 500, 3000, 'material density'),
  pcd: num(w.pcd, 200, 2000, 'bulk density'), eta: num(w.eta, 0, 5, 'covolume'), tcc: num(w.tcc, -1, 1, 'tcc'), tch: num(w.tch, -1, 1, 'tch')
}, load ? {
  mc: num(w.mc, 0.01, 100, 'charge (g)', true), pt: num(w.pt, -40, 60, 'powder temp (°C)'),
  laddercnt: num(w.laddercnt, 1, 30, 'ladder steps'), laddermc: num(w.laddermc, 0, 10, 'ladder step (g)')
} : {});
const load = (l) => ({
  name: name(l.name, 'load'), caliber: caliber(obj(l.caliber, 'caliber')), gun: { barrel: num(obj(l.gun, 'gun').barrel, 40, 1600, 'barrel (mm)', true) },
  projectile: projectile(obj(l.projectile, 'bullet')), powder: powder(obj(l.powder, 'powder'), true)
});
const KINDS = { caliber: ['calibers', caliber], projectile: ['projectiles', projectile], powder: ['powders', powder], load: ['loads', load] };
const kind = KINDS[s.kind] || fail('kind must be one of: ' + Object.keys(KINDS).join(', '));

const out = Object.assign({
  id: (str(s.id, 40) || '').replace(/[^\w-]/g, '') || Date.now().toString(36),
  sharedAt: new Date().toISOString().slice(0, 10), submittedBy: str(s.submittedBy, 40), notes: str(s.notes, 500)
}, kind[1](obj(s.item, 'item')));
if (process.env.ISSUE_NUMBER) out.issue = Number(process.env.ISSUE_NUMBER);
const clean = (o) => { Object.keys(o).forEach((k) => { if (o[k] === undefined) delete o[k]; else if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) clean(o[k]); }); return o; };
clean(out);

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
if (db.format !== 'GarysReloadingTool-items') fail('database file has wrong format');
// A resubmission (same id or same issue) replaces the earlier version in every list.
Object.values(KINDS).forEach(([list]) => { db[list] = (db[list] || []).filter((r) => r.id !== out.id && (!out.issue || r.issue !== out.issue)); });
db[kind[0]].push(out); db.updated = out.sharedAt;
fs.writeFileSync(dbPath, JSON.stringify(db, null, 1) + '\n');
console.log(`OK: ${s.kind} "${out.name}"`);
