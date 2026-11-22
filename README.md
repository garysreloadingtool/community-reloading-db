# Gary's Reloading Tool (web)

Offline, in-browser interior-ballistics estimator.

**Try it online at https://garysreloadingtool.com** (no install needed; works on phones too).

- Open `web/index.html` directly (double-click works; no server needed). Phones/tablets are sent to `web/mobile.html` automatically; `index.html?desktop=1` forces desktop.
- To use offline elsewhere, copy the whole `web/` folder.
- Min. sizes: desktop 940×610, mobile 320×490 (otherwise a "Try anyway" notice appears).
- Rebuild the bundled data from github.com/zen/grt_databases (CC0):
  `git clone https://github.com/zen/grt_databases /tmp/grtdb && python3 -I tools/build_data.py /tmp/grtdb web/data.js`

The ballistics model in `web/engine.js` is an independent, simplified lumped-parameter model.
Results are estimates only, so never use them as load data.

## Model accuracy
- The engine integrates burn, gas pressure and bullet motion with an adaptive second-order step, includes heat loss to
  the chamber and bore walls (`K.hw`), and refuses loads whose charge cannot fit in the case instead of showing
  meaningless numbers.
- **Fitted powders** (marked "(fitted)", 90 rifle and 3 pistol powders) have burn parameters fitted to roughly 100,000 published
  manufacturer load points. On held-out loads (cartridges and bullets not used in the fit) the median muzzle-velocity
  error is about 2.5 % for rifle (90 % within about 6 %) and about 6 % for pistol (90 % within about 15 %). Each fitted powder shares one burn-shape template, so pressure
  is only a rough estimate (median error about 15 % for rifle, 25 % for pistol). **Never exceed published maximum loads.**
- **Typical cartridges** (marked "(typical)", 47 rifle and 17 pistol cartridges) use typical case capacities; real brass
  varies by about 2 %. Measure your own case capacity for best results.
- Only the fitted parameters are included here, not the published load data they were fitted to.
- For any powder, use **Calibrate**: enter your measured charge/velocity pairs and the powder's Ba is scaled to fit.
  `<Measurement>` blocks in `.grtload` files are imported and saved with the load.

## Calibration library
**Calibrate** opens a library of the user's own chronograph data. Each record stores:
- **Firearm and components:** firearm make and model, serial/ID, barrel length, twist, powder lot, primer, brass and chronograph.
- **Conditions:** date, location/altitude, powder and air temperature, measured case volume and OAL, and notes.
- **Load and shots:** a snapshot of the caliber, bullet and powder model, plus every shot as `charge: v1 v2 v3 …`.
- **Result:** the fitted powder factor. Avg, SD and ES are shown for each charge.

Fitting uses the record's own barrel length, temperature and measurements, not whatever is on screen.
- **Save** keeps records in this browser (localStorage key `grt.calibrations`).
- **Export all** and **Import…** move them as a `garys-calibrations-YYYY-MM-DD.json` file, so you can back them up or share them between devices.
- **Apply to load** loads the record's setup together with its calibration.

## Community calibration database
**Community…** (in the Calibration library) browses calibrations shared by other users. **Share…** submits yours.
- **Reading:** a static JSON file in a GitHub repository, fetched when online and cached for offline use. There is no server.
- **Submitting:** a pre-filled GitHub issue. `.github/workflows/calibration-submission.yml` validates it with
  `tools/validate_community.js` and opens a PR for a maintainer to review.
- **Privacy:** serial number and location are never shared, and notes only when the user ticks "include notes".
- **Shared calibers, bullets, powders and loads:** **Share** on the main screen (More tab on mobile) sends the current item the same way, via `tools/validate_items.js`, into `community/items.json`. Merged items appear in the dropdowns marked ☁ and are cached for offline use.
- **Setup:** push this project to a GitHub repository, then set the URLs in `web/config.js` (see `community/README.md`).

## Security
- **Trusted Types:** all HTML the app writes goes through `GRTHTML` in `web/tt.js`, which also refuses script-capable markup. Under a CSP with `require-trusted-types-for 'script'` the browser blocks any other way of writing HTML into the page.
- **No inline styles or scripts** in the app's own code, so a strict `style-src 'self'` CSP works.
- **Community data** is validated by the GitHub workflow, reviewed before merging, and escaped before display.
- **Certificate monitor:** `.github/workflows/certificate-check.yml` checks the live site's certificates daily and fails (GitHub emails the owner) when one expires within 21 days.
