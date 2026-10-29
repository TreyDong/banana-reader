# Reader repository consolidation — 2026-10-28

The maintainer requested archiving the former publication repository and fixing the remaining documentation inconsistencies.

## Maintained source and historical channel

- Maintained repository: https://github.com/TreyDong/banana-reader , branch `main`. Current stable/community release: 0.14.8, ID `gloss-reader`, desktop-only, minimum Obsidian 1.11.4.
- Archived historical repository: https://github.com/TreyDong/banana-reader-plugin . GitHub confirms `isArchived: true`; its description and homepage now identify the maintained repository. Both README languages begin with a retirement notice and a link to the maintained identity/data guide.
- Old branches, tags and release assets remain available. The stable 0.13.3 and prerelease 0.14.0–0.14.2 packages retain ID `banana-reader`. This channel no longer receives fixes or new beta releases.
- The old 0.14.1/0.14.2 tags both point to `2a9c7b7749db412fb66e1ab3c7a6c4faca4133fa`, whose manifest says 0.13.3. The downloaded 0.14.2 asset manifest says 0.14.2. This historical source/asset mismatch is disclosed without rewriting tags or assets.
- The 0.14.2 bundle still contains three Function constructors and host PDF.js global registrations; 0.14.8 has neither. Archived beta downloads are not a substitute for the verified community package.

## Feature and local-source audit

- Compared the actual 0.14.2 bundle with 0.14.8: all 122 reader-view methods remain present. Selection capture and preview methods are identical after normalizing generated import names; selection-question controls and suggestions remain, with composition/settings fixes in the updated toolbar.
- Compared 41 source, test and build files in the older 0.14.6 working copy against the restoration snapshot `53973dd`: all match, with no additional local source/test/script files missing from that snapshot. This establishes source preservation, not physical mobile acceptance.
- Existing local uncommitted work is preserved. A local checkout is not updated by a remote release; reconciling it must preserve its original branch, files and any local-only notes. Never paste the obsolete working tree over the maintained source or publish an archive containing private local material.

## Documentation corrections

- English and Chinese entry points now link to the maintained community listing, releases and issues. Manual installation and current data/index paths use `gloss-reader`.
- Current release information now records 0.14.8 as published and automated-review-complete, with 197 tests and tagged provenance. Historical 0.14.0 test counts remain historical.
- Old BRAT installation instructions are retired. Mobile source and its historical validation are distinguished from a maintained mobile package; iOS/Android device acceptance remains pending.
- PDF reflow/original-page behavior, bookshelf formats and selection-question controls now match the released implementation.
- The development checklist requires matching source tags/assets, exact-tag provenance, default-branch manifest synchronization and completed official release review. Documentation follow-ups do not move the 0.14.8 tag or replace its attested assets.

Repository archival does not uninstall plugins, copy reading data, alter SecretStorage or switch a personal vault. Existing `banana-reader` installations require a separate, backed-up cutover as documented in `docs/plugin-id-migration.md`.

## Approved local development synchronization — 2026-10-29

- The maintainer approved the 43-file synchronization list plus this consolidation record. Before changing branches, the original branch, commit, status and all 42 non-ignored uncommitted files were checked against the previously prepared local archive; no intervening changes were found.
- The original `codex/mobile-support` branch remains at `0bbca67bed5004195eef36c39f27fcfeef72ed47`. All 42 files were also verified byte-for-byte in the complete Git stash snapshot `487c1a638dc1d407f5637c6d6830841e0954fd28`, retained by local-only branch `backup/mobile-support-before-community-sync-20261029`. That snapshot includes the previously untracked files and was not uploaded. Inspect it before recovering individual changes; do not apply obsolete source over the maintained main branch.
- The primary development checkout switched to `main` and fast-forwarded to maintained revision `20af53779b85f38e90b6b61daaefa7c9f45fb093`. Its upstream is now `publication/main`; the previous remotes and original development branch remain available. Every previously uncommitted file has a corresponding maintained file, so no local-only source or note needed separate restoration.
- Installed the lockfile dependency graph with `npm ci --ignore-scripts`, then ran `npm run check` in the actual primary checkout: strict lint, all 197 tests, TypeScript and bundle build passed. Before this documentation follow-up, the checkout exactly matched the maintained source and had no uncommitted changes.
- The fresh local `main.js`, `manifest.json` and `styles.css` hashes exactly match the three published 0.14.8 assets recorded in `notes/community-review-repair-plan.md`. The release tag and published files were not changed.
- This synchronization updates the development checkout only. It does not install a plugin into a personal vault, migrate reading records or modify secrets.
