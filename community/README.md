# Community calibration database

`calibrations.json` is the shared database Gary's Reloading Tool reads (set `communityIndexUrl` in `web/config.js`
to the raw URL of this file, e.g. `https://raw.githubusercontent.com/OWNER/REPO/main/community/calibrations.json`).

How submissions work:
1. A user presses **Share…** in the app. A GitHub issue opens with the label `calibration` and the data as a JSON block
   (set `communitySubmitUrl` to `https://github.com/OWNER/REPO/issues/new`).
2. `.github/workflows/calibration-submission.yml` runs `tools/validate_community.js`. It keeps only whitelisted fields,
   checks types and ranges, and opens a pull request. Users get a comment if the data is invalid.
3. A maintainer reviews and merges the PR. The app picks it up on the next **Refresh** and caches it for offline use.

Setup: create the `calibration` label in the repository and allow Actions to create pull requests
(Settings → Actions → General → Workflow permissions).

Serial numbers and locations are stripped in the app before sharing, and the validator drops them too.
