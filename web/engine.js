/* Gary's Reloading Tool – interior ballistics engine.
 * Independent lumped-parameter model (Noble-Abel gas, Resal energy balance,
 * three-phase form function). SI units internally. For estimation only. */
(function (G) {
  'use strict';
  var GR = 0.06479891;            // grams per grain
  var GRH2O_CM3 = 0.06479891;     // cm3 per grain of water

  // Model constants. KBA and KHEAT are fitted to measured chronograph data (see tools/fit_model.js).
  var K = { ba: 0.748, heat: 0.033, prog: 1 };   // fitted 2026-11-21

  // Three-phase form function phi(z), phi(0)=1 so that Ba is the start of the vivacity curve:
  // phase 1 (0..z1) linear with slope a0, phase 2 (z1..z2) linear transition, phase 3 (z2..1) degressive burnout.
  function phi(z, pw) {
    var z1 = Math.min(Math.max(pw.z1, 0.01), 0.98), z2 = Math.min(Math.max(pw.z2, z1 + 0.005), 0.995);
    var p1 = Math.max(0.05, 1 + K.prog * pw.a0 * z1);
    if (z <= z1) return 1 + (p1 - 1) * (z / z1);
    var p2 = Math.max(0.05, p1 * (1 - (z2 - z1) * 0.5));
    if (z <= z2) return p1 + (p2 - p1) * ((z - z1) / (z2 - z1));
    return Math.max(0, p2 * Math.sqrt((1 - z) / (1 - z2)));
  }

  function tempBa(pw, T) {
    var d = T - 21, tc = d < 0 ? pw.tcc : pw.tch;
    if (!tc) tc = pw.Ba * 0.0016;                                 // default drift ~0.16 %/°C
    return Math.max(pw.Ba + tc * d, pw.Ba * 0.2);
  }

  /* inp: { casevol cm3, groove mm, aeff mm2 (optional), oal mm, caselen mm, barrel mm,
   *        ps bar, sebert, mp g, blen mm, friction bar, mc g, T °C, powder{...} } */
  function simulate(inp) {
    var pw = inp.powder;
    var A = (inp.aeff > 0 ? inp.aeff : Math.PI / 4 * inp.groove * inp.groove * 0.985) * 1e-6;
    var bore = Math.PI / 4 * inp.groove * inp.groove * 1e-6;
    var seat = Math.max(0, inp.caselen - (inp.oal - inp.blen));   // seating depth mm
    var V0 = inp.casevol * 1e-6 - bore * seat * 1e-3;            // free case volume m3
    var travel = Math.max(0.005, (inp.barrel - (inp.oal - inp.blen) ) * 1e-3);
    var mc = inp.mc * 1e-3, mp = inp.mp * 1e-3, k = pw.k;
    var F = (k - 1) * pw.Qex * 1e3 * (1 - K.heat);                // specific force less heat loss
    var eta = (pw.eta || 1) * 1e-3, rho = pw.pc || 1600;
    var meff = mp + mc * (inp.sebert || 0.5) / 1.5;
    var Ba = K.ba * tempBa(pw, inp.T == null ? 21 : inp.T);
    var ps = (inp.ps || 250) * 1e5, pfric = (inp.friction || 0) * 1e5 + 0.02 * ps;
    var pIgn = 20e5;                                              // primer pressure

    var z = 0, x = 0, v = 0, t = 0, dt = 2e-8, moving = false;
    var pmax = 0, xpmax = 0, tpmax = 0, out = [], step = 0, burnout = null;
    var gasP = function () {
      var vol = V0 + A * x - mc * (1 - z) / rho - eta * mc * z;
      var e = F * mc * z - (k - 1) / 2 * meff * v * v;
      return Math.max(pIgn, pIgn + e / Math.max(vol, 1e-9));
    };
    while (t < 0.05) {
      var p = gasP();
      if (p > pmax) { pmax = p; xpmax = x; tpmax = t; }
      // burn rate dz/dt = Ba * phi(z) * p[bar]
      var dz = z < 1 ? Ba * phi(z, pw) * (p / 1e5) * dt : 0;
      if (!moving && p >= ps) moving = true;
      var acc = moving ? A * Math.max(0, p / (1 + mc / (3 * meff)) - pfric) / meff : 0;
      z = Math.min(1, z + dz); if (z >= 1 && burnout == null) burnout = x;
      v += acc * dt; x += v * dt; t += dt;
      if (step++ % 25 === 0) out.push([x, p, v, t, z]);
      if (x >= travel) break;
      dt = moving ? 2e-7 : 2e-8;
    }
    var pm = gasP();
    out.push([x, pm, v, t, z]);
    var E = 0.5 * mp * v * v;
    var powderVol = mc / (pw.pcd || 900) * 1e6;
    return {
      pmax: pmax / 1e5, pmuzzle: pm / 1e5, v: v, E: E, t: t, z: z, travel: travel,
      xpmax: xpmax, tpmax: tpmax, burnoutX: burnout, seat: seat, freeVol: V0 * 1e6,
      fill: powderVol / inp.casevol * 100, eff: E / (mc * pw.Qex * 1e3) * 100,
      ipsc: (inp.mp / GR) * (v * 3.28084) / 1000, curve: out, overPmax: inp.pmax ? pmax / 1e5 > inp.pmax : false
    };
  }

  G.GRTEngine = { K: K, simulate: simulate, phi: phi, GR: GR, GRH2O_CM3: GRH2O_CM3 };
})(typeof window !== 'undefined' ? window : globalThis);
