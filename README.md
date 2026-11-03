# Banana Reader

**Read, annotate, and ask questions alongside your documents in Obsidian.**

Banana Reader turns Markdown, PDF, and EPUB files into a focused reading workspace. Highlight a passage, add your thoughts, ask a model about it, and return to the original text from the answer.

[Simplified Chinese](README.zh-CN.md) · [Install](https://community.obsidian.md/plugins/gloss-reader) · [User guide (Chinese)](docs/guide.zh-CN.md) · [Report an issue](https://github.com/TreyDong/banana-reader/issues)

**Available in the Obsidian community plugin directory.** Open **Settings → Community plugins → Browse**, search for **Banana Reader**, install it, and select **Enable**.

[Install and enable](#installation) · [Features](#features) · [Get started](#get-started) · [Author](#author)

## Features

- **Read in context:** open Markdown, EPUB, or PDF in a dedicated reader with a table of contents and adjustable appearance. PDFs can use text reflow or original pages.
- **Highlight and annotate:** mark text in different styles and colors, write notes, and revisit them in the reading notebook.
- **Ask about a passage:** explain, translate, or ask your own questions; follow citations back to the source.
- **Choose your model:** use an OpenAI-compatible, Anthropic, or Gemini API, or a locally authenticated Codex, Claude, or Pi CLI. Optional embeddings support retrieval across longer texts.
- **Keep your notes:** export excerpts, annotations, and conversations as a new Markdown note with links to the source.
- **Find your next read:** browse the vault bookshelf, or search and download books through a configured Z-Library mirror using your own account.

## Installation

The current community release is **desktop-only** and requires **Obsidian 1.11.4 or later**. The interface supports English and Simplified Chinese.

1. In Obsidian, open **Settings → Community plugins**. If prompted, turn on community plugins first.
2. Select **Browse**, search for **Banana Reader** by **Trey**, and select **Install → Enable**. If it is already installed, enable it in the community plugins list.
3. Open a Markdown, PDF, or EPUB file, then use the **Open Banana Reader** ribbon button or the **Enter immersive reading** command.

You can also open the [official plugin page](https://community.obsidian.md/plugins/gloss-reader), select **Add to Obsidian**, and install and enable it in Obsidian. Check for updates under **Settings → Community plugins**.

For manual installation, download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/TreyDong/banana-reader/releases/latest) into `<vault>/.obsidian/plugins/gloss-reader/`, reload Obsidian, and enable the plugin under **Community plugins**. Keep your existing `data.json` and `indices/` when updating. If you previously installed the separate `banana-reader` plugin ID, see the [data migration guide](docs/plugin-id-migration.md) before switching.

## Get started

Select text to highlight it, add a note, or ask a question. Open the reading notebook to review your annotations and export them as Markdown.

Reading, highlighting, and export do not require an AI account. For AI features, add a service under **Settings → Banana Reader → Model services**, select or add a model, and assign it to the task. With LM Studio on the same computer, start its local server, choose **OpenAI compatible**, and use its displayed base URL (typically `http://localhost:1234/v1`) and model ID.

For setup details and format limits, see the [Chinese user guide](docs/guide.zh-CN.md).

## Privacy and limitations

- Annotations, conversations, drafts, and progress are stored in the plugin's `data.json`; optional indexes are stored in `indices/`. Export creates a new Markdown file. Syncing the plugin folder may sync these files too.
- API keys are stored in Obsidian SecretStorage when available; otherwise they remain in memory for the session. Requests send the relevant text and question to your chosen model or embedding provider. Google translation, optional web search, and Z-Library connect to their respective services.
- PDF text selection requires a text layer; OCR is not included. EPUB requires supported, unencrypted text content. Z-Library is an unofficial integration whose mirrors and availability can change; access only content you are entitled to use.
- Mobile support is under development. The community release is desktop-only; a local mobile candidate is not a verified mobile release.

## Development

```sh
npm ci
npm run check
```

See the [development guide](docs/development.md) for build, test, and release details.

## Author

Banana Reader is maintained by [Trey (TreyDong)](https://github.com/TreyDong). The project brings reading, thinking, and note-taking together in Obsidian, with links back to the original text.

Share feedback, ideas, or problems through [GitHub Issues](https://github.com/TreyDong/banana-reader/issues).

## License and credits

Project code is licensed under [MIT](LICENSE). Fonts and dependencies have their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). Early interaction references include [Gloss](https://github.com/Nutlope/gloss) and [Qiaomu Reader](https://github.com/joeseesun/qiaomu-reader).
