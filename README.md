# Banana Reader

Version **0.13.0** adds English and Simplified Chinese interface settings, with an option to follow Obsidian's language.

**Read a passage. Ask about it. Keep the understanding beside the source.**

Turn Markdown notes, PDFs and EPUB books into a reading workspace inside Obsidian. Highlight a sentence, ask a question in the margin, follow the answer back to its source, and export what you learned as a Markdown note.

[中文使用说明](README.zh-CN.md) · [Install](https://community.obsidian.md/plugins/gloss-reader) · [Report an issue](https://github.com/TreyDong/banana-reader/issues)

> 在 Obsidian 里边读、边问、边记。支持 Markdown、原版 PDF 和 EPUB；问答、划线与批注留在原文旁，读完可导出带出处的 Markdown 笔记。


## What you can do

- **Ask where you are reading.** Select a passage for an explanation, a counterexample or a translation. Keep follow-up questions in the same conversation. Responses show their actual model and available usage.
- **Return to the evidence.** Click a paragraph citation or PDF page number to jump back to the passage behind an answer.
- **Mark what matters.** Add highlights, straight or wavy underlines and personal notes. Review them alongside your questions in the notebook.
- **Keep the original page.** Read PDF pages in their original layout with continuous scrolling. Read EPUB chapters in book order, with contents navigation and adjustable typography.
- **Leave with a useful note.** Export excerpts, annotations and conversations to a new Markdown file with source links. Original documents stay unchanged.
- **Use your own models.** Connect a supported API or an authenticated Codex, Claude or Pi CLI. Choose question, translation and article-brief models independently. Optional book indexing retrieves passages across a longer document.

## Get started

1. Install from the [community directory](https://community.obsidian.md/plugins/gloss-reader) and enable **Banana Reader**.
2. Open a Markdown, PDF or EPUB file. Click **Open Banana Reader** in the ribbon, or run **Banana Reader: Enter immersive reading** from the command palette.
3. Select a sentence. Highlight it or add a note immediately. For AI questions, add a connection in **Settings → Banana Reader → Model services** and choose a question model first.
4. Ask about the selection, for example: *“Which claim does this paragraph support?”* Click a citation to check the answer against the source.
5. Open the notebook and click the download icon (**Export Markdown notes**) to save a new Markdown note in `收集箱/`. Choose **Back to document** to return to the normal file view.

These labels use the English interface. To switch from Chinese, open **设置 → Banana Reader → 外观配置 → 界面语言** and choose **English**.

Reading, marking, annotation and export work without an AI account. AI features need your own service access and may incur provider charges. The interface supports **English and Simplified Chinese**, on **desktop Obsidian 1.11.4+**.

## Make it comfortable

Choose **Settings → Banana Reader → Appearance → Interface language**: **Follow Obsidian**, **中文（简体）**, or **English**. Follow Obsidian is the default: Chinese locales use Simplified Chinese and other locales use English. The choice is saved for this vault. Settings and command labels update immediately. Reopen an existing reader to apply its new interface language. This changes UI labels only; prompts, model assignments, translation targets and saved content keep their existing values. Unedited built-in command names follow the interface; renamed and custom commands keep their saved names. Switching to English does not translate the existing Chinese default prompts or change the model's answer language.

Change the paper or dark theme, font, text size and line spacing from the reading toolbar. Wider panes show margin cards; narrow panes keep conversations in the notebook. Question, translation and article-brief models have separate assignments. Built-in Google translation is also available without a chat-model account.

For a longer text, configure an OpenAI-compatible embedding model and choose **Index → Build index** inside the reader. Indexing is optional; automatic indexing is off by default. Retrieval finds relevant passages and does not claim to summarize every page. See the [Chinese guide](README.zh-CN.md) for service setup and detailed format limits.

## Your files and connections

Annotations and conversations are saved in the plugin's `data.json`; optional indexes use its `indices/` folder. Export creates ordinary Markdown notes. If you sync `.obsidian`, your sync tool may also sync this data.

AI requests send document context and your question to the service you choose. Indexing sends text chunks to your embedding provider. Google translation sends selected text to Google; optional search sends search terms to DuckDuckGo. The plugin has no author-operated server, advertising or client-side telemetry. Bundled fonts load locally.

The file picker lists vault paths only when opened. Copy buttons **write** the requested text to the clipboard; the plugin does not read clipboard contents. Local CLI connections use executable discovery, existing CLI authentication and temporary workspaces, requiring filesystem and process access. A local CLI can still call a remote service. API connections do not require a CLI. Read the [access details](README.zh-CN.md#账号网络与本地访问) before connecting a service.

## Before you install

- Desktop only; English and Simplified Chinese interfaces are available.
- PDF selection needs a text layer. This version has no OCR or cross-page selection. Reading font settings do not reflow PDF pages.
- EPUB supports text chapters and local raster images. DRM and original fixed-layout styling are not supported.
- Use models available to your own account. Discovery does not guarantee access; failed requests show an error and do not silently switch providers.

For manual updates, copy `main.js`, `manifest.json` and `styles.css` from the same [release](https://github.com/TreyDong/banana-reader/releases) into `.obsidian/plugins/gloss-reader/`. Preserve existing `data.json` and `indices/`. The stable plugin ID is `gloss-reader`.

## Development and credits

See the [development guide](docs/development.md) for the source layout, build and validation commands.

Build with `npm ci` and `npm run build`; run tests with `npm test`. When [reporting an issue](https://github.com/TreyDong/banana-reader/issues), include the app/plugin version, document format and reproduction steps. Do not include private documents or API keys.

Current project code: [MIT](LICENSE). Newsreader and Schibsted Grotesk fonts: SIL OFL. fflate: MIT. Full [third-party notices](THIRD_PARTY_NOTICES.md) are embedded in the installation package. Early interaction references include Gloss and Qiaomu Reader; the third-party notices retain the source-reference disclosures.

## Repository changes

- 2026-10-20 · 0.13.0: Release English/Simplified Chinese interface settings and update both user guides, developer documentation and version metadata. Validation covers 120 regression tests, TypeScript checking and the bundled build. Plugin ID and data paths remain unchanged.

- 2026-10-20: Move unchanged runtime TypeScript into `src/`, tests into `tests/`, and the build script into `scripts/`. Group developer documentation by purpose. Update build/test paths and add an explicit TypeScript configuration. Version 0.12.5, plugin ID, installation outputs and data paths stay unchanged.

- 2026-10-20: Remove internal engineering and QA records from the repository and prepare the 0.12.5 release. Keep third-party notices and installation/data paths unchanged.

- 2026-10-20: Add a persisted UI-language choice (follow Obsidian, Simplified Chinese, English), localize settings and reader controls, and preserve existing prompts, model routes and saved documents. Settings apply immediately; reopen an existing reader to apply its interface language.
