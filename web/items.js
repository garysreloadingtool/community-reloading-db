/* Gary's Reloading Tool – shared calibers, bullets, powders and loads.
 * Loads GRT_CONFIG.communityItemsUrl (community/items.json), caches it for offline use and adds the items
 * to the dropdowns marked ☁. "Share" sends the current caliber / bullet / powder / load to the repository
 * as a GitHub issue; a maintainer-reviewed workflow adds it to items.json. */
(function () {
  'use strict';
  var A = window.GRTApp, $ = A.$, CFG = window.GRT_CONFIG || {};
  var FORMAT = 'GarysReloadingTool-items', CACHE = 'itemsCache', MARK = '☁ ';
  var LISTS = ['calibers', 'projectiles', 'powders', 'loads'];
  var configured = function () { return CFG.communityItemsUrl && !/OWNER\/REPO/.test(CFG.communityItemsUrl); };

  // ---------- load shared items into the dropdowns ----------
  function use(d) {
    if (!d || d.format !== FORMAT) return 0;
    var out = {}, n = 0;
    LISTS.forEach(function (k) {
      out[k] = (Array.isArray(d[k]) ? d[k] : []).filter(function (r) { return r && typeof r.name === 'string'; }).map(function (r) {
        var o = JSON.parse(JSON.stringify(r)); o.name = MARK + r.name + (r.submittedBy ? ' (by ' + r.submittedBy + ')' : ''); o.community = true; n++;
        return o;
      });
    });
    A.setCommunity(out);
    return n;
  }
  function refresh() {
    var cached = A.store.get(CACHE);
    if (cached) use(cached.data);
    if (!configured()) return;
    fetch(CFG.communityItemsUrl, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { if (d && d.format === FORMAT) { A.store.set(CACHE, { at: new Date().toISOString(), data: d }); use(d); } })
      .catch(function () { /* offline: the cached copy (if any) stays in use */ });
  }

  // ---------- share the current item ----------
  var KIND = 'load';
  var clean = function (s) { return String(s || '').replace(/^[★☁⇩]\s*/, '').replace(/ \(by [^)]*\)$/, '').replace(/ \(from load\)$/, '').trim(); };
  var r4 = function (v) { return v == null || v === '' || isNaN(v) ? undefined : +(+v).toPrecision(6); };
  function caliber(S) {
    var rev = S.gap > 0;
    return { name: clean(S.caliberName), caselen: r4(S.caselen), oal: r4(S.oal), casevol: r4(S.casevol), groove: r4(S.groove), aeff: r4(S.aeff),
      pmax: r4(S.pmax), sebert: r4(S.sebert), ps: r4(S.ps), barrel: r4(S.barrel),
      revolver: rev ? 1 : undefined, gap: rev ? r4(S.gap) : undefined, cyl: rev ? r4(S.cyl) : undefined };
  }
  function projectile(S) { return { name: clean(S.projName), mass: r4(S.mp), len: r4(S.blen), dia: r4(S.groove), friction: r4(S.friction) }; }
  function powder(S) {
    var o = { name: clean(S.powderName) };
    ['Ba', 'a0', 'z1', 'z2', 'Qex', 'k', 'pc', 'pcd', 'eta', 'tcc', 'tch'].forEach(function (k) { o[k] = r4(S[k]); });
    return o;
  }
  function item(kind) {
    var S = A.state();
    if (kind === 'caliber') return caliber(S);
    if (kind === 'projectile') return projectile(S);
    if (kind === 'powder') return powder(S);
    var c = caliber(S), w = powder(S); delete c.barrel;
    w.mc = r4(S.mc); w.pt = r4(S.T); w.laddercnt = r4(S.laddercnt); w.laddermc = r4(S.laddermc);
    return { name: clean(S.title) || [c.name, projectile(S).name, w.name].filter(Boolean).join(' · '), caliber: c, gun: { barrel: r4(S.barrel) }, projectile: projectile(S), powder: w };
  }
  function payload() {
    var it = item(KIND), nm = $('isName').value.trim();
    if (nm) it.name = nm.slice(0, 120);
    var o = { format: 'GarysReloadingTool-share', kind: KIND, id: (window.GRTCalib ? window.GRTCalib.uid() : Date.now().toString(36)), item: it };
    var h = $('isHandle').value.trim(), notes = $('isNotes').value.trim();
    if (h) o.submittedBy = h.slice(0, 40);
    if (notes) o.notes = notes.slice(0, 500);
    return JSON.parse(JSON.stringify(o));   // drops undefined fields
  }
  var LABEL = { load: 'Load', caliber: 'Caliber', projectile: 'Bullet', powder: 'Powder' };
  function preview() { $('isPreview').textContent = JSON.stringify(payload(), null, 1); }
  function pick(kind) {
    KIND = kind;
    Array.prototype.forEach.call(document.querySelectorAll('[data-ikind]'), function (b) { b.classList.toggle('on', b.dataset.ikind === kind); });
    $('isName').value = item(kind).name || '';
    preview();
  }
  function open() { pick(KIND); $('ishare').hidden = false; }
  function download(p) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' }));
    a.download = 'shared-' + p.kind + '-' + (p.item.name || 'item').replace(/[^\w.-]+/g, '_').slice(0, 50) + '.json'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function submit() {
    var p = payload(), json = JSON.stringify(p, null, 1);
    if (!p.item.name) return A.toast('Give it a name first', true);
    if (!CFG.communitySubmitUrl || /OWNER\/REPO/.test(CFG.communitySubmitUrl)) return A.toast('Sharing is not configured yet (see config.js). Use "Download" instead.', true);
    // The issue form applies the "component" label for everyone and puts the JSON in its "data" field.
    var base = CFG.communitySubmitUrl + '?template=component.yml&title=' + encodeURIComponent('Shared ' + LABEL[p.kind].toLowerCase() + ': ' + p.item.name);
    var url = base + '&data=' + encodeURIComponent(json);
    if (url.length > 7500) {   // GitHub truncates long URLs: copy the data and let the user paste it
      var copy = navigator.clipboard ? navigator.clipboard.writeText(json) : Promise.reject();
      copy.then(function () { A.toast('Data copied. Paste it into the issue form.'); }, function () { download(p); A.toast('Data downloaded. Paste its contents into the issue form.'); });
      url = base;
    }
    window.open(url, '_blank', 'noopener'); $('ishare').hidden = true;
  }

  function init() {
    var b = $('btnShare'); if (b) b.onclick = open;
    Array.prototype.forEach.call(document.querySelectorAll('[data-ikind]'), function (x) { x.onclick = function () { pick(x.dataset.ikind); }; });
    ['isName', 'isHandle', 'isNotes'].forEach(function (id) { $(id).oninput = preview; });
    $('isSubmit').onclick = submit;
    $('isDownload').onclick = function () { download(payload()); };
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
