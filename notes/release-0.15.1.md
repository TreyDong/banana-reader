# Banana Reader 0.15.1 release verification — 2026-11-05

Status: 0.15.1 is published on GitHub. Exact-tag provenance and byte checks pass. The complete official automated release scan is pending a manual "Check for new releases" request from the community directory account.

## Scope

- `manifest.json` `author` changed from `Trey` to `banana`, so the Obsidian browse list and the directory listing excerpt show the same attribution as the community entry profile `banana` (linked to the `treydong` GitHub account).
- README installation steps and the author section updated in both English and Simplified Chinese.
- Current-version references in `docs/development.md`, `docs/guide.zh-CN.md`, `docs/plugin-id-migration.md` and `docs/mobile-candidate.md` moved to 0.15.1. Historical statements about the 0.14.8 review, the 197-test run and the archived `banana-reader-plugin` channel are unchanged.
- No functional change. Reading data, model configuration, document handling and the desktop-only `gloss-reader` identity are untouched. `manifest.json` `author` only reaches users through a new release, so the visible change requires 0.15.1.

## Local verification

`npm run check` passed on the exact tagged source: zero lint warnings, 231 regression tests passed, TypeScript and production bundling succeeded. The version consistency check covers `manifest.json`, `package.json`, the root package entries in `package-lock.json` and `versions.json`.

## Publication and provenance

- PR https://github.com/TreyDong/banana-reader/pull/7 merged into `main` as `77a1a0d3921722763386c12de34ba179fe0d985b`; the feature commit is `fad1539acbab1e210bc63e88a5d0cce6e306601b` on `fix/author-banana-0.15.1`.
- Tag `0.15.1` points at that merge commit. Exact-tag CI https://github.com/TreyDong/banana-reader/actions/runs/41960559914 passed, including the full check suite, provenance attestations for main.js, manifest.json and styles.css, and the workflow's own attestation verification step.
- https://github.com/TreyDong/banana-reader/releases/tag/0.15.1 was published on 2026-11-05 at 03:19:56 UTC as the latest release, not a draft and not a prerelease, with only the three standard installation files.
- The published assets were downloaded again and compared byte-for-byte with the CI artifact. Local build output and CI artifact also match byte-for-byte.
- `gh attestation verify` against `refs/tags/0.15.1` and the merge commit passes for all three files. A tampered copy of `manifest.json` fails the same check with a digest 404, confirming the verification is meaningful rather than silently passing. The Sigstore TUF endpoint is unreachable directly from this machine, so the verification ran through the local proxy port 7890.
- The default-branch manifest identifies 0.15.1 with author `banana`, which is what the official release check reads.

| Installation asset | SHA-256 |
| --- | --- |
| main.js | `fa8d354e21e50e0d201e9f3f25fe972d1a6f24faef6de6f64a8970111ca63708` |
| manifest.json | `615bf73b07746917232014d56acdf18c9810a115581bc37f9a6157557dd250d7` |
| styles.css | `6c669d9a6c4324a13f860b1d744613fdedb5e66eac22401a953ed7ce1c9d5b70` |

## Remaining verification

The community directory listing still served 0.15.0 shortly after publication. A "Check for new releases" request from the community directory account is required to trigger the scan, and the complete official review for 0.15.1 must show Completed before the release is recorded as fully accepted. This is automated acceptance only; it is not a claim of manual Obsidian staff review.
