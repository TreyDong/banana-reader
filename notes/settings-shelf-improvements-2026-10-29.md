# Settings navigation and bookshelf preferences — 2026-10-29

## Requested direction

The maintainer asked for plugin settings navigation above its content, rather than a side-by-side menu, and for an explicit bookshelf folder and file-type filter. Automatic copying stays unchanged; the earlier proposal to replace it with manual copying was not approved and is not part of this work.

## Implementation plan

- Keep the existing Obsidian look and settings tokens. Place the plugin categories and model-service choices above their panels at every width; wrap choices on narrow windows. The host application's settings sidebar is outside this plugin layout change.
- Add a top-level Bookshelf settings tab and an always-visible Bookshelf settings action on the shelf. Move bookshelf preferences out of the Z-Library account section so users can find them without configuring a book source.
- Retain existing folder settings and offer a folder picker plus editable path. Validate folders and protected paths before saving; empty scope retains the existing whole-vault behavior. An explicit folder is traversed directly, excluding protected subtrees.
- Persist a multi-select PDF/EPUB/Markdown filter. Existing installations default to PDF and EPUB, matching current behavior; Markdown is opt-in. An empty selection shows an actionable empty state. Update open shelves after saving, including when folder/type changes produce the same number of books.
- Preserve annotations, drafts, model choices, progress and copying. Failed preference saves restore the previous settings and keep the UI recoverable.

## Scope and acceptance

Source changes are limited to `src/main.ts`, `src/i18n.ts`, `src/bookshelf.ts`, `styles.css`, `tests/bookshelf.test.ts`, `tests/mobile-lifecycle.test.ts`, both README languages and this record (nine files). This is a development preview based on 0.14.8, not a replacement of its published tag or assets.

Validate folder boundaries, mixed-case formats, default settings, empty results, persistence and rollback with targeted tests and the full project check. Exercise settings, folder/type changes, reopen persistence and service navigation in an isolated synthetic Obsidian vault, at normal and narrow widths. Do not modify the personal-vault installation.

## Validation results

- `npm run check` passed: ESLint and release metadata checks, all 202 tests, TypeScript and production bundling. `git diff --check` passed. Five new tests cover format defaults and normalization, folder input, persistence and open-shelf refresh, invalid/protected paths, failed-save rollback/recovery and actual settings controls/folder picking.
- Native Obsidian 1.14.5 was exercised in `/private/tmp/reader-community-0148-qa` only. The newer native settings row inherited a horizontal layout; explicitly making the plugin settings root a block fixes the main categories as well as the service selector. Categories, content and two synthetic offline services were checked at normal and narrow window widths, including a long service name and switching services. Chinese and English labels were both checked.
- The existing Books folder was retained on first load with PDF/EPUB selected by default. Adding Markdown and selecting Markdown alone showed only the synthetic Markdown book. Clearing all types showed a specific action to open settings. Choosing the Chinese-named 收集箱 folder with PDF selected showed a no-matching-files message. Switching back to Books worked through both the folder picker and editable path.
- A missing folder showed an inline error and restored the previous valid input. The folder picker lists only folders and offers an Entire vault entry. The shelf settings action opens the dedicated tab. Preference changes immediately refresh the already-open shelf; a force reload retained the explicit empty type selection.
- The QA vault's entire `documents` object was compared with its pre-test backup: annotations, drafts and reading progress are identical. Three existing clipboard writes are unchanged. The personal-vault plugin was neither read for test data nor replaced.
- Preview package: `dist/banana-reader-settings-shelf-preview.zip`, containing only `main.js`, `manifest.json` and `styles.css`. It keeps the 0.14.8 manifest for isolated development testing; it is not a new official release and must not overwrite published 0.14.8 assets. The public main branch and release tag remain unchanged.
