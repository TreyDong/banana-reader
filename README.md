# Banana Reader for Obsidian

Read Markdown, original PDF pages and EPUB books with configurable AI, anchored highlights, margin notes and Markdown export.

**Desktop only. Requires Obsidian 1.11.4 or later. The plugin interface is currently in Chinese.** Version 0.12.3.

[完整中文说明](README.zh-CN.md) · [Releases](https://github.com/TreyDong/banana-reader/releases) · [Community listing](https://community.obsidian.md/plugins/gloss-reader)

## Installation

Open the [community listing](https://community.obsidian.md/plugins/gloss-reader) and choose **Add to Obsidian**, then enable Banana Reader in Settings → Community plugins.

For manual installation, download `main.js`, `manifest.json` and `styles.css` from the same [GitHub Release](https://github.com/TreyDong/banana-reader/releases). Place all three files in `<vault>/.obsidian/plugins/gloss-reader/` and enable the plugin. When updating, preserve your existing `data.json` and `indices/`. Do not copy source folders or another user's plugin data into your vault.

## Usage

1. Open a Markdown, PDF or EPUB file. Click the **打开 Banana Reader** ribbon icon or run **Banana Reader: 进入沉浸阅读** from the command palette. You can also use the file context menu.
2. In plugin settings, add your own API connection or an already installed and authenticated Codex, Claude or Pi CLI. Select the models you want to use. Assign question, translation and article-summary models independently.
3. Select a passage to ask a question, translate, highlight, underline or add a note. Selecting text does not send a request. Submit the question to call the chosen service.
4. Responses show the actual model and available usage. Click a paragraph or PDF-page citation to return to the source. Continue a conversation inside its existing card, or start an independent question from the bottom input.
5. Open the notebook to review annotations. Choose **导出笔记** to create a new Markdown note in `收集箱/`, including excerpts, annotations, conversations and source links. Original documents are not rewritten and existing exports are not overwritten.
6. Choose **返回文档** to leave immersive reading. Reading controls adjust the theme, font, text size, line spacing and contents navigation. Narrow panes show conversations in the notebook; wider panes also show margin cards.

## Reading and annotation features

Markdown uses Obsidian's native rendering. Selection tools support questions, configurable text instructions, translation, straight or wavy underlines, highlights and written annotations. There are four built-in mark colors. Selections remain visible while composing a question. Questions and marks persist across reloads.

PDF files retain the original page layout through Obsidian's native PDF view. Pages scroll continuously; text selections can be questioned or marked. Conversations, notebook entries and exports retain real page numbers. Page links return to the cited page. Fonts and reading text-size controls do not reflow PDF pages. Scanned pages remain readable, but this release has no OCR and cannot select text that is absent from the source. Cross-page selections and full-book PDF summaries are not provided.

EPUB text is read in spine order with chapter navigation and local raster images. Book scripts are not executed and remote images are not loaded. DRM, image-only books, audio/video, SVG illustrations and original fixed-layout styling are not supported. Limits include 40 MB compressed size, 64 MB expanded size, 4 MB per chapter, 600 chapter files and two million characters.

Article briefs provide structured claims, caveats and paragraph citations. Brief generation uses its independently assigned model, or the configured default when no specific model is assigned. Translation can use the built-in Google translation connection or an independently selected language model. Model errors are displayed; the plugin does not silently choose another model.

## Optional book retrieval

Configure an OpenAI-compatible embedding service in model settings, mark an added model as an embedding model, and select it for indexing. Inside the reader, use **索引** → **建立索引** to build an index for the current document. A question without a text selection can then retrieve passages across the indexed book. Answers keep source and PDF-page references.

Indexing sends document chunks to the selected embedding provider; searching sends the question to that provider and matched passages to the selected answer model. Automatic indexing is off by default. Enabling it can start requests when entering a document. Indexing can be stopped, and a failed rebuild preserves the previous complete index. Limits are 3,000 pages, five million characters, 8,000 chunks and three million vector values. Retrieval is not a complete reading or summary of every page. Images and scanned-page content are not indexed.

## Accounts, costs and network access

The plugin has no author-operated server, advertising, billing or client-side telemetry. AI services require your own account, subscription or API credits and may charge for usage. Model discovery or a cached model name does not establish account entitlement. Requests can fail because of provider access, network conditions or account limits.

Questions, article briefs and model translation send the necessary document context, question and conversation to your chosen model service. Optional question suggestions and automatic indexing are off by default; enabling them can trigger model requests during their documented reading actions. Enabling the plugin alone does not start a model request.

Built-in Google translation sends selected text to `translate.googleapis.com`. Optional web search sends generated search terms to `html.duckduckgo.com` and passes returned snippets to the chosen model. Fonts are bundled locally; there are no runtime font-CDN requests. Data processing by a chosen provider is subject to that provider's policies.

## Local files, CLI access and privacy

To discover and run local CLIs, the plugin checks configured executables and common installation paths and reads `~/.codex/models_cache.json`. It reuses the CLI's existing authentication. Questions and model discovery use temporary workspaces instead of the vault as the CLI working directory; temporary workspaces are cleaned up when finished. CLI tools, extensions and session persistence are disabled where the supported CLI protocol permits. A local CLI can still send requests to its remote model service.

Custom API keys use Obsidian SecretStorage; the compatibility path for an unavailable secret-storage API retains keys only in memory. Plugin data stores service identifiers and secret references, not the API key itself.

Annotations, conversations, drafts, context snapshots and reading progress are stored in `<vault>/.obsidian/plugins/gloss-reader/data.json`. Optional indexes are stored in the adjacent `indices/` directory and contain text excerpts, embeddings and page references. These files are private user data, not release assets. If you synchronize `.obsidian`, your sync tool may also synchronize these files. The plugin does not provide a separate cloud-sync service.

The reader processes documents you explicitly open. It does not recursively ingest the whole vault or automatically expand embedded notes into model context. It excludes configured private diary, company and investment-data paths. The public source and release contain no books, personal notes, credentials, plugin data, indexes or model caches.

## Compatibility and limitations

The plugin ID remains `gloss-reader` so existing installations retain their commands, annotations, data paths and credential references. The display name is Banana Reader. Removing a service does not automatically assign another default service, and existing conversation records keep their original model information.

This release is desktop-only and its interface is Chinese. Mobile, web import, a cloud bookshelf and text-to-speech are not implemented. Dynamic content from third-party Markdown renderers may not support reliable selection anchoring. Context-size limits produce an explicit error instead of silently truncating input. See the [Chinese reference](README.zh-CN.md) for detailed settings, capacity limits and migration behavior.

## Build from source

```sh
npm ci
npm run build
npm test
```

Use the three generated installation files described above. Build output and dependencies are not tracked in Git. The build embeds the project license and complete third-party notices into `main.js`, so the standard three-file installation carries those notices.

## License and source references

Current project code is distributed under [MIT](LICENSE). Bundled Newsreader and Schibsted Grotesk fonts retain the SIL Open Font License; the fflate dependency retains MIT. Full notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

[Nutlope/gloss](https://github.com/Nutlope/gloss) and [Qiaomu Reader](https://github.com/joeseesun/qiaomu-reader) were early interaction references. The release audit distinguishes specific reused implementations from standard functionality. Identified margin-layout code, an EPUB path helper and specific reading styles/texture were replaced locally; the full plugin was not rebuilt. The release does not include their web-service components, example books or GPL components. It does not assign an invented license to an unlicensed upstream snapshot. The comparison is evidence of the review performed, not a legal certification or upstream endorsement. See the [source audit](notes/community-release-audit.md).

## Validation and release status

The tested runtime passed 109 regression tests and native Obsidian 1.14.4/macOS checks using synthetic documents: actual selected-text Q&A with model/usage, source citations, saved highlights, Markdown export, reload persistence, continuous original-PDF reading and page return, EPUB chapter order and cited article briefs. Successful live requests used gpt-6-luna; two other cached model selections failed and were honestly displayed. Windows/Linux, the minimum supported Obsidian version and every external model account were not retested.

The [community listing](https://community.obsidian.md/plugins/gloss-reader) is public and offers **Add to Obsidian**. The 0.12.1 official review completed and reproduced the release JavaScript byte-for-byte. Version 0.12.2 added English quick-start instructions; 0.12.3 separates this full English guide from the preserved Chinese reference after the directory continued to flag the mixed-language README. The runtime JavaScript and CSS remain byte-identical to the tested 0.12.1 release. The latest review status is recorded in the [release audit](notes/community-release-audit.md).
