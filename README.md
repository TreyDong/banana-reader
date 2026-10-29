# Banana Reader

Version **0.14.8** is the current desktop community release. It includes Markdown, PDF and EPUB reading, Z-Library book search/download and the bookshelf, with English, Simplified Chinese and following Obsidian supported.

**Read a passage. Ask about it. Keep the understanding beside the source.**

Turn Markdown notes, PDFs and EPUB books into a reading workspace inside Obsidian. Highlight a sentence, ask a question in the margin, follow the answer back to its source, and export what you learned as a Markdown note.

[Simplified Chinese guide](README.zh-CN.md) · [Install](https://community.obsidian.md/plugins/gloss-reader) · [Release files](https://github.com/TreyDong/banana-reader/releases/tag/0.14.8) · [Report an issue](https://github.com/TreyDong/banana-reader/issues)


## Repository and mobile status

[TreyDong/banana-reader](https://github.com/TreyDong/banana-reader) is the maintained source and release repository. The community ID and installation folder are `gloss-reader`; the visible name is **Banana Reader**. The former `TreyDong/banana-reader-plugin` repository and its `banana-reader` identity are archived historical releases, including the retired BRAT/mobile beta channel.

The 0.14.8 package is **desktop-only**, requiring Obsidian **1.11.4+**. Mobile adaptations remain in source, but there is no currently maintained mobile installation package. Historical beta assets have not received the 0.14.8 fixes and are no longer recommended for installation. Physical iOS and Android acceptance is still pending; see [mobile status and acceptance](docs/mobile-candidate.md).

Existing `banana-reader` users should preserve their current records and follow the [identity and data cutover guide](docs/plugin-id-migration.md) before switching. Repository archival does not update an installed plugin or migrate its data.

## Development preview

The current development branch keeps the main plugin categories above their content and restores the previous model-service configuration layout. Bookshelf preferences appear first under Appearance, with folder picking and saved file-type filters that immediately update open shelves. These changes are not part of the published 0.14.8 package. Copy buttons retain their existing behavior. See the [implementation and validation record](notes/settings-shelf-improvements-2026-10-29.md).

## What you can do

- **Ask where you are reading.** Select a passage for an explanation, a counterexample or a translation. Keep follow-up questions in the same conversation. Responses show their actual model and available usage.
- **Return to the evidence.** Click a paragraph citation or PDF page number to jump back to the passage behind an answer.
- **Mark what matters.** Add highlights, straight or wavy underlines and personal notes. Review them alongside your questions in the notebook.
- **Choose PDF text or original pages.** Read extractable PDF text in reflow mode, or switch to Obsidian's original-page view to retain images, tables and layout. Read EPUB chapters in book order, with contents navigation and adjustable typography.
- **Leave with a useful note.** Export excerpts, annotations and conversations to a new Markdown file with source links. Original documents stay unchanged.
- **Use your own models.** Connect a supported API or an authenticated Codex, Claude or Pi CLI. Choose question, translation and article-brief models independently. Optional book indexing retrieves passages across a longer document.
- **Fetch books from Z-Library.** Search with format, language and sort filters, download into a vault folder and start reading immediately. Requires your own Z-Library account.
- **Bookshelf.** Books stand on wooden planks as cloth spines — plain, paper-label, foil-stamped or banded bindings, each with its own width and height. A red bookmark marks reading progress; hover to preview a book and click to continue. In the development preview, open **Settings → Banana Reader → Appearance → Bookshelf**, or **Bookshelf settings** on the shelf, to select a folder and include its subfolders. Leave the folder empty to use the whole vault; protected folders stay excluded. Select any combination of PDF, EPUB and Markdown; PDF and EPUB are enabled by default.

## Get started

1. Install **Banana Reader** from [Community plugins](https://community.obsidian.md/plugins/gloss-reader), or use the matching three files from the [0.14.8 release](https://github.com/TreyDong/banana-reader/releases/tag/0.14.8), then enable it.
2. Open a Markdown, PDF or EPUB file. Click **Open Banana Reader** in the ribbon, or run **Banana Reader: Enter immersive reading** from the command palette.
3. Select a sentence. Highlight it or add a note immediately. For AI questions, add a connection in **Settings → Banana Reader → Model services** and choose a question model first.
4. Ask about the selection, for example: *“Which claim does this paragraph support?”* Click a citation to check the answer against the source.
5. Open the notebook and click the download icon (**Export Markdown notes**) to save a new Markdown note in the vault’s export folder. Choose **Back to document** to return to the normal file view.

These instructions use English interface labels. Choose **English** in **Settings → Banana Reader → Appearance → Interface language**. For instructions using Chinese labels, see the [Chinese guide](README.zh-CN.md#%E7%95%8C%E9%9D%A2%E8%AF%AD%E8%A8%80).

Reading, marking, annotation and export work without an AI account. AI features need your own service access and may incur provider charges. The interface supports **English and Simplified Chinese**, on **desktop Obsidian 1.11.4+**.

## Make it comfortable

Choose **Settings → Banana Reader → Appearance → Interface language**: **Follow Obsidian**, **Simplified Chinese**, or **English**. Follow Obsidian is the default: Chinese locales use Simplified Chinese and other locales use English. The choice is saved for this vault. Settings, command labels and open readers update immediately, preserving selections, drafts and active questions. This changes UI labels only; prompts, model assignments, translation targets and saved content keep their existing values. Unedited built-in command names follow the interface; renamed and custom commands keep their saved names. Switching to English does not translate the existing Chinese default prompts or change the model's answer language.

Change the paper or dark theme, font, text size and line spacing from the reading toolbar. Wider panes show margin cards; narrow panes keep conversations in the notebook. Question, translation and article-brief models have separate assignments. Built-in Google translation is also available without a chat-model account.

For a longer text, configure an OpenAI-compatible embedding model and choose **Index → Build index** inside the reader. Indexing is optional; automatic indexing is off by default. Retrieval finds relevant passages and does not claim to summarize every page. See the [Chinese guide](README.zh-CN.md) for service setup and detailed format limits.

## Your files and connections

Annotations and conversations are saved in the plugin's `data.json`; optional indexes use its `indices/` folder. Export creates ordinary Markdown notes. If you sync `.obsidian`, your sync tool may also sync this data.

AI requests send document context and your question to the service you choose. Indexing sends text chunks to your embedding provider. Google translation sends selected text to Google; optional search sends search terms to DuckDuckGo. The optional Z-Library book source sends search queries and download requests to the mirrors you configure (failing over down your mirror list automatically), and stores sign-in credentials in Obsidian's secret storage. The plugin has no author-operated server, advertising or client-side telemetry. Bundled fonts load locally.

The file picker lists vault paths only when opened. Copy buttons **write** the requested text to the clipboard; the plugin does not read clipboard contents. Local CLI connections use executable discovery, existing CLI authentication and temporary workspaces, requiring filesystem and process access. A local CLI can still call a remote service. API connections do not require a CLI. Read the [access details](README.zh-CN.md#%E8%B4%A6%E5%8F%B7%E7%BD%91%E7%BB%9C%E4%B8%8E%E6%9C%AC%E5%9C%B0%E8%AE%BF%E9%97%AE) before connecting a service.

## Before you install

- Desktop only; English and Simplified Chinese interfaces are available. Physical mobile validation is pending.
- PDF selection needs a text layer. Reflow mode follows reading typography; original pages preserve the source layout. Scanned, oversized or unparseable PDFs fall back to original pages. This version has no OCR or cross-page selection.
- EPUB supports text chapters and local raster images. DRM and original fixed-layout styling are not supported.
- Use models available to your own account. Discovery does not guarantee access; failed requests show an error and do not silently switch providers.
- The Z-Library source is unofficial: mirrors, domains and endpoints may change at any time, some mirrors block automated clients, and free accounts have daily download limits. The book-source settings keep a mirror list with automatic failover and one-click probing; only fetch content you are entitled to access.

For community updates, retain the existing `gloss-reader` installation and its `data.json` and `indices/`. The visible name remains **Banana Reader**. For a manual installation, place `main.js`, `manifest.json` and `styles.css` from this repository's [0.14.8 release](https://github.com/TreyDong/banana-reader/releases/tag/0.14.8) in `<vault>/.obsidian/plugins/gloss-reader/`. For a custom configuration directory, replace `.obsidian` with that directory.

If you currently use the replacement `banana-reader` identity, do not enable both plugins or copy over the older data. Keep using that installation until you have made a verified local backup and transferred its current records with both plugins stopped. Restoration does not automatically move data between folders. Both exported-note protocols remain supported. See [identity restoration](docs/plugin-id-migration.md).

## Development and credits

See the [development guide](docs/development.md) for the source layout, build and validation commands.

Build with `npm ci` and `npm run build`; run the official source checks with `npm run lint`, or all release checks with `npm run check`. When [reporting an issue](https://github.com/TreyDong/banana-reader/issues), include the app/plugin version, document format and reproduction steps. Do not include private documents or API keys.

Current project code: [MIT](LICENSE). Newsreader and Schibsted Grotesk fonts: SIL OFL. fflate: MIT. Full [third-party notices](THIRD_PARTY_NOTICES.md) are embedded in the installation package. Early interaction references include Gloss and Qiaomu Reader; the third-party notices retain the source-reference disclosures.

## Repository changes

- 2026-10-28: Consolidate supported releases in this repository and archive the former `banana-reader-plugin` channel without changing historical tags or assets. Correct installation links, identity/data paths, PDF and mobile status; see [repository consolidation](notes/repository-consolidation-2026-10-28.md).

- 2026-10-28 · 0.14.8: Published with zero source/CSS warnings, 197 passing tests, tagged provenance for all three installation files and completed automated Community review. Official Build Verification reproduced main.js byte-for-byte. Dynamic PDF compilation and host-worker pollution are removed; clipboard copying and user-opened file selection remain documented capabilities. See [acceptance evidence](notes/community-review-repair-plan.md).

- 2026-10-28 · 0.14.7: Restore the existing `gloss-reader` community identity and the Banana Reader display name. Preserve stored records, both note-link protocols and all current reading features. Refuse simultaneous activation with `banana-reader`. The community package remains desktop-only; mobile acceptance is pending.

- 2026-10-22 · 0.14.0: Add the Z-Library book source (EAPI search and download, multi-mirror failover and probing, secret-storage credentials, a book-source settings page) and a bookshelf view (cloth spines on wooden planks, progress bookmarks, pull-out hover motion), and update both guides and version metadata. Retain the published 0.13.3 `banana-reader` identity and legacy-link handlers. Mobile adds native API transport, isolated model assignments, touch selection, responsive notebook follow-ups and interrupted-request recovery. Physical iOS/Android acceptance remains pending.

- 2026-10-21 · 0.13.2: Replace 10 static style assignments and seven manual settings headings reported by the community scan, preserving existing values, dynamic layout and saved data. Add pinned official ESLint checks and a release-check command.

- 2026-10-20 · 0.13.1: Release immediate language switching for open readers, dynamic labels and accessibility captions; clean up English documentation. Validation covers 124 regression tests, TypeScript checking, the bundled build and native English/Chinese/English switching with marks and an unsent draft retained.

- 2026-10-20 · 0.13.0: Release English/Simplified Chinese interface settings and update both user guides, developer documentation and version metadata. Validation covers 120 regression tests, TypeScript checking and the bundled build. Plugin ID and data paths remain unchanged.

- 2026-10-20: Move unchanged runtime TypeScript into `src/`, tests into `tests/`, and the build script into `scripts/`. Group developer documentation by purpose. Update build/test paths and add an explicit TypeScript configuration. Version 0.12.5, plugin ID, installation outputs and data paths stay unchanged.

- 2026-10-20: Remove internal engineering and QA records from the repository and prepare the 0.12.5 release. Keep third-party notices and installation/data paths unchanged.

- 2026-10-20: Add a persisted UI-language choice (follow Obsidian, Simplified Chinese, English), localize settings and reader controls, and preserve existing prompts, model routes and saved documents. Settings and existing readers update immediately.

- 2026-10-20: Refresh existing reader labels immediately when the interface language changes, including Notebook, Q&A and Marks. Remove mixed-language prose from the English guide.

- 2026-10-20: Refresh reading statistics, index labels and progress tooltips on language changes, and remove orphaned accessibility captions. Validate English/Chinese/English switching in one open reader through BRAT, retaining marks and an unsent draft; 124 regression tests pass.
