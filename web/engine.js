/* Gary's Reloading Tool – interior ballistics engine.
 * Independent lumped-parameter model (Noble-Abel gas, Resal energy balance,
 * three-phase form function). SI units internally. For estimation only. */
(function (G) {
  'use strict';
  var GR = 0.06479891;            // grams per grain
  var GRH2O_CM3 = 0.06479891;     // cm3 per grain of water

  // Model constants. KBA and KHEAT are fitted to measured chronograph data (see tools/fit_model.js).
  // hw: wall heat-transfer coefficient (W per m² of wall at flame temperature), fitted in validation.
  var K = { ba: 0.748, hw: 1.5e7, prog: 1, cd: 0.8, step: 1, P0: 2500, pexp: 0.85, pwarn: 0.91 };   // pwarn: rifle over-pressure warning fires at this fraction of MAP (a conservative margin below MAP; per-cartridge peak-pressure bias, where it validates on held-out data, is corrected by inp.pcal (validation/pcal.js)). hw: fitted to ~10,000 published pressures; cd: revolver cylinder-gap discharge coefficient, fitted to revolver loads; pexp: pressure exponent of the burn-rate law (sub-linear Vieille r∝p^n, n≈0.8–0.9 for nitrocellulose), validated on published data; P0: reference pressure (bar) anchoring Ba's scale

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
   *        ps bar, sebert, mp g, blen mm, friction bar, mc g, T °C, powder{...}, vcal (optional muzzle-velocity factor), pcal (optional peak-pressure factor),
   *        revolver: { gap mm, cyl mm } (optional; barrel is then measured from the cylinder face) } */
  function simulate(inp) {
    var pw = inp.powder;
    var A = (inp.aeff > 0 ? inp.aeff : Math.PI / 4 * inp.groove * inp.groove * 0.985) * 1e-6;
    var bore = Math.PI / 4 * inp.groove * inp.groove * 1e-6;
    var seat = Math.max(0, inp.caselen - (inp.oal - inp.blen));   // seating depth mm
    var V0 = inp.casevol * 1e-6 - bore * seat * 1e-3;            // free case volume m3
    var rv = inp.revolver && inp.revolver.gap > 0 ? inp.revolver : null;
    var cylLen = rv ? Math.max(rv.cyl || 0, inp.oal) : 0;                  // case head to cylinder face, mm
    var travel = Math.max(0.005, ((rv ? cylLen + inp.barrel : inp.barrel) - (inp.oal - inp.blen)) * 1e-3);
    // Cylinder gap: once the bullet base passes the cylinder face, gas escapes through a ring of area pi * bore * gap
    // as choked (sonic) flow, taking its mass and enthalpy with it.
    var xGap = rv ? (cylLen - (inp.oal - inp.blen)) * 1e-3 : Infinity, Agap = rv ? Math.PI * inp.groove * rv.gap * 1e-6 : 0;
    var mc = inp.mc * 1e-3, mp = inp.mp * 1e-3, k = pw.k;
    var F = (k - 1) * pw.Qex * 1e3;                               // specific force
    var eta = (pw.eta || 1) * 1e-3, rho = pw.pc || 1600;
    var meff = mp + mc * (inp.sebert || 0.5) / 1.5;
    var Ba = K.ba * tempBa(pw, inp.T == null ? 21 : inp.T);
    var ps = (inp.ps || 250) * 1e5, pfric = (inp.friction || 0) * 1e5 + 0.02 * ps;
    var pIgn = 20e5;                                              // primer pressure
    // Heat loss to the walls: rate = K.hw * wetted wall area * (gas temperature / flame temperature).
    // Chamber wall area from the case volume treated as a cylinder of the case length; bore wall grows with travel.
    var Lc = Math.max(inp.caselen, 1) * 1e-3, Dc = Math.sqrt(4 * inp.casevol * 1e-6 / (Math.PI * Lc));
    var Awall0 = Math.PI * Dc * Lc + Math.PI * Dc * Dc / 4, Pbore = Math.PI * inp.groove * 1e-3;

    var gasVol0 = V0 - mc / rho;
    if (!(gasVol0 > 0.02 * V0) || !(V0 > 0)) {                     // the charge does not fit in the free case volume
      return { invalid: 'Powder does not fit in the case (check case volume, charge, seating depth).', pmax: NaN, pmuzzle: NaN, v: NaN, E: NaN,
               t: 0, z: 0, travel: travel, xpmax: 0, tpmax: 0, burnoutX: null, seat: seat, freeVol: V0 * 1e6,
               fill: mc / (pw.pcd || 900) * 1e6 / inp.casevol * 100, eff: NaN, ipsc: NaN, curve: [], overPmax: false };
    }
    var tooDense = false;
    var choke = Math.pow(2 / (k + 1), (k + 1) / (2 * (k - 1)));
    var gasVolNow = 0, gasMassNow = 0;
    var gasP = function (z, x, v, Q, Ml, Wl) {
      var mg = mc * z - (Ml || 0);
      var vol = V0 + A * x - mc * (1 - z) / rho - eta * mg;
      if (vol < 0.02 * V0) { tooDense = true; vol = 0.02 * V0; }
      var e = F * mc * z - (k - 1) * (0.5 * meff * v * v + Q) - (Wl || 0);
      gasVolNow = vol; gasMassNow = mg;
      return Math.max(pIgn, pIgn + e / vol);
    };
    // derivatives of (z, x, v, Q) for pressure p; moving decided per step
    var moving = false;
    function deriv(z, x, v, Q, out, Ml, Wl) {
      var p = gasP(z, x, v, Q, Ml, Wl);
      var gen = F * mc * z, Trel = gen > 0 ? Math.max(0, (gen - (k - 1) * (0.5 * meff * v * v + Q) - (Wl || 0)) / gen) : 0;
      out[0] = z < 1 ? Ba * phi(z, pw) * K.P0 * Math.pow(p / 1e5 / K.P0, K.pexp) : 0;   // burn rate ∝ p^pexp (Vieille); the P0 pivot keeps Ba on the same scale as the old linear law
      out[1] = v;
      out[2] = moving ? A * Math.max(0, p / (1 + mc / (3 * meff)) - pfric) / meff : 0;
      out[3] = K.hw * (Awall0 + Pbore * x) * Trel / (k - 1);
      // gap leak: mass rate (kg/s) and the matching loss of (k-1)*internal energy, i.e. k * (e per kg) * mdot
      var md = 0;
      if (x >= xGap && gasMassNow > 0 && p > pIgn) md = K.cd * Agap * choke * Math.sqrt(k * (p - pIgn) * gasMassNow / gasVolNow);
      out[4] = md; out[5] = md > 0 ? k * (p - pIgn) * gasVolNow / gasMassNow * md : 0;
      return p;
    }
    var z = 0, x = 0, v = 0, Q = 0, t = 0, Ml = 0, Wl = 0;
    var pmax = 0, xpmax = 0, tpmax = 0, out = [], lastOut = -1, burnout = null;
    var d1 = [0, 0, 0, 0, 0, 0], d2 = [0, 0, 0, 0, 0, 0];
    while (t < 0.05) {
      var p = deriv(z, x, v, Q, d1, Ml, Wl);
      if (p > pmax) { pmax = p; xpmax = x; tpmax = t; }
      if (!moving && p >= ps) { moving = true; deriv(z, x, v, Q, d1, Ml, Wl); }
      if (t - lastOut >= 4e-6) { out.push([x, p, v, t, z]); lastOut = t; }
      // adaptive step: at most 0.2 % of the charge burns per step, 0.05 mm of travel, and never over 0.2 µs
      var sf = K.step, dt = 2e-7 * sf;                            // K.step > 1 only for bulk fitting (coarser, faster)
      if (d1[0] > 0) dt = Math.min(dt, 0.002 * sf / d1[0]);
      if (v > 0) dt = Math.min(dt, 5e-5 * sf / v);
      dt = Math.max(dt, 1e-10);
      // midpoint (2nd-order Runge-Kutta) step
      if (d1[4] > 0) dt = Math.min(dt, 0.01 * Math.max(gasMassNow, 1e-9) / d1[4]);
      dt = Math.max(dt, 1e-10);
      deriv(Math.min(1, z + d1[0] * dt / 2), x + d1[1] * dt / 2, v + d1[2] * dt / 2, Q + d1[3] * dt / 2, d2, Ml + d1[4] * dt / 2, Wl + d1[5] * dt / 2);
      z = Math.min(1, z + d2[0] * dt); x += d2[1] * dt; v += d2[2] * dt; Q += d2[3] * dt; Ml += d2[4] * dt; Wl += d2[5] * dt; t += dt;
      if (z >= 1 && burnout == null) burnout = x;
      if (x >= travel || tooDense) break;
    }
    if (tooDense) return { invalid: 'Charge too dense for the model: the gas has no room before the bullet moves (check case volume and charge).',
      pmax: NaN, pmuzzle: NaN, v: NaN, E: NaN, t: t, z: z, travel: travel, xpmax: 0, tpmax: 0, burnoutX: null, seat: seat, freeVol: V0 * 1e6,
      fill: mc / (pw.pcd || 900) * 1e6 / inp.casevol * 100, eff: NaN, ipsc: NaN, curve: [], overPmax: false };
    var pm = gasP(z, x, v, Q, Ml, Wl);
    out.push([x, pm, v, t, z]);
    var vcal = inp.vcal > 0 ? inp.vcal : 1;                      // per-cartridge muzzle-velocity calibration (straight-wall)
    if (vcal !== 1) { v *= vcal; for (var ci = 0; ci < out.length; ci++) out[ci][2] *= vcal; }
    var pcal = inp.pcal > 0 ? inp.pcal : 1;                      // per-cartridge peak-pressure calibration (validation/pcal.js); velocity and energy unaffected
    if (pcal !== 1) { pmax *= pcal; pm *= pcal; for (var pj = 0; pj < out.length; pj++) out[pj][1] *= pcal; }
    var E = 0.5 * mp * v * v;
    var powderVol = mc / (pw.pcd || 900) * 1e6;
    return {
      heatLoss: Q, gapLoss: mc > 0 ? Ml / mc : 0, pmax: pmax / 1e5, pmuzzle: pm / 1e5, v: v, E: E, t: t, z: z, travel: travel,
      xpmax: xpmax, tpmax: tpmax, burnoutX: burnout, seat: seat, freeVol: V0 * 1e6,
      fill: powderVol / inp.casevol * 100, eff: E / (mc * pw.Qex * 1e3) * 100,
      ipsc: (inp.mp / GR) * (v * 3.28084) / 1000, curve: out, overPmax: inp.pmax ? pmax / 1e5 > inp.pmax * (inp.pistol ? 1 : K.pwarn) : false
    };
  }

  G.GRTEngine = { K: K, simulate: simulate, phi: phi, GR: GR, GRH2O_CM3: GRH2O_CM3 };
})(typeof window !== 'undefined' ? window : globalThis);
