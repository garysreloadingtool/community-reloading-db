// Fit engine constants (K.ba, K.hw wall heat transfer) to measured chronograph data.
// Usage: node tools/fit_model.js
// Reference: 6.5 Creedmoor, Sierra 120gr HPBT MK, Vihtavuori N540, 24" barrel (GRTLab measurement template).
globalThis.window = globalThis; require('../web/engine.js');
const E = window.GRTEngine;
const pw = { Ba: 0.5816, Qex: 4000, k: 1.2131, a0: 1.4074, z1: 0.4882, z2: 0.8341, eta: 1, pc: 1620, pcd: 940 };
const base = { casevol: 3.399, groove: 6.7056, aeff: 34.66, oal: 69.85, caselen: 48.77, barrel: 609.6, ps: 250, sebert: 0.5, mp: 7.7759, blen: 30.378, powder: pw };
const shots = [ { mc: 2.462359, v: (844.6 + 850.087 + 847.954 + 850.392) / 4 },
                { mc: 2.656755, v: (906.475 + 906.170 + 908.914 + 907.694 + 908.304) / 5 } ];
const PMAX_TARGET = [3900, 4350];   // soft prior: near-max published charge stays under CIP Pmax
function cost(ba, hw) {
  E.K.ba = ba; E.K.hw = hw; let c = 0, out = [];
  for (const s of shots) { const r = E.simulate({ ...base, mc: s.mc }); out.push(r); c += ((r.v - s.v) / s.v) ** 2 * 1e4; }
  const p = out[1].pmax; if (p < PMAX_TARGET[0]) c += ((PMAX_TARGET[0] - p) / 100) ** 2; if (p > PMAX_TARGET[1]) c += ((p - PMAX_TARGET[1]) / 100) ** 2;
  return { c, out };
}
let best = { c: 1e9 };
for (let ba = 0.4; ba <= 1.6; ba += 0.04) for (let h = 0; h <= 8e7; h += 5e6) { const r = cost(ba, h); if (r.c < best.c) best = { ...r, ba, h }; }
for (let ba = best.ba - 0.04; ba <= best.ba + 0.04; ba += 0.004) for (let h = Math.max(0, best.h - 5e6); h <= best.h + 5e6; h += 5e5) { const r = cost(ba, h); if (r.c < best.c) best = { ...r, ba, h }; }
console.log(`K.ba=${best.ba.toFixed(3)} K.hw=${best.h.toExponential(2)}`);
best.out.forEach((r, i) => console.log(`  ${(shots[i].mc / 0.0648).toFixed(1)}gr  model ${r.v.toFixed(1)} m/s vs measured ${shots[i].v.toFixed(1)} (${((r.v / shots[i].v - 1) * 100).toFixed(2)}%)  pmax ${r.pmax.toFixed(0)} bar  burnt ${(r.z * 100).toFixed(0)}%`));
