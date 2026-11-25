/* Gary's Reloading Tool – shared UI logic for desktop (index.html) and mobile (mobile.html). */
(function () {
  'use strict';
  var E = window.GRTEngine, DB = window.GRT_DB || { calibers: [], projectiles: [], powders: [], loads: [] };
  var $ = function (id) { return document.getElementById(id); };
  var store = { get: function (k) { try { return JSON.parse(localStorage.getItem('grt.' + k)); } catch (e) { return null; } },
                set: function (k, v) { try { localStorage.setItem('grt.' + k, JSON.stringify(v)); } catch (e) {} } };

  // ---------- units ----------
  var U = {
    len:  { m: 'mm', i: 'in', f: 1 / 25.4, d: [2, 3] },
    vol:  { m: 'cm³', i: 'gr H₂O', f: 1 / E.GRH2O_CM3, d: [3, 1] },
    pres: { m: 'bar', i: 'psi', f: 14.5038, d: [0, 0] },
    mass: { m: 'g', i: 'gr', f: 1 / E.GR, d: [3, 1] },
    temp: { m: '°C', i: '°F', d: [1, 0] },
    none: { m: '', i: '', f: 1, d: [4, 4] }
  };
  var imperial = store.get('imperial'); if (imperial == null) imperial = true;
  function toDisp(v, u) { if (u === 'temp') return imperial ? v * 9 / 5 + 32 : v; return imperial ? v * U[u].f : v; }
  function fromDisp(v, u) { if (u === 'temp') return imperial ? (v - 32) * 5 / 9 : v; return imperial ? v / U[u].f : v; }
  function unitLabel(u) { return imperial ? U[u].i : U[u].m; }
  function fmt(v, u) { var d = U[u].d[imperial ? 1 : 0]; return (+v).toFixed(d); }

  // ---------- fields (metric internal values) ----------
  var F = {
    caliber: [
      ['caselen', 'Case length (L3)', 'len'], ['oal', 'Cartridge OAL (L6)', 'len'], ['casevol', 'Case volume', 'vol'],
      ['groove', 'Groove diameter', 'len'], ['pmax', 'Max. pressure', 'pres'], ['barrel', 'Barrel length', 'len'],
      ['gap', 'Revolver cylinder gap (0 = none)', 'len'], ['cyl', 'Revolver cylinder length', 'len'],
      ['ps', 'Shot-start pressure', 'pres'], ['sebert', 'Sebert factor', 'none']],
    projectile: [['mp', 'Bullet weight', 'mass'], ['blen', 'Bullet length', 'len'], ['friction', 'Extra bore friction', 'pres']],
    powder: [['mc', 'Charge weight', 'mass'], ['T', 'Powder temperature', 'temp'], ['laddercnt', 'Ladder steps', 'none'],
      ['laddermc', 'Ladder step size', 'mass'], ['Ba', 'Vivacity Ba', 'none'], ['a0', 'Prog./degr. a0', 'none'],
      ['z1', 'Limit z1', 'none'], ['z2', 'Limit z2', 'none'], ['Qex', 'Expl. heat Qex kJ/kg', 'none'], ['k', 'Isentropic k', 'none'],
      ['pc', 'Material density kg/m³', 'none'], ['pcd', 'Bulk density kg/m³', 'none'], ['eta', 'Covolume cm³/g', 'none'],
      ['tcc', 'Temp. coeff. cold', 'none'], ['tch', 'Temp. coeff. hot', 'none']]
  };
  var S = {}, focus = 0, results = [];

  // ---------- databases (built-in + user imports) ----------
  var user = store.get('userdb') || { calibers: [], projectiles: [], powders: [] };
  // Shared items from the community database (community/items.json), set by items.js.
  var comm = { calibers: [], projectiles: [], powders: [], loads: [] };
  function all(kind) { return (user[kind] || []).concat(DB[kind], comm[kind] || []); }
  // Powders that only appear inside shared loads are offered too.
  DB.loads.forEach(function (L) {
    if (!DB.powders.some(function (p) { return p.name.indexOf(L.powder.name) === 0; }))
      DB.powders.push(Object.assign({}, L.powder, { name: L.powder.name + ' (from load)', src: L.src }));
  });

  function fillSelect(sel, list, placeholder) {
    sel.innerHTML = GRTHTML('');
    var o = document.createElement('option'); o.value = ''; o.textContent = placeholder; sel.appendChild(o);
    list.forEach(function (it, i) { var op = document.createElement('option'); op.value = i; op.textContent = it.name; sel.appendChild(op); });
  }
  // Bullet list filter: bullets matching the caliber's groove (default), all, or one bullet diameter.
  function diaKey(mm) { return Math.round(mm / 25.4 * 1000); }          // diameter in thousandths of an inch
  // Rifle-only bullets (hidden while a handgun caliber is selected; rifle calibers list every bullet). A handgun marker
  // in the name keeps a bullet; otherwise a rifle-only design name, or a bullet longer than 3.2 calibers, is rifle-only.
  var PISTOL_B = /xtp|\bhap\b|jhp|\bswc\b|\bwc\b|wadcutter|\bhst\b|gold ?dot|gdhp|\btmj\b|cowboy|\blrn\b|\bxpb\b|fmj-?rn|\bjfp\b|critical (duty|defense)|xtreme (defense|penetrator)|\bhog\b|\bsd\b/i;
  var RIFLE_B = /spitzer|spire|\bsbt\b|eld|a-?max|v-?max|vld|hybrid|ballistic (tip|silvertip)|\bnbt\b|accubond|\bsst\b|scirocco|\btmk\b|match ?king|\bsmk\b|game ?king|\bttsx\b|\blrx\b|hpbt|bthp|scenar|pro-?hunter|\bph\b|partition|core-?lokt|power-?point|grand slam|a-frame|inter(lock|bond)|\bgmx\b|\becx\b|\bcx\b|hot-?cor|tipped|sub-?sonic|vlr|rangemaster|\bdg[sx]\b|vrg-\d/i;
  function rifleBullet(p) { return !PISTOL_B.test(p.name) && (RIFLE_B.test(p.name) || (p.dia > 0 && p.len / p.dia > 3.2)); }
  function projList() {
    var all_ = all('projectiles').slice().sort(function (a, b) {          // user bullets (★) first, then by name
      return (b.name.charAt(0) === '★') - (a.name.charAt(0) === '★') || a.name.localeCompare(b.name, undefined, { numeric: true });
    }), g = S.groove, f = $('projDia') ? $('projDia').value || 'match' : 'match';
    var pistol = S.calPistol != null ? S.calPistol : (S.caselen < 35 && S.oal < 45);
    if (pistol) all_ = all_.filter(function (p) { return p.name.charAt(0) === '★' || !rifleBullet(p); });   // own bullets always shown
    if (f === 'all') return all_;
    if (f === 'match') return g ? all_.filter(function (p) { return Math.abs(p.dia - g) < 0.2; }) : all_;
    return all_.filter(function (p) { return diaKey(p.dia) === +f; });
  }
  // Example load list filter: rifle/pistol, then caliber, then free-text search (name, caliber, bullet, powder).
  function loadPistol(L) {
    var c = L.caliber || {}, k = all('calibers').find(function (x) { return x.name === c.name; });
    return k && k.pistol != null ? !!k.pistol : (c.caselen < 35 && c.oal < 45);
  }
  function loadList() {
    var t = $('loadType') ? $('loadType').value : '', cal = $('loadCal') ? $('loadCal').value : '';
    var q = $('loadSearch') ? $('loadSearch').value.trim().toLowerCase().split(/\s+/).filter(Boolean) : [];
    var byType = DB.loads.concat(comm.loads).filter(function (L) { return !t || (t === 'pistol') === loadPistol(L); });
    var sel = $('loadCal');
    if (sel) {                                                           // caliber choices for the chosen type, with counts
      var n = {}; byType.forEach(function (L) { var c = (L.caliber || {}).name || '?'; n[c] = (n[c] || 0) + 1; });
      var names = Object.keys(n).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
      if (cal && !n[cal]) cal = '';
      sel.innerHTML = GRTHTML('');
      [['', 'All calibers (' + names.length + ')']].concat(names.map(function (c) { return [c, c + ' (' + n[c] + ')']; })).forEach(function (o) {
        var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
      });
      sel.value = cal;
    }
    return byType.filter(function (L) {
      if (cal && ((L.caliber || {}).name || '?') !== cal) return false;
      var hay = [L.name, (L.caliber || {}).name, (L.projectile || {}).name, (L.powder || {}).name, L.src].join(' ').toLowerCase();
      return q.every(function (w) { return hay.indexOf(w) >= 0; });
    });
  }
  function fillDia() {
    var sel = $('projDia'); if (!sel) return;
    var cur = sel.value || store.get('projDia') || 'match', n = {};
    all('projectiles').forEach(function (p) { if (p.dia > 0) { var k = diaKey(p.dia); n[k] = (n[k] || 0) + 1; } });
    var opts = [['match', 'Match caliber' + (S.groove ? ' (.' + String(diaKey(S.groove)).padStart(3, '0') + '″)' : '')], ['all', 'All diameters']]
      .concat(Object.keys(n).sort(function (a, b) { return a - b; }).map(function (k) {
        return [k, '.' + String(k).padStart(3, '0') + '″ · ' + (k * 0.0254).toFixed(2) + ' mm (' + n[k] + ')'];
      }));
    sel.innerHTML = GRTHTML('');
    opts.forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op); });
    sel.value = opts.some(function (o) { return o[0] === cur; }) ? cur : 'match';
  }

  // ---------- build inputs ----------
  function buildFields() {
    Object.keys(F).forEach(function (grp) {
      var box = $('f-' + grp); if (!box) return; box.innerHTML = GRTHTML('');
      F[grp].forEach(function (f) {
        var row = document.createElement('label'); row.className = 'row';
        row.innerHTML = GRTHTML('<span class="lbl">' + f[1] + '</span><input type="number" step="any" id="in-' + f[0] + '"><span class="unit">' + unitLabel(f[2]) + '</span>');
        if (['Ba','a0','z1','z2','Qex','k','pc','pcd','eta','tcc','tch'].indexOf(f[0]) >= 0) row.classList.add('adv');
        box.appendChild(row);
        row.querySelector('input').addEventListener('change', function (e) {
          var v = parseFloat(e.target.value); if (isNaN(v)) return;
          S[f[0]] = fromDisp(v, f[2]); compute();
        });
      });
    });
  }
  function writeFields() {
    Object.keys(F).forEach(function (grp) { F[grp].forEach(function (f) {
      var el = $('in-' + f[0]); if (el && S[f[0]] != null) el.value = fmt(toDisp(S[f[0]], f[2]), f[2] === 'none' ? 'none' : f[2]);
      if (el && f[2] === 'none') el.value = +(+S[f[0]]).toFixed(4);
    }); });
  }

  // ---------- apply DB records ----------
  // Straight-wall velocity calibration: these low-pressure, big-bore cartridges use an estimated case capacity and
  // estimated flat/round-nose bullet lengths, leaving a per-cartridge muzzle-velocity bias the shared powder fit can't
  // remove. One factor per cartridge, fitted to published loads on a held-out split (validation/swcal.js; re-run after a
  // web/data.js rebuild). Pressure is unaffected; unlisted calibers use 1.
  var SWCAL = {
    '45-70 Government (typical)': 0.914, '444 Marlin (typical)': 0.947, '450 Marlin (typical)': 0.97,
    '458 Win Magnum (typical)': 0.954, '350 Legend (typical)': 1.065, '375 Winchester (typical)': 0.972,
    '38-55 Winchester (typical)': 0.944
  };
  function applyCaliber(c) {
    S.caliberName = c.name; S.caselen = c.caselen; S.oal = c.oal || S.oal; S.casevol = c.casevol || c.casevolGrH2O * E.GRH2O_CM3;
    S.groove = c.groove; S.aeff = c.aeff || 0; S.pmax = c.pmax; S.sebert = c.sebert || 0.5; S.ps = c.ps || S.ps || 250;
    S.calPistol = c.pistol != null ? !!c.pistol : (c.caselen < 35 && c.oal < 45);   // handgun caliber (published flag, else size)
    S.barrel = c.barrel || (S.calPistol ? 127 : 610);
    S.gap = c.revolver ? (c.gap || 0.15) : 0; S.cyl = c.cyl || Math.round(((S.oal || 0) + 1) * 100) / 100;
    S.calVcal = c.vcal || SWCAL[c.name] || 1;
  }
  // Revolver: barrel is measured from the cylinder face; gas leaks through the cylinder gap.
  function revolverObj() { return S.gap > 0 ? { gap: S.gap, cyl: S.cyl || (S.oal + 1) } : null; }
  function applyProjectile(p) {
    S.projName = p.name; S.mp = p.mass || p.massGr * E.GR; S.blen = p.len; S.friction = p.friction || 0;
  }
  function applyPowder(p) {
    S.baCal = 1; S.measured = []; S.calName = '';
    S.powderName = p.name; S.powderFit = p.fit || null; ['Ba','a0','z1','z2','Qex','k','pc','pcd','eta','tcc','tch'].forEach(function (k) { S[k] = p[k] || 0; });
    if (!S.eta) S.eta = 1;
  }
  function applyLoad(L) {
    applyCaliber(L.caliber); S.barrel = L.gun.barrel || S.barrel; applyProjectile(L.projectile); applyPowder(L.powder);
    S.mc = L.powder.mc; S.T = L.powder.pt || 21; S.laddercnt = L.powder.laddercnt || 1; S.laddermc = L.powder.laddermc || 0.0648;
    S.title = L.name; S.measured = L.measured || []; S.baCal = 1;
  }

  // ---------- compute ----------
  function powderObj() { return { Ba: S.Ba * (S.baCal || 1), a0: S.a0, z1: S.z1, z2: S.z2, Qex: S.Qex, k: S.k, pc: S.pc, pcd: S.pcd, eta: S.eta, tcc: S.tcc, tch: S.tch }; }
  function compute() {
    store.set('state', S);
    var n = Math.max(1, Math.min(10, Math.round(S.laddercnt || 1)));
    results = [];
    for (var i = 0; i < n; i++) {
      var mc = S.mc - i * (n > 1 ? S.laddermc : 0); if (mc <= 0) break;
      var r = E.simulate({ casevol: S.casevol, groove: S.groove, aeff: S.aeff, oal: S.oal, caselen: S.caselen, barrel: S.barrel,
        ps: S.ps, sebert: S.sebert, mp: S.mp, blen: S.blen, friction: S.friction, mc: mc, T: S.T, powder: powderObj(), pmax: S.pmax, pistol: S.calPistol, revolver: revolverObj(), vcal: S.calVcal });
      r.mc = mc; results.push(r);
    }
    if (focus >= results.length) focus = 0;
    render();
  }

  // ---------- rendering ----------
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function render() {
    writeFields();
    var r = results[focus]; if (!r) return;
    var sum = $('summary');
    if (sum) sum.innerHTML =
      GRTHTML('<div class="t">' + esc(S.caliberName || 'Custom caliber') + '</div>' +
      '<div>' + esc(S.projName || 'Custom bullet') + '</div>' +
      '<div>' + esc(S.powderName || 'Custom powder') + ' · ' + fmt(toDisp(r.mc, 'mass'), 'mass') + ' ' + unitLabel('mass') + '</div>' +
      '<div class="muted">Seating depth ' + fmt(toDisp(r.seat, 'len'), 'len') + ' ' + unitLabel('len') + ' · free volume ' + fmt(toDisp(r.freeVol, 'vol'), 'vol') + ' ' + unitLabel('vol') + '</div>' +
      (S.powderFit ? '<div class="muted">Fitted powder: velocity typically within ±' + (S.powderFit.velErrMedian * 100).toFixed(1) +
        ' % of published data' + (S.powderFit.velErr90 ? ', 9 in 10 loads within ±' + (S.powderFit.velErr90 * 100).toFixed(0) + ' %' : '') + '; pressure is a rough estimate (±20 %). Never exceed published maximum loads.</div>' : '') +
      (S.baCal && S.baCal !== 1 ? '<div class="muted">Chrono-calibrated' + (S.calName ? ' (' + esc(S.calName) + ')' : '') + ': Ba ×' + S.baCal.toFixed(3) + '</div>' : ''));
    var kv = [
      ['Max. pressure', fmt(toDisp(r.pmax, 'pres'), 'pres') + ' ' + unitLabel('pres'), r.overPmax ? 'bad' : 'p'],
      ['Muzzle pressure', fmt(toDisp(r.pmuzzle, 'pres'), 'pres') + ' ' + unitLabel('pres'), 'p'],
      ['Muzzle velocity', imperial ? (r.v * 3.28084).toFixed(0) + ' fps' : r.v.toFixed(0) + ' m/s', 'v'],
      ['Muzzle energy', imperial ? (r.E * 0.737562).toFixed(0) + ' ft·lbf' : r.E.toFixed(0) + ' J', 'e'],
      ['Barrel time', (r.t * 1000).toFixed(3) + ' ms', ''],
      ['Fill ratio', r.fill.toFixed(1) + ' %', r.fill > 105 ? 'bad' : ''],
      ['Burnt powder', (r.z * 100).toFixed(1) + ' %', ''],
      ['Efficiency', r.eff.toFixed(1) + ' %', ''],
      ['IPSC factor', r.ipsc.toFixed(1), '']];
    if (r.invalid) kv.forEach(function (k) { if (k[0] !== 'Fill ratio') { k[1] = '—'; k[2] = ''; } });
    var res = $('results');
    if (res) res.innerHTML = GRTHTML(kv.map(function (k) { return '<div class="kv ' + k[2] + '"><span>' + k[0] + '</span><b>' + k[1] + '</b></div>'; }).join('') +
      (r.invalid ? '<div class="warn">⚠ ' + esc(r.invalid) + '</div>' : '') +
      (r.overPmax ? '<div class="warn">⚠ ' + (r.pmax > S.pmax ? 'Exceeds' : 'Near') + ' the caliber\'s maximum pressure</div>' : ''));
    var lad = $('ladder');
    if (lad) lad.innerHTML = GRTHTML(results.length < 2 ? '<span class="muted">Ladder off (steps = 1)</span>' :
      results.map(function (q, i) {
        return '<button class="lstep' + (i === focus ? ' on' : '') + (q.overPmax ? ' over' : '') + '" data-i="' + i + '">' +
          fmt(toDisp(q.mc, 'mass'), 'mass') + '<small>' + (q.invalid ? '—' : imperial ? (q.v * 3.28084).toFixed(0) : q.v.toFixed(0)) + '</small></button>';
      }).join(''));
    drawMain(); drawViv();
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function setupCanvas(cv) {
    var w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!w || !h) return null;
    cv.width = w * dpr; cv.height = h * dpr; var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h); c.font = '11px system-ui, sans-serif'; return { c: c, w: w, h: h };
  }
  var hoverX = null;
  function drawMain() {
    var cv = $('chart'); if (!cv || !results.length) return; var g = setupCanvas(cv); if (!g) return;
    var c = g.c, L = 52, R = 52, T = 14, B = 26, W = g.w - L - R, H = g.h - T - B;
    var xmax = results[0].travel, pmax = 0, vmax = 0;
    results.forEach(function (r) { if (!r.invalid) { pmax = Math.max(pmax, r.pmax); vmax = Math.max(vmax, r.v); } });
    if (!pmax) pmax = S.pmax || 4000; if (!vmax) vmax = 1000;
    if (S.pmax) pmax = Math.max(pmax, S.pmax); pmax *= 1.1; vmax *= 1.1;
    var X = function (x) { return L + x / xmax * W; }, YP = function (p) { return T + H - p / pmax * H; }, YV = function (v) { return T + H - v / vmax * H; };
    c.strokeStyle = css('--grid'); c.fillStyle = css('--muted'); c.lineWidth = 1;
    for (var i = 0; i <= 5; i++) {
      var y = T + H * i / 5; c.beginPath(); c.moveTo(L, y); c.lineTo(L + W, y); c.stroke();
      c.textAlign = 'right'; c.fillText(fmt(toDisp(pmax * (1 - i / 5), 'pres'), 'pres'), L - 4, y + 4);
      c.textAlign = 'left'; c.fillText((imperial ? vmax * (1 - i / 5) * 3.28084 : vmax * (1 - i / 5)).toFixed(0), L + W + 4, y + 4);
    }
    c.textAlign = 'center';
    for (i = 0; i <= 5; i++) c.fillText(fmt(toDisp(xmax * 1000 * i / 5, 'len'), 'len'), X(xmax * i / 5), T + H + 16);
    c.fillText('bullet travel (' + unitLabel('len') + ')', L + W / 2, g.h - 1);
    c.save(); c.translate(10, T + H / 2); c.rotate(-Math.PI / 2); c.fillStyle = css('--c-p'); c.fillText('pressure (' + unitLabel('pres') + ')', 0, 0); c.restore();
    c.save(); c.translate(g.w - 6, T + H / 2); c.rotate(Math.PI / 2); c.fillStyle = css('--c-v'); c.fillText('velocity (' + (imperial ? 'fps' : 'm/s') + ')', 0, 0); c.restore();
    if (S.pmax) { c.strokeStyle = css('--bad'); c.setLineDash([5, 4]); c.beginPath(); c.moveTo(L, YP(S.pmax)); c.lineTo(L + W, YP(S.pmax)); c.stroke(); c.setLineDash([]); }
    results.forEach(function (r, idx) {
      var on = idx === focus; c.globalAlpha = on ? 1 : 0.28; c.lineWidth = on ? 2.2 : 1.2;
      [[1, function (p) { return YP(p / 1e5); }, '--c-p'], [2, YV, '--c-v']].forEach(function (s) {
        c.strokeStyle = css(s[2]); c.beginPath();
        r.curve.forEach(function (pt, j) { var px = X(pt[0]), py = s[1](pt[s[0]]); j ? c.lineTo(px, py) : c.moveTo(px, py); }); c.stroke();
      });
    });
    c.globalAlpha = 1;
    var r = results[focus];
    if (hoverX != null && hoverX >= L && hoverX <= L + W && r.curve.length) {
      var xm = (hoverX - L) / W * xmax, pt = r.curve.reduce(function (a, b) { return Math.abs(b[0] - xm) < Math.abs(a[0] - xm) ? b : a; });
      c.strokeStyle = css('--muted'); c.beginPath(); c.moveTo(hoverX, T); c.lineTo(hoverX, T + H); c.stroke();
      var txt = fmt(toDisp(pt[0] * 1000, 'len'), 'len') + ' ' + unitLabel('len') + ' · ' + fmt(toDisp(pt[1] / 1e5, 'pres'), 'pres') + ' ' + unitLabel('pres') +
        ' · ' + (imperial ? (pt[2] * 3.28084).toFixed(0) + ' fps' : pt[2].toFixed(0) + ' m/s') + ' · ' + (pt[3] * 1000).toFixed(3) + ' ms';
      c.font = '12px system-ui, sans-serif'; var tw = c.measureText(txt).width + 12, tx = Math.min(Math.max(hoverX - tw / 2, L), L + W - tw);
      c.fillStyle = css('--panel'); c.fillRect(tx, T + 2, tw, 20); c.strokeRect(tx, T + 2, tw, 20);
      c.fillStyle = css('--fg'); c.textAlign = 'left'; c.fillText(txt, tx + 6, T + 16);
    }
  }
  function drawViv() {
    var cv = $('viv'); if (!cv) return; var g = setupCanvas(cv); if (!g) return;
    var c = g.c, L = 26, B = 16, T = 6, W = g.w - L - 6, H = g.h - T - B, pw = powderObj(), mx = 0, z;
    for (z = 0; z <= 1; z += 0.005) mx = Math.max(mx, E.phi(z, pw)); mx *= 1.1;
    c.strokeStyle = css('--grid'); c.strokeRect(L, T, W, H); c.fillStyle = css('--muted'); c.textAlign = 'center';
    c.fillText('z (burnt fraction)', L + W / 2, g.h - 3); c.textAlign = 'right'; c.fillText(mx.toFixed(1), L - 3, T + 9); c.fillText('0', L - 3, T + H);
    var segs = [[0, pw.z1, '--c-1'], [pw.z1, pw.z2, '--c-2'], [pw.z2, 1, '--c-3']];
    segs.forEach(function (s) {
      c.strokeStyle = css(s[2]); c.lineWidth = 2.2; c.beginPath();
      for (z = s[0]; z <= s[1] + 1e-9; z += 0.004) { var x = L + z * W, y = T + H - E.phi(z, pw) * pw.Ba / (mx * pw.Ba) * H; z === s[0] ? c.moveTo(x, y) : c.lineTo(x, y); }
      c.stroke();
    });
    c.fillStyle = css('--muted'); c.textAlign = 'left'; c.fillText('Ba·φ(z)  Ba=' + (+pw.Ba).toFixed(3), L + 4, T + 12);
  }

  // ---------- chronograph calibration ----------
  function measXml() {
    if (!S.measured || !S.measured.length) return '';
    return '    <appendix>\n      <Measurement title="MEASUREMENTS">\n' + S.measured.map(function (m, i) {
      return '        <charge name="Charge%20' + (i + 1) + '" value="' + (m.mc / 1000) + '">\n          <shot velocity="' + m.v + '" pressure="0" />\n        </charge>\n';
    }).join('') + '      </Measurement>\n    </appendix>\n';
  }
  function simAt(mc, f, over) {
    return E.simulate(Object.assign({ casevol: S.casevol, groove: S.groove, aeff: S.aeff, oal: S.oal, caselen: S.caselen, barrel: S.barrel, ps: S.ps, sebert: S.sebert,
      mp: S.mp, blen: S.blen, friction: S.friction, mc: mc, T: S.T, revolver: revolverObj(), vcal: S.calVcal, powder: Object.assign(powderObj(), { Ba: S.Ba * f }) }, over || {}));
  }
  function fitBa(meas, over) {
    var err = function (f) { return meas.reduce(function (a, m) { var d = simAt(m.mc, f, over).v / m.v - 1; return a + d * d * (m.n || 1); }, 0); };
    var lo = Math.log(0.25), hi = Math.log(4), g = 0.381966;          // golden-section search on log(f)
    var a = lo + g * (hi - lo), b = hi - g * (hi - lo), fa = err(Math.exp(a)), fb = err(Math.exp(b));
    for (var i = 0; i < 40; i++) {
      if (fa < fb) { hi = b; b = a; fb = fa; a = lo + g * (hi - lo); fa = err(Math.exp(a)); }
      else { lo = a; a = b; fa = fb; b = hi - g * (hi - lo); fb = err(Math.exp(b)); }
    }
    return Math.exp((lo + hi) / 2);
  }
  function velDisp(v) { return imperial ? v * 3.28084 : v; }
  function velFrom(v) { return imperial ? v / 3.28084 : v; }
  window.GRTApp = {
    state: function () { return S; }, setState: function (o) { Object.assign(S, o); populate(); compute(); },
    simAt: simAt, fitBa: fitBa, fmt: fmt, toDisp: toDisp, fromDisp: fromDisp, unitLabel: unitLabel, velDisp: velDisp, velFrom: velFrom,
    imperial: function () { return imperial; }, toast: toast, store: store, esc: esc, $: $,
    setCommunity: function (d) { comm = d; if (lists.calibers) populate(); }
  };

  // ---------- file import / export ----------
  function enc(v) { return encodeURIComponent(v == null ? '' : v); }
  function exportLoad() {
    var I = function (n, v, u) { return '      <input name="' + n + '" value="' + enc(v) + '" unit="' + (u || '') + '" />\n'; };
    var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>\n<GarysReloadingTool version="web-1.0">\n  <InnerBallistikInput>\n' +
      '    <title>' + enc(S.title || ((S.caliberName || '') + ' ' + (S.projName || '') + ' ' + (S.powderName || ''))) + '</title>\n    <caliber>\n' +
      I('CaliberName', S.caliberName) + I('oal', S.oal, 'mm') + I('caselen', S.caselen, 'mm') + I('casevol', S.casevol, 'cm3') + I('Dz', S.groove, 'mm') +
      I('Aeff', S.aeff, 'mm2') + I('pMaxZul', S.pmax, 'bar') + I('sebert', S.sebert) + I('ps', S.ps, 'bar') + '    </caliber>\n    <gun>\n' + I('xe', S.barrel, 'mm') +
      '    </gun>\n    <projectile>\n' + I('ProjectileName', S.projName) + I('mp', S.mp, 'g') + I('glen', S.blen, 'mm') + I('gfriction', S.friction, 'bar') +
      '    </projectile>\n    <propellant>\n' + I('pname', S.powderName) +
      ['Ba','Qex','k','a0','z1','z2','eta','pc','pcd','tcc','tch'].map(function (k) { return I(k, S[k]); }).join('') +
      I('pt', S.T, 'Cel') + I('mc', S.mc, 'g') + I('laddercnt', S.laddercnt) + I('laddermc', S.laddermc, 'g') + '    </propellant>\n' + measXml() + '  </InnerBallistikInput>\n</GarysReloadingTool>\n';
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
    a.download = ((S.title || S.caliberName || 'load').replace(/[^\w.-]+/g, '_').slice(0, 60)) + '.grtload'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function vars(el) {
    var o = {}; if (!el) return o;
    for (var i = 0; i < el.children.length; i++) { var c = el.children[i], n = c.getAttribute('name'); if (n && !(n in o)) o[n] = decodeURIComponent((c.getAttribute('value') || '').replace(/\+/g, ' ')); }
    return o;
  }
  var nf = function (o, k, d) { var v = parseFloat(o[k]); return isNaN(v) ? (d || 0) : v; };
  function importText(text, fname) {
    var doc = new DOMParser().parseFromString(GRTXML(text.replace(/<svar/g, '<var')), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Not a valid XML file');
    var ib = doc.querySelector('InnerBallistikInput'), added = 0;
    if (ib) {
      var c = vars(ib.querySelector('caliber')), g = vars(ib.querySelector('gun')), p = vars(ib.querySelector('projectile')), w = vars(ib.querySelector('propellant'));
      var t = ib.querySelector('title'), meas = [];
      ib.querySelectorAll('Measurement charge').forEach(function (ch) {
        var vs = Array.prototype.map.call(ch.querySelectorAll('shot'), function (x) { return parseFloat(x.getAttribute('velocity')); }).filter(function (v) { return v > 0; });
        var m = parseFloat(ch.getAttribute('value')) * 1000;   // kg -> g
        if (vs.length && m > 0) meas.push({ mc: m, v: vs.reduce(function (a, b) { return a + b; }, 0) / vs.length, n: vs.length });
      });
      applyLoad({ name: t ? decodeURIComponent(t.textContent) : fname,
        caliber: { name: c.CaliberName, oal: nf(c, 'oal'), caselen: nf(c, 'caselen'), casevol: nf(c, 'casevol'), groove: nf(c, 'Dz'), aeff: nf(c, 'Aeff'), pmax: nf(c, 'pMaxZul'), sebert: nf(c, 'sebert', 0.5), ps: nf(c, 'ps', 250) },
        gun: { barrel: nf(g, 'xe', 610) }, measured: meas, projectile: { name: p.ProjectileName, mass: nf(p, 'mp'), len: nf(p, 'glen'), friction: nf(p, 'gfriction') },
        powder: { name: ((w.mname || '') + ' ' + (w.pname || '')).trim(), Ba: nf(w, 'Ba'), Qex: nf(w, 'Qex'), k: nf(w, 'k'), a0: nf(w, 'a0'), z1: nf(w, 'z1'), z2: nf(w, 'z2'),
          eta: nf(w, 'eta', 1), pc: nf(w, 'pc'), pcd: nf(w, 'pcd'), tcc: nf(w, 'tcc'), tch: nf(w, 'tch'), mc: nf(w, 'mc'), pt: nf(w, 'pt', 21), laddercnt: nf(w, 'laddercnt', 1), laddermc: nf(w, 'laddermc') } });
      syncSelects(); compute(); return 'Load "' + S.title + '" opened' + (meas.length ? ' with ' + meas.length + ' measured charge(s). Use Calibrate to fit the powder' : '');
    }
    doc.querySelectorAll('propellantfile').forEach(function (el) { var d = vars(el);
      user.powders.unshift({ name: '★ ' + ((d.mname || '') + ' ' + (d.pname || '')).trim(), Ba: nf(d, 'Ba'), Qex: nf(d, 'Qex'), k: nf(d, 'k'), a0: nf(d, 'a0'), z1: nf(d, 'z1'), z2: nf(d, 'z2'), eta: nf(d, 'eta', 1), pc: nf(d, 'pc'), pcd: nf(d, 'pcd'), tcc: nf(d, 'tcc'), tch: nf(d, 'tch') }); added++; });
    doc.querySelectorAll('projectilefile').forEach(function (el) { var d = vars(el);
      user.projectiles.unshift({ name: '★ ' + [d.mname, d.pname, d.caliber, d.gmass + 'gr'].join(' '), dia: nf(d, 'gdia'), len: nf(d, 'glen'), massGr: nf(d, 'gmass'), friction: nf(d, 'gfriction') }); added++; });
    doc.querySelectorAll('caliberfile').forEach(function (el) { var d = vars(el);
      user.calibers.unshift({ name: '★ ' + (d.cipname || fname), caselen: nf(d, 'L3'), oal: nf(d, 'L6'), casevolGrH2O: nf(d, 'V'), groove: nf(d, 'G1'), pmax: nf(d, 'Pmax'), sebert: nf(d, 'sebert', 0.5) }); added++; });
    if (!added) throw new Error('No caliber, projectile, powder or load found');
    store.set('userdb', user); populate(); return added + ' record(s) added to your database (marked ★)';
  }
  function importFiles(files) {
    Array.prototype.forEach.call(files, function (f) {
      var rd = new FileReader();
      rd.onload = function () { try { toast(importText(rd.result, f.name)); } catch (e) { toast(f.name + ': ' + e.message, true); } };
      rd.readAsText(f);
    });
  }
  function toast(msg, bad) { var t = $('toast'); if (!t) return alert(msg); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(t._h); t._h = setTimeout(function () { t.className = 'toast'; }, 3500); }

  // ---------- selects ----------
  var lists = {};
  function populate() {
    fillDia();
    lists.loads = loadList(); lists.calibers = all('calibers'); lists.powders = all('powders'); lists.projectiles = projList();
    var nAll = DB.loads.length + comm.loads.length;
    fillSelect($('selLoad'), lists.loads, 'Example loads (' + (lists.loads.length < nAll ? lists.loads.length + ' of ' + nAll : nAll) + ')…');
    fillSelect($('selCaliber'), lists.calibers, 'Caliber (' + lists.calibers.length + ')…');
    fillSelect($('selProjectile'), lists.projectiles, 'Bullet (' + lists.projectiles.length + ')…');
    fillSelect($('selPowder'), lists.powders, 'Powder (' + lists.powders.length + ')…');
    syncSelects();
  }
  function syncSelects() {
    var ls = $('selLoad'), x = ls.querySelector('option[data-cur]'); if (x) x.remove();
    var li = S.title ? lists.loads.findIndex(function (l) { return l.name === S.title; }) : -1;
    if (li < 0 && S.title) { x = document.createElement('option'); x.value = 'cur'; x.dataset.cur = 1; x.textContent = S.title; ls.appendChild(x); }
    ls.value = li >= 0 ? li : S.title ? 'cur' : '';
    [['selCaliber', 'calibers', 'caliberName'], ['selProjectile', 'projectiles', 'projName'], ['selPowder', 'powders', 'powderName']].forEach(function (a) {
      var i = lists[a[1]].findIndex(function (x) { return x.name === S[a[2]]; }); $(a[0]).value = i >= 0 ? i : '';
    });
  }

  // ---------- size gate ----------
  function gate() {
    var g = $('gate'), mw = +document.body.dataset.minw, mh = +document.body.dataset.minh;
    if (!g || window._tryAnyway) return;
    var small = window.innerWidth < mw || window.innerHeight < mh;
    g.hidden = !small; document.body.classList.toggle('gated', small);
    if (small) $('gateSize').textContent = mw + ' × ' + mh + ' px (yours: ' + window.innerWidth + ' × ' + window.innerHeight + ')';
  }

  // ---------- init ----------
  function init() {
    gate(); window.addEventListener('resize', function () { gate(); render(); });
    var tb = $('gateTry'); if (tb) tb.onclick = function () { window._tryAnyway = true; $('gate').hidden = true; document.body.classList.remove('gated'); document.body.classList.add('tryanyway'); render(); };
    buildFields();
    var saved = store.get('state');
    if (saved && saved.casevol) S = saved; else applyLoad(DB.loads[1] || DB.loads[0]);
    if (S.laddercnt == null) S.laddercnt = 1;
    if ($('loadType')) $('loadType').value = store.get('loadType') || '';
    if ($('loadCal')) { var lc = store.get('loadCal') || ''; var op = document.createElement('option'); op.value = lc; $('loadCal').appendChild(op); $('loadCal').value = lc; }
    populate();
    $('selLoad').onchange = function (e) { if (e.target.value !== '' && e.target.value !== 'cur') { applyLoad(lists.loads[e.target.value]); populate(); compute(); } };
    $('selCaliber').onchange = function (e) { if (e.target.value !== '') { applyCaliber(lists.calibers[e.target.value]); S.title = ''; populate(); compute(); } };
    $('selProjectile').onchange = function (e) { if (e.target.value !== '') { applyProjectile(lists.projectiles[e.target.value]); S.title = ''; syncSelects(); compute(); } };
    $('selPowder').onchange = function (e) { if (e.target.value !== '') { applyPowder(lists.powders[e.target.value]); S.title = ''; syncSelects(); compute(); } };
    ['loadType', 'loadCal'].forEach(function (id) { if ($(id)) $(id).onchange = function (e) { store.set(id, e.target.value); populate(); }; });
    if ($('loadSearch')) $('loadSearch').oninput = function () { populate(); };
    if ($('projDia')) $('projDia').onchange = function (e) { store.set('projDia', e.target.value); populate(); };
    $('btnUnits').onclick = function () { imperial = !imperial; store.set('imperial', imperial); $('btnUnits').textContent = imperial ? 'Imperial' : 'Metric'; buildFields(); render(); };
    $('btnUnits').textContent = imperial ? 'Imperial' : 'Metric';
    $('btnSave').onclick = exportLoad;
    $('btnOpen').onclick = function () { $('file').click(); };
    $('file').onchange = function (e) { importFiles(e.target.files); e.target.value = ''; };
    if ($('btnAdv')) $('btnAdv').onclick = function () { document.body.classList.toggle('showadv'); $('btnAdv').classList.toggle('on'); };
    if ($('btnHelp')) $('btnHelp').onclick = function () { $('help').hidden = false; };
    document.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = function () { b.closest('.modal').hidden = true; }; });
    document.addEventListener('click', function (e) { var b = e.target.closest('.lstep'); if (b) { focus = +b.dataset.i; render(); } });
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) { e.preventDefault(); importFiles(e.dataTransfer.files); });
    var cv = $('chart');
    if (cv) {
      var mv = function (e) { var r = cv.getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left; hoverX = x; drawMain(); };
      cv.addEventListener('mousemove', mv); cv.addEventListener('touchmove', mv, { passive: true }); cv.addEventListener('touchstart', mv, { passive: true });
      cv.addEventListener('mouseleave', function () { hoverX = null; drawMain(); });
    }
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      b.onclick = function () {
        var grp = b.dataset.group;
        document.querySelectorAll('[data-group="' + grp + '"]').forEach(function (x) { x.classList.toggle('on', x === b); });
        document.querySelectorAll('[data-pane="' + grp + '"]').forEach(function (p) { p.hidden = p.id !== b.dataset.tab; });
        render();
      };
    });
    compute();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
