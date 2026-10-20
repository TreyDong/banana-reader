# Banana Reader

Source version **0.12.5**. The paragraph minimap stays visible at desktop widths, reflects actual rendered text lines and keeps short documents compact.

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
2. Open a Markdown, PDF or EPUB file. Click **打开 Banana Reader** in the ribbon, or run **Banana Reader: 进入沉浸阅读** from the command palette.
3. Select a sentence. Highlight it or add a note immediately. For AI questions, add a connection in **Settings → Banana Reader → 模型服务** and choose a question model first.
4. Ask about the selection, for example: *“Which claim does this paragraph support?”* Click a citation to check the answer against the source.
5. Open the notebook and choose **导出笔记** to save a new Markdown note in `收集箱/`. Choose **返回文档** to return to the normal file view.

Reading, marking, annotation and export work without an AI account. AI features need your own service access and may incur provider charges. The current interface is **Chinese**, on **desktop Obsidian 1.11.4+**.

## Make it comfortable

Change the paper or dark theme, font, text size and line spacing from the reading toolbar. Wider panes show margin cards; narrow panes keep conversations in the notebook. Question, translation and article-brief models have separate assignments. Built-in Google translation is also available without a chat-model account.

For a longer text, configure an OpenAI-compatible embedding model and choose **索引 → 建立索引** inside the reader. Indexing is optional; automatic indexing is off by default. Retrieval finds relevant passages and does not claim to summarize every page. See the [Chinese guide](README.zh-CN.md) for service setup and detailed format limits.

## Your files and connections

Annotations and conversations are saved in the plugin's `data.json`; optional indexes use its `indices/` folder. Export creates ordinary Markdown notes. If you sync `.obsidian`, your sync tool may also sync this data.

AI requests send document context and your question to the service you choose. Indexing sends text chunks to your embedding provider. Google translation sends selected text to Google; optional search sends search terms to DuckDuckGo. The plugin has no author-operated server, advertising or client-side telemetry. Bundled fonts load locally.

The file picker lists vault paths only when opened. Copy buttons **write** the requested text to the clipboard; the plugin does not read clipboard contents. Local CLI connections use executable discovery, existing CLI authentication and temporary workspaces, requiring filesystem and process access. A local CLI can still call a remote service. API connections do not require a CLI. Read the [access details](README.zh-CN.md#账号网络与本地访问) before connecting a service.

## Before you install

- Desktop only; the interface is currently Chinese.
- PDF selection needs a text layer. This version has no OCR or cross-page selection. Reading font settings do not reflow PDF pages.
- EPUB supports text chapters and local raster images. DRM and original fixed-layout styling are not supported.
- Use models available to your own account. Discovery does not guarantee access; failed requests show an error and do not silently switch providers.

For manual updates, copy `main.js`, `manifest.json` and `styles.css` from the same [release](https://github.com/TreyDong/banana-reader/releases) into `.obsidian/plugins/gloss-reader/`. Preserve existing `data.json` and `indices/`. The stable plugin ID is `gloss-reader`.

## Development and credits

See the [development guide](docs/development.md) for the source layout, build and validation commands.

Build with `npm ci` and `npm run build`; run tests with `npm test`. When [reporting an issue](https://github.com/TreyDong/banana-reader/issues), include the app/plugin version, document format and reproduction steps. Do not include private documents or API keys.

Current project code: [MIT](LICENSE). Newsreader and Schibsted Grotesk fonts: SIL OFL. fflate: MIT. Full [third-party notices](THIRD_PARTY_NOTICES.md) are embedded in the installation package. Early interaction references include Gloss and Qiaomu Reader; the [source audit and release checks](notes/community-release-audit.md) record the specific replacements and verification limits.

## Repository changes

- 2026-10-20: Move unchanged runtime TypeScript into `src/`, tests into `tests/`, the build script into `scripts/`, and the historical QA log into `notes/qa/`. Update build/test paths and add an explicit TypeScript configuration. Version 0.12.5, plugin ID, installation outputs and data paths stay unchanged.
