/* Gary's Reloading Tool – shared community calibration database.
 * Reads a public JSON file (GRT_CONFIG.communityIndexUrl) and caches it so it also works offline.
 * Sharing opens a pre-filled GitHub issue; a maintainer-reviewed workflow adds it to the file. */
(function () {
  'use strict';
  var A = window.GRTApp, C = function () { return window.GRTCalib; }, $ = A.$, CFG = window.GRT_CONFIG || {};
  var FORMAT = 'GarysReloadingTool-community', CACHE = 'communityCache';
  var all = [], page = 0, status = '';
  var configured = function () { return CFG.communityIndexUrl && !/OWNER\/REPO/.test(CFG.communityIndexUrl); };

  // Only these fields ever leave the user's browser. Serial number and location are never shared.
  var SHARE_FIELDS = ['make', 'model', 'barrel', 'twist', 'powderLot', 'primer', 'brass', 'chrono', 'T', 'ambient', 'casevol', 'oal', 'baCal'];
  var LOAD_FIELDS = ['caliberName', 'caselen', 'groove', 'aeff', 'pmax', 'ps', 'sebert', 'projName', 'mp', 'blen', 'friction', 'powderName',
    'Ba', 'a0', 'z1', 'z2', 'Qex', 'k', 'pc', 'pcd', 'eta', 'tcc', 'tch'];
  function sanitize(r, opts) {
    var o = { id: C().uid(), sharedAt: new Date().toISOString().slice(0, 10), month: (r.date || '').slice(0, 7), load: {}, shots: [] };
    SHARE_FIELDS.forEach(function (k) { if (r[k] != null && r[k] !== '') o[k] = r[k]; });
    LOAD_FIELDS.forEach(function (k) { if (r.load[k] != null) o.load[k] = r.load[k]; });
    o.shots = r.shots.map(function (s) { return { mc: +s.mc.toFixed(5), v: s.v.map(function (v) { return +v.toFixed(1); }) }; });
    if (opts.notes && r.notes) o.notes = r.notes.slice(0, 500);
    if (opts.handle) o.submittedBy = opts.handle.slice(0, 40);
    o.name = [o.make, o.model, o.load.caliberName, o.load.powderName].filter(Boolean).join(' ');
    return o;
  }

  // ---------- fetch / cache ----------
  function setStatus(t) { status = t; var el = $('mStatus'); if (el) el.textContent = t; }
  function useData(d, note) {
    all = (d && d.format === FORMAT && Array.isArray(d.records) ? d.records : []).filter(function (r) { return r && r.load && Array.isArray(r.shots); });
    setStatus(all.length + ' shared calibrations' + note); page = 0; render();
  }
  function refresh() {
    var cached = A.store.get(CACHE);
    if (!configured()) { setStatus('The community database is not configured yet (see config.js).'); all = []; render(); return; }
    if (cached) useData(cached.data, ' · cached ' + cached.at.slice(0, 10));
    setStatus(status + ' · checking for updates…');
    fetch(CFG.communityIndexUrl, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        if (!d || d.format !== FORMAT) throw new Error('unexpected file format');
        var at = new Date().toISOString(); A.store.set(CACHE, { at: at, data: d }); useData(d, ' · updated ' + at.slice(0, 10));
      })
      .catch(function (e) { setStatus((cached ? all.length + ' shared calibrations · offline copy from ' + cached.at.slice(0, 10) : 'Could not load the community database') + ' (' + e.message + ')'); });
  }

  // ---------- list ----------
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim(); }
  function filtered() {
    var S = A.state(), q = norm($('mSearch').value), match = $('mMatch').checked;
    return all.filter(function (r) {
      if (match && (norm(r.load.caliberName) !== norm(S.caliberName) || norm(r.load.powderName).indexOf(norm(S.powderName).split(' (')[0]) < 0)) return false;
      if (!q) return true;
      var hay = norm([r.name, r.make, r.model, r.load.caliberName, r.load.projName, r.load.powderName, r.powderLot, r.submittedBy].join(' '));
      return q.split(' ').every(function (w) { return hay.indexOf(w) >= 0; });
    });
  }
  function perPage() {
    var box = $('mList'); if (!box || !box.clientHeight) return 6;
    return Math.max(2, Math.floor((box.clientHeight - 24) / 46));
  }
  function render() {
    var box = $('mList'); if (!box) return;
    var list = filtered(), n = perPage(), pages = Math.max(1, Math.ceil(list.length / n));
    if (page >= pages) page = pages - 1;
    var rows = list.slice(page * n, page * n + n);
    box.innerHTML = rows.length ? rows.map(function (r) {
      var shots = r.shots.reduce(function (a, s) { return a + s.v.length; }, 0);
      var v = r.shots.map(function (s) { return A.fmt(A.toDisp(s.mc, 'mass'), 'mass') + '→' + A.velDisp(C().stats(s.v).avg).toFixed(0); }).join(', ');
      return '<div class="mrow"><div class="mtxt"><b>' + A.esc([r.make, r.model].filter(Boolean).join(' ') || 'Unknown firearm') + '</b> · ' +
        A.fmt(A.toDisp(r.barrel || 0, 'len'), 'len') + ' ' + A.unitLabel('len') + ' · ' + A.esc(r.load.caliberName || '') +
        '<div class="muted">' + [r.load.projName, (r.load.powderName || '') + (r.powderLot ? ' lot ' + r.powderLot : '')].filter(Boolean).map(A.esc).join(' · ') +
        ' · ' + shots + ' shots: ' + v + ' · Ba ×' + (+r.baCal || 1).toFixed(3) + (r.submittedBy ? ' · by ' + A.esc(r.submittedBy) : '') + '</div></div>' +
        '<button data-mapply="' + A.esc(r.id) + '">Apply</button><button data-msave="' + A.esc(r.id) + '">Save</button></div>';
    }).join('') : '<div class="muted" style="padding:8px">' + (all.length ? 'No matches. Untick "match current load" or change the search.' : 'Nothing to show.') + '</div>';
    $('mPage').textContent = (page + 1) + ' / ' + pages;
    $('mPrev').disabled = page === 0; $('mNext').disabled = page >= pages - 1;
  }
  function byId(id) { return all.find(function (r) { return r.id === id; }); }
  function toLocal(r) {
    var o = JSON.parse(JSON.stringify(r));
    o.id = C().uid(); o.name = '⇩ ' + (r.name || 'Community calibration'); o.date = o.date || r.sharedAt || ''; o.serial = ''; o.location = '';
    o.notes = (r.notes || '') + (r.submittedBy ? '\nShared by ' + r.submittedBy : ''); return o;
  }

  // ---------- share ----------
  function openShare() {
    var r = C().current();
    if (!r || !r.shots.length) return A.toast('Add shots (and ideally fit the powder) before sharing', true);
    if (!r.baCal || r.baCal === 1) A.toast('Tip: press "Fit powder" first so others get the fitted factor');
    $('shPreview').textContent = JSON.stringify(sanitize(r, { notes: $('shNotes').checked, handle: $('shHandle').value.trim() }), null, 1);
    $('cshare').hidden = false;
  }
  function payload() {
    var r = C().current(); return sanitize(r, { notes: $('shNotes').checked, handle: $('shHandle').value.trim() });
  }
  function submit() {
    var p = payload(), json = JSON.stringify(p, null, 1);
    if (!CFG.communitySubmitUrl || /OWNER\/REPO/.test(CFG.communitySubmitUrl)) return A.toast('Sharing is not configured yet (see config.js). Use "Download" instead.', true);
    var body = 'Calibration submitted from Gary\'s Reloading Tool.\n\n```json\n' + json + '\n```\n';
    var url = CFG.communitySubmitUrl + '?labels=calibration&title=' + encodeURIComponent('Calibration: ' + p.name) + '&body=' + encodeURIComponent(body);
    if (url.length > 7500) {   // GitHub truncates long URLs: copy the data and let the user paste it
      var copy = navigator.clipboard ? navigator.clipboard.writeText(json) : Promise.reject();
      copy.then(function () { A.toast('Data copied. Paste it into the issue body.'); }, function () { download(p); A.toast('Data downloaded. Attach the file to the issue.'); });
      url = CFG.communitySubmitUrl + '?labels=calibration&title=' + encodeURIComponent('Calibration: ' + p.name) + '&body=' + encodeURIComponent('Paste the calibration JSON here:\n\n```json\n\n```\n');
    }
    window.open(url, '_blank', 'noopener'); $('cshare').hidden = true;
  }
  function download(p) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' }));
    a.download = 'calibration-' + (p.name || 'shared').replace(/[^\w.-]+/g, '_').slice(0, 50) + '.json'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function init() {
    $('cCommunity').onclick = function () { $('mcomm').hidden = false; render(); refresh(); };
    $('cShare').onclick = openShare;
    $('mRefresh').onclick = refresh;
    $('mSearch').oninput = function () { page = 0; render(); };
    $('mMatch').onchange = function () { page = 0; render(); };
    $('mPrev').onclick = function () { page--; render(); }; $('mNext').onclick = function () { page++; render(); };
    $('mList').onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var r = byId(b.dataset.mapply || b.dataset.msave); if (!r) return;
      if (b.dataset.mapply) { C().apply(toLocal(r)); $('mcomm').hidden = true; }
      else { C().add(toLocal(r)); A.toast('Saved to your calibrations'); }
    };
    ['shNotes', 'shHandle'].forEach(function (id) { $(id).oninput = $(id).onchange = function () { $('shPreview').textContent = JSON.stringify(payload(), null, 1); }; });
    $('shSubmit').onclick = submit;
    $('shDownload').onclick = function () { download(payload()); };
    window.addEventListener('resize', function () { if (!$('mcomm').hidden) render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
