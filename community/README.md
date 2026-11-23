# Community database

Gary's Reloading Tool reads two shared files from this folder (raw URLs are set in `web/config.js`):

| File | Contents | Config key | Issue label |
|---|---|---|---|
| `calibrations.json` | chronograph calibrations | `communityIndexUrl` | `calibration` |
| `items.json` | calibers, bullets (projectiles), powders and complete loads | `communityItemsUrl` | `component` |

How submissions work:
1. A user presses **Share…** (calibration dialog) or **Share** (main screen) in the app. A GitHub issue opens from
   one of the issue forms in `.github/ISSUE_TEMPLATE/`, which apply the label and hold the data as a JSON block.
2. `.github/workflows/community-submission.yml` runs `tools/validate_community.js` or `tools/validate_items.js`.
   They keep only whitelisted fields, check types and ranges, and the workflow opens a pull request.
   Users get a comment if the data is invalid; editing the issue re-runs the check and updates the PR.
3. A maintainer reviews and merges the PR. The app picks up calibrations on the next **Refresh** in the community
   dialog, and shared items (marked ☁ in the dropdowns) on the next page load. Both are cached for offline use.

Setup: create the `calibration` and `component` labels and allow Actions to create pull requests
(Settings → Actions → General → Workflow permissions).

The app does not collect serial numbers; locations are stripped before sharing, and the validator drops both fields if present.
