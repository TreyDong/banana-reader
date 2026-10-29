# Banana Reader 0.14.9 release verification — 2026-10-29

Status: preparing the user-approved release. GitHub publication, tagged provenance and official automated review are pending; record results only after verification.

## Scope

- Main plugin settings categories above content, with the established model-service configuration layout retained.
- Compact labels, toggles, selectors and command actions on the same row where space permits.
- Bookshelf folder picker, PDF/EPUB/Markdown filters (PDF/EPUB default), saved preferences and immediate refresh. Settings remain on the first Appearance tab.
- Configurable Markdown export folder with folder picking/manual path, nested-folder creation, validation and save-failure rollback. Default remains the inbox folder; exports keep their timestamped snapshot naming/content and never overwrite old notes.
- ID `gloss-reader`, desktop-only, minimum Obsidian 1.11.4. Internal reading data, copying, model configuration and user documents are retained. The proposed four-type/centralized-storage redesign was cancelled and is not in this release. No personal-vault installation is part of publication.

## Local and native verification

The feature candidate passed 205 tests, lint and production build. Native Obsidian 1.14.5 in an isolated synthetic vault verified settings, command layout, service editing, bookshelf scoping/types, export folder picking, nested-folder export and preservation of annotations, conversations and drafts. The versioned release passed `npm run check`: zero lint warnings, consistent metadata, all 205 tests, TypeScript and production bundling. `git diff --check` passed. Subsequent remote results are pending below.

## Publishing targets

Maintained repository: https://github.com/TreyDong/banana-reader . Default branch: `main`. New tag: `0.14.9`. Never move or replace 0.14.8 or its verified assets; never push the archived replacement channel or the local backup/stash branches.

Three direct installation assets: `main.js`, `manifest.json`, `styles.css`. Build exact tagged source with the existing Reader verification workflow, verify all three GitHub attestations, compare downloaded release assets with the CI artifact, and request the complete official release scan separately from the branch preview.
