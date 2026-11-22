/* Gary's Reloading Tool – calibration library.
 * Users record chronograph data together with the firearm and load it was shot from,
 * fit the powder model to it, save it in this browser, and export/import it as a JSON file. */
(function () {
  'use strict';
  var A = window.GRTApp, $ = A.$, KEY = 'calibrations', FORMAT = 'GarysReloadingTool-calibrations';
  var recs = A.store.get(KEY) || [], cur = null;

  // Text fields: [id, label, placeholder]. Numeric fields: [id, label, unit kind].
  var TEXT = [['name', 'Record name', 'e.g. Tikka T3x 6.5CM – N540 lot 12'], ['make', 'Firearm make', 'Tikka'], ['model', 'Firearm model', 'T3x Varmint'],
    ['serial', 'Serial / ID', 'optional'], ['powderLot', 'Powder lot', ''], ['primer', 'Primer', 'CCI BR-2'], ['brass', 'Brass', 'Lapua, 3× fired'],
    ['chrono', 'Chronograph', 'Garmin Xero C1'], ['date', 'Date', ''], ['location', 'Location / altitude', '']];
  var NUM = [['barrel', 'Barrel length', 'len'], ['twist', 'Twist (1 in …)', 'len'], ['T', 'Powder temp.', 'temp'], ['ambient', 'Air temp.', 'temp'],
    ['casevol', 'Measured case vol.', 'vol'], ['oal', 'Measured OAL', 'len']];

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function save() { A.store.set(KEY, recs); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function stats(v) {
    var n = v.length, m = v.reduce(function (a, b) { return a + b; }, 0) / n;
    var sd = n > 1 ? Math.sqrt(v.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (n - 1)) : 0;
    return { n: n, avg: m, sd: sd, es: Math.max.apply(null, v) - Math.min.apply(null, v) };
  }

  // A fresh record seeded from the load currently on screen.
  function fromCurrent() {
    var S = A.state();
    return { id: uid(), name: '', make: '', model: '', serial: '', powderLot: '', primer: '', brass: '', chrono: '', date: today(), location: '', notes: '',
      barrel: S.barrel, twist: S.twist || 254, T: S.T == null ? 21 : S.T, ambient: S.T == null ? 21 : S.T, casevol: S.casevol, oal: S.oal,
      load: snapshot(S), shots: (S.measured || []).map(function (m) { return { mc: m.mc, v: [m.v] }; }), baCal: 1 };
  }
  function snapshot(S) {
    var o = {};
    ['caliberName', 'caselen', 'groove', 'aeff', 'pmax', 'ps', 'sebert', 'projName', 'mp', 'blen', 'friction', 'powderName',
      'Ba', 'a0', 'z1', 'z2', 'Qex', 'k', 'pc', 'pcd', 'eta', 'tcc', 'tch', 'laddercnt', 'laddermc', 'mc'].forEach(function (k) { o[k] = S[k]; });
    return o;
  }
  // Simulation overrides so fitting uses the record's own firearm and conditions, not whatever is on screen.
  function overrides(r) {
    var L = r.load;
    return { casevol: r.casevol || L.casevol, oal: r.oal, barrel: r.barrel, T: r.T, caselen: L.caselen, groove: L.groove, aeff: L.aeff, ps: L.ps,
      sebert: L.sebert, mp: L.mp, blen: L.blen, friction: L.friction };
  }

  // ---------- form <-> record ----------
  function buildForm() {
    $('cFieldsT').innerHTML = GRTHTML(TEXT.map(function (f) {
      return '<label class="cf"><span>' + f[1] + '</span><input id="c-' + f[0] + '" type="' + (f[0] === 'date' ? 'date' : 'text') + '" placeholder="' + A.esc(f[2]) + '"></label>';
    }).join(''));
    $('cFieldsN').innerHTML = GRTHTML(NUM.map(function (f) {
      return '<label class="cf"><span>' + f[1] + ' <i>' + A.unitLabel(f[2]) + '</i></span><input id="c-' + f[0] + '" type="number" step="any"></label>';
    }).join(''));
    $('cShotsUnit').textContent = A.unitLabel('mass') + ': ' + (A.imperial() ? 'fps' : 'm/s');
  }
  function show(r) {
    cur = r; buildForm();
    TEXT.forEach(function (f) { $('c-' + f[0]).value = r[f[0]] || ''; });
    NUM.forEach(function (f) { $('c-' + f[0]).value = r[f[0]] == null ? '' : A.fmt(A.toDisp(r[f[0]], f[2]), f[2]); });
    $('c-notes').value = r.notes || '';
    $('cShots').value = r.shots.map(function (s) {
      return A.fmt(A.toDisp(s.mc, 'mass'), 'mass') + ': ' + s.v.map(function (v) { return A.velDisp(v).toFixed(0); }).join(' ');
    }).join('\n');
    $('cLoad').textContent = [r.load.caliberName, r.load.projName, r.load.powderName].filter(Boolean).join(' · ') || 'custom load';
    report(); list();
  }
  function read() {
    var r = cur;
    TEXT.forEach(function (f) { r[f[0]] = $('c-' + f[0]).value.trim(); });
    NUM.forEach(function (f) { var v = parseFloat($('c-' + f[0]).value); r[f[0]] = isNaN(v) ? null : A.fromDisp(v, f[2]); });
    r.notes = $('c-notes').value;
    r.shots = $('cShots').value.split(/\n+/).map(function (line) {
      var n = line.split(/[\s,;:\t]+/).map(parseFloat).filter(function (x) { return !isNaN(x) && x > 0; });
      return n.length >= 2 ? { mc: A.fromDisp(n[0], 'mass'), v: n.slice(1).map(A.velFrom) } : null;
    }).filter(Boolean);
    if (!r.name) r.name = [r.make, r.model, r.load.caliberName, r.load.powderName].filter(Boolean).join(' ') || 'Calibration ' + r.date;
    return r;
  }
  function report() {
    var r = cur, o = overrides(r);
    if (!r.shots.length) { $('cOut').innerHTML = GRTHTML('<span class="muted">No shots yet. One line per charge: charge, then each velocity.</span>'); return; }
    $('cOut').innerHTML = GRTHTML('<table><tr><th>Charge</th><th>n</th><th>Avg</th><th>SD</th><th>ES</th><th>Model</th><th>Δ</th></tr>' + r.shots.map(function (s) {
      var st = stats(s.v), m = A.simAt(s.mc, r.baCal || 1, o).v;
      return '<tr><td>' + A.fmt(A.toDisp(s.mc, 'mass'), 'mass') + '</td><td>' + st.n + '</td><td>' + A.velDisp(st.avg).toFixed(0) + '</td><td>' + A.velDisp(st.sd).toFixed(1) +
        '</td><td>' + A.velDisp(st.es).toFixed(0) + '</td><td>' + A.velDisp(m).toFixed(0) + '</td><td>' + ((m / st.avg - 1) * 100).toFixed(1) + ' %</td></tr>';
    }).join('') + '</table><div>Powder factor: <b>Ba ×' + (r.baCal || 1).toFixed(3) + '</b>' + (r.baCal === 1 ? ' <span class="muted">(not fitted)</span>' : '') + '</div>');
  }
  function list() {
    var sel = $('cList');
    sel.innerHTML = GRTHTML('<option value="">Saved calibrations (' + recs.length + ')…</option>' + recs.map(function (r) {
      return '<option value="' + r.id + '"' + (cur && r.id === cur.id ? ' selected' : '') + '>' + A.esc(r.name) + '</option>';
    }).join(''));
  }

  // ---------- actions ----------
  function fit() {
    var r = read();
    if (!r.shots.length) return A.toast('Enter at least one charge with velocities', true);
    r.baCal = A.fitBa(r.shots.map(function (s) { var st = stats(s.v); return { mc: s.mc, v: st.avg, n: st.n }; }), overrides(r));
    report();
    var worst = Math.max.apply(null, r.shots.map(function (s) { return Math.abs(A.simAt(s.mc, r.baCal, overrides(r)).v / stats(s.v).avg - 1); }));
    if (r.baCal > 2.5 || r.baCal < 0.4 || worst > 0.05)
      A.toast('Poor fit (Ba ×' + r.baCal.toFixed(2) + ', up to ' + (worst * 100).toFixed(0) + ' % off). Check the charge units and that the load matches these shots.', true);
    else A.toast('Fitted: Ba ×' + r.baCal.toFixed(3) + '. Save to keep it.');
  }
  function store() {
    var r = read(); r.updated = new Date().toISOString();
    var i = recs.findIndex(function (x) { return x.id === r.id; }); if (i >= 0) recs[i] = r; else recs.unshift(r);
    save(); list(); show(r); A.toast('Saved "' + r.name + '" in this browser. Use Export for a backup.');
  }
  function apply(rec) {
    var r = rec && rec.load ? rec : read(), L = r.load, S = {};
    Object.keys(L).forEach(function (k) { S[k] = L[k]; });
    S.barrel = r.barrel; S.T = r.T; S.twist = r.twist; if (r.casevol) S.casevol = r.casevol; if (r.oal) S.oal = r.oal;
    S.baCal = r.baCal || 1; S.calName = r.name;
    S.measured = r.shots.map(function (s) { var st = stats(s.v); return { mc: s.mc, v: st.avg, n: st.n }; });
    S.title = r.name; A.setState(S); $('calib').hidden = true; A.toast('Applied "' + r.name + '"');
  }
  function remove() {
    if (!cur || !recs.some(function (x) { return x.id === cur.id; })) return show(fromCurrent());
    if (!confirm('Delete "' + cur.name + '" from this browser? This cannot be undone unless you exported it.')) return;
    recs = recs.filter(function (x) { return x.id !== cur.id; }); save(); show(fromCurrent());
  }
  function exportAll() {
    if (cur) read();
    var data = { format: FORMAT, version: 1, exported: new Date().toISOString(), records: recs };
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = 'garys-calibrations-' + today() + '.json'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function importFile(f) {
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result), arr = d && d.format === FORMAT ? d.records : null;
        if (!Array.isArray(arr)) throw new Error('not a calibration file');
        var n = 0;
        arr.forEach(function (r) {
          if (!r || !r.load || !Array.isArray(r.shots)) return;
          var i = recs.findIndex(function (x) { return x.id === r.id; });
          if (i >= 0) recs[i] = r; else recs.push(r); n++;
        });
        save(); list(); A.toast(n + ' calibration(s) imported');
      } catch (e) { A.toast(f.name + ': ' + e.message, true); }
    };
    rd.readAsText(f);
  }

  function open() { show(fromCurrent()); $('calib').hidden = false; }
  // Used by community.js
  window.GRTCalib = {
    current: function () { return cur ? read() : null; }, stats: stats, apply: apply, uid: uid,
    add: function (r) { var i = recs.findIndex(function (x) { return x.id === r.id; }); if (i >= 0) recs[i] = r; else recs.unshift(r); save(); list(); show(r); }
  };
  function init() {
    if ($('btnCal')) $('btnCal').onclick = open;
    $('cList').onchange = function (e) { var r = recs.find(function (x) { return x.id === e.target.value; }); if (r) show(JSON.parse(JSON.stringify(r))); };
    $('cNew').onclick = function () { show(fromCurrent()); };
    $('cFit').onclick = fit; $('cSave').onclick = store; $('cApply').onclick = apply; $('cDel').onclick = remove;
    $('cExport').onclick = exportAll; $('cImport').onclick = function () { $('cFile').click(); };
    $('cFile').onchange = function (e) { Array.prototype.forEach.call(e.target.files, importFile); e.target.value = ''; };
    document.querySelectorAll('[data-ctab]').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('[data-ctab]').forEach(function (x) { x.classList.toggle('on', x === b); });
        document.querySelectorAll('#calib [data-cp]').forEach(function (c) { c.classList.toggle('off', c.dataset.cp !== b.dataset.ctab); });
        if (cur) { read(); report(); }
      };
    });
    if (document.querySelector('.ctabs') && getComputedStyle(document.querySelector('.ctabs')).display !== 'none') document.querySelectorAll('#calib [data-cp]').forEach(function (c) { c.classList.toggle('off', c.dataset.cp !== '0'); });
    $('cShots').addEventListener('change', function () { read(); report(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
