# Settings navigation and bookshelf preferences — 2026-10-29

## Requested direction

The maintainer asked for plugin settings navigation above its content, rather than a side-by-side menu, and for an explicit bookshelf folder and file-type filter. Automatic copying stays unchanged; the earlier proposal to replace it with manual copying was not approved and is not part of this work.

## Initial implementation (superseded below)

- Keep the existing Obsidian look and settings tokens. Place the plugin categories and model-service choices above their panels at every width; wrap choices on narrow windows. The host application's settings sidebar is outside this plugin layout change.
- Add a top-level Bookshelf settings tab and an always-visible Bookshelf settings action on the shelf. Move bookshelf preferences out of the Z-Library account section so users can find them without configuring a book source.
- Retain existing folder settings and offer a folder picker plus editable path. Validate folders and protected paths before saving; empty scope retains the existing whole-vault behavior. An explicit folder is traversed directly, excluding protected subtrees.
- Persist a multi-select PDF/EPUB/Markdown filter. Existing installations default to PDF and EPUB, matching current behavior; Markdown is opt-in. An empty selection shows an actionable empty state. Update open shelves after saving, including when folder/type changes produce the same number of books.
- Preserve annotations, drafts, model choices, progress and copying. Failed preference saves restore the previous settings and keep the UI recoverable.

## Scope and acceptance

Source changes are limited to `src/main.ts`, `src/i18n.ts`, `src/bookshelf.ts`, `styles.css`, `tests/bookshelf.test.ts`, `tests/mobile-lifecycle.test.ts`, both README languages and this record (nine files). This is a development preview based on 0.14.8, not a replacement of its published tag or assets.

Validate folder boundaries, mixed-case formats, default settings, empty results, persistence and rollback with targeted tests and the full project check. Exercise settings, folder/type changes, reopen persistence and service navigation in an isolated synthetic Obsidian vault, at normal and narrow widths. Do not modify the personal-vault installation.

## Initial validation results

- `npm run check` passed: ESLint and release metadata checks, all 202 tests, TypeScript and production bundling. `git diff --check` passed. Five new tests cover format defaults and normalization, folder input, persistence and open-shelf refresh, invalid/protected paths, failed-save rollback/recovery and actual settings controls/folder picking.
- Native Obsidian 1.14.5 was exercised in `/private/tmp/reader-community-0148-qa` only. The newer native settings row inherited a horizontal layout; explicitly making the plugin settings root a block fixes the main categories as well as the service selector. Categories, content and two synthetic offline services were checked at normal and narrow window widths, including a long service name and switching services. Chinese and English labels were both checked.
- The existing Books folder was retained on first load with PDF/EPUB selected by default. Adding Markdown and selecting Markdown alone showed only the synthetic Markdown book. Clearing all types showed a specific action to open settings. Choosing the Chinese-named 收集箱 folder with PDF selected showed a no-matching-files message. Switching back to Books worked through both the folder picker and editable path.
- A missing folder showed an inline error and restored the previous valid input. The folder picker lists only folders and offers an Entire vault entry. The shelf settings action opens the dedicated tab. Preference changes immediately refresh the already-open shelf; a force reload retained the explicit empty type selection.
- The QA vault's entire `documents` object was compared with its pre-test backup: annotations, drafts and reading progress are identical. Three existing clipboard writes are unchanged. The personal-vault plugin was neither read for test data nor replaced.
- Preview package: `dist/banana-reader-settings-shelf-preview.zip`, containing only `main.js`, `manifest.json` and `styles.css`. It keeps the 0.14.8 manifest for isolated development testing; it is not a new official release and must not overwrite published 0.14.8 assets. The public main branch and release tag remain unchanged.

## Maintainer correction: restore service styling and consolidate bookshelf preferences

- The maintainer rejected the changed model-service layout and the extra Bookshelf navigation tab. The final navigation has the existing four categories at the top. Bookshelf folder and file-type controls are the first group in the first Appearance tab. Both shelf settings actions open that tab.
- Compared history at `59ad62a` (service-based configuration), `c72e08b` (native settings hierarchy), and `46e4999` (before the preview). Restored every workspace, service-navigation and service-item layout rule directly from `46e4999`, including its narrow-window behavior. Kept the root block layout fix so native Obsidian does not place the main categories beside their content. Model configuration data and behavior are unchanged.
- Correction scope: `src/main.ts`, `styles.css`, `tests/mobile-lifecycle.test.ts`, both README languages and this note (six files). Folder validation, type filters, persistence/rollback and automatic copying are retained.
- Correction validation passed: `npm run check` (zero lint warnings, metadata checks, 203 tests, TypeScript and production build) plus `git diff --check`. The new integration test renders the real first settings page, checks that only four navigation tabs exist, and confirms the saved folder/types appear in its first section without changing reading records.
- Native Obsidian 1.14.5 in the same synthetic QA vault: the shelf action opened Appearance with folder/types first; no Bookshelf tab remained. Regular and wide settings windows showed the inherited responsive behavior, with the wide view restoring the service list on the left and configuration on the right. Switching to the long-named second service and opening/cancelling its edit form worked. The entire QA `data.json` matched its pre-correction backup afterward, including services and reading records.
- The model-service renderer matches `46e4999` verbatim; the three clipboard calls also match. The preview ZIP was rebuilt from the same three files loaded into QA. This correction is still local development work; no public release or personal-vault replacement was performed.

## Maintainer correction: keep simple labels and controls on one row

- The maintainer asked to remove unnecessary line breaks, especially on Automatically build index. The old 600px container rule stacked every settings row, even when a label and a small toggle easily fit together.
- Rows with no description now retain a horizontal label/control arrangement: both toggles (question suggestions and automatic indexing), short appearance selectors and inputs, embedding model/reference selectors and the connection button. Toggle controls use only their natural width. These simple rows have less vertical padding; long descriptions, folder controls and other complex content retain responsive wrapping.
- Scope is `src/main.ts`, `styles.css` and this record. Model-service navigation/layout, the first-tab bookshelf placement, settings values and reading data are unchanged.
- Verification passed: lint with zero warnings, release metadata, TypeScript and production build, 11 existing lifecycle/settings tests, and `git diff --check`. In native Obsidian 1.14.5 at the regular settings-window width, the automatic-index and question-suggestion labels sit beside their toggles; short selectors and the connection button also align with their labels. Toggling automatic indexing on and back off saved correctly. The entire QA data file matched the pre-test snapshot; model-service layout rules still match the prior restoration. Only the synthetic QA plugin was updated.
