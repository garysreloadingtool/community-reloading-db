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
- `K.ba` and `K.heat` in `web/engine.js` are fitted by `node tools/fit_model.js` to measured chronograph data
  (6.5 Creedmoor, 120gr Sierra MK, N540, 24": 38.0gr → 848 m/s, 41.0gr → 908 m/s). The model matches both within 0.4 %.
- Other powders, especially fast pistol powders, can be off by 10–15 %. Use **Calibrate**: enter your measured
  charge/velocity pairs and the powder's Ba is scaled to fit. `<Measurement>` blocks in `.grtload` files are imported
  and saved with the load.

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
