# Banana Reader 0.14.9 release verification — 2026-10-29

Status: 0.14.9 is published on GitHub as the latest stable release. Exact-tag provenance and byte checks pass. The complete official automated release scan is Completed, and the Community current release is 0.14.9.

## Scope

- Main plugin settings categories above content, with the established model-service configuration layout retained.
- Compact labels, toggles, selectors and command actions on the same row where space permits.
- Bookshelf folder picker, PDF/EPUB/Markdown filters (PDF/EPUB default), saved preferences and immediate refresh. Settings remain on the first Appearance tab.
- Configurable Markdown export folder with folder picking/manual path, nested-folder creation, validation and save-failure rollback. Default remains the inbox folder; exports keep their timestamped snapshot naming/content and never overwrite old notes.
- ID `gloss-reader`, desktop-only, minimum Obsidian 1.11.4. Internal reading data, copying, model configuration and user documents are retained. The proposed four-type/centralized-storage redesign was cancelled and is not in this release. No personal-vault installation is part of publication.

## Local and native verification

The feature candidate passed 205 tests, lint and production build. Native Obsidian 1.14.5 in an isolated synthetic vault verified settings, command layout, service editing, bookshelf scoping/types, export folder picking, nested-folder export and preservation of annotations, conversations and drafts. The versioned release passed `npm run check`: zero lint warnings, consistent metadata, all 205 tests, TypeScript and production bundling. `git diff --check` passed. Remote verification and publication evidence are recorded below.

## Publishing targets

Maintained repository: https://github.com/TreyDong/banana-reader . Default branch: `main`. New tag: `0.14.9`. Never move or replace 0.14.8 or its verified assets; never push the archived replacement channel or the local backup/stash branches.

Three direct installation assets: `main.js`, `manifest.json`, `styles.css`. Build exact tagged source with the existing Reader verification workflow, verify all three GitHub attestations, compare downloaded release assets with the CI artifact, and request the complete official release scan separately from the branch preview.

## Publication and provenance

- PR https://github.com/TreyDong/banana-reader/pull/2 merged as `e5e6fa2e63f0d90484b47ab57381116cf26f4912`; local main tracks the maintained public main. The retained feature branch is `7978d2e7bfc2ff8e34288d6bbfdb41f22b937970`.
- Official branch preview for `7978d2e` completed without new source/CSS findings. Branch CI https://github.com/TreyDong/banana-reader/actions/runs/40822067260 passed, including 205 tests and verified provenance.
- Tag `0.14.9` is fixed at `e5e6fa2e63f0d90484b47ab57381116cf26f4912`. Exact-tag CI https://github.com/TreyDong/banana-reader/actions/runs/40822398046 passed, including the full check suite and verified attestations for main.js, manifest.json and styles.css. Each downloaded file was cryptographically verified against that tag, commit and the Reader verification workflow.
- Native Obsidian 1.14.5 in the synthetic QA vault reloaded the exact 0.14.9 files and showed v0.14.9; existing bookshelf choices and the saved export folder remained. The complete QA data.json matched its pre-reload snapshot.
- https://github.com/TreyDong/banana-reader/releases/tag/0.14.9 was published on 2026-10-29 at 05:20:50 UTC as latest. Draft and published files were downloaded and compared with CI. The final release contains only the three standard direct installation files. An initially attached ZIP prompted the official extra-files recommendation, so that ZIP asset was removed; the same verified three-file ZIP remains available locally as `dist/banana-reader-0.14.9.zip`. No tag or standard installation asset was replaced.
- Official Check for new releases confirmed manifest version 0.14.9 and queued the full scan for `e5e6fa2`. The full scan later completed for that exact release commit, separately from the earlier branch preview.

| Installation asset | SHA-256 |
| --- | --- |
| main.js | `0559f39b4e144b51ef8ca1c30b42e82295f3fcefbc708a16949836b14849ed3d` |
| manifest.json | `6868871582bee07f0651e8a136b250a4d9ed04ccdc3d3a2f5f314923991279fd` |
| styles.css | `3abdef1362922b85a231999fa093ffad1bbac879cf266dfafc361a1bb526cfaa` |

## Official automated release acceptance

At https://community.obsidian.md/account/plugins/gloss-reader the formal 0.14.9 review for `e5e6fa2` shows Completed, and Current release is 0.14.9 (published Oct 29, 2026). Installation-file provenance passes; dependencies and obfuscation checks pass. Build Verification reproduced the release main.js byte-for-byte. There are no new source/CSS findings. This is automated acceptance, not a claim of manual staff review.

The retained Vault Enumeration and Clipboard Access recommendations reflect the existing document picker and explicit clipboard writes. The initial release scan also recorded the optional ZIP as an unsupported extra; that asset was removed and the final GitHub release has only main.js, manifest.json and styles.css. The initial scan retains that historical ZIP finding in its asset-list snapshot. A subsequent Check for new releases request confirmed this version has already been scanned rather than rerunning it. GitHub was independently verified to contain exactly the three standard files afterward; no standard installation file or tag was changed. Both the complete-result and overview screenshots are retained locally under dist/.
