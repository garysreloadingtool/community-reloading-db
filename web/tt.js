/* Gary's Reloading Tool – Trusted Types policies.
 * The production CSP sets require-trusted-types-for 'script': the browser then refuses any HTML string written
 * into the page unless it went through one of these named policies, so a missed escape elsewhere cannot run code.
 *   GRTHTML(s)   HTML built by the app (user data is escaped with GRTApp.esc before it gets here). As a second line of
 *                defence it refuses markup with script-capable tags, inline event handlers or javascript: URLs.
 *   GRTXML(s)    text of an imported .grtload/.caliber/... file, parsed as XML (XML parsing never runs scripts).
 * Without Trusted Types support (or offline from file://, where there is no CSP) both just return the string. */
(function () {
  'use strict';
  var BAD = /<\s*(script|iframe|frame|object|embed|base|meta|link|style|form|svg|math)\b|<[^>]*\son[a-z]+\s*=|javascript\s*:/i;
  function checkHTML(s) {
    s = String(s);
    if (BAD.test(s)) throw new TypeError('Blocked unsafe HTML');
    return s;
  }
  var tt = window.trustedTypes, html = null, xml = null;
  if (tt && tt.createPolicy) {
    try { html = tt.createPolicy('grt', { createHTML: checkHTML }); } catch (e) { /* policy not allowed */ }
    try { xml = tt.createPolicy('grt-xml', { createHTML: function (s) { return String(s); } }); } catch (e) { /* ditto */ }
  }
  window.GRTHTML = function (s) { return html ? html.createHTML(s) : checkHTML(s); };
  window.GRTXML = function (s) { return xml ? xml.createHTML(s) : String(s); };
})();
