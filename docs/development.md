# Development

Run commands from the repository root. Node.js and npm are required.

Current release: **0.13.0**, including English and Simplified Chinese UI settings. The minimum desktop Obsidian version remains **1.11.4**.

```sh
npm ci
npm run build
npm test
```

## Layout

- `src/`: runtime TypeScript. The plugin entry is `src/main.ts`. Existing modules remain together so their relative imports and behavior are unchanged.
- `tests/`: Node test-runner regression tests. Imports point to `../src/`; tests use synthetic data and mocked or local-loopback services.
- `scripts/build.mjs`: bundle the entry with esbuild and embed the root project license and complete third-party notices.
- `tsconfig.json`: typecheck runtime sources using the existing compiler options; no JavaScript is emitted by TypeScript.
- `docs/`: developer and detailed reference documentation.

The build emits `main.js` in the repository root. Install that file together with root `manifest.json` and `styles.css`. Runtime outputs are independent of the source-directory layout. `main.js` and `node_modules/` are ignored by Git.

The plugin ID remains `gloss-reader`. Build and tests do not deploy files to a vault. Preserve any existing `data.json` and `indices/`; they are user data and are never source files or release assets. Do not copy this repository into an Obsidian vault.

## Licenses

[LICENSE](../LICENSE) covers project code. [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) records bundled dependency and font notices plus historical source references. The build carries the complete texts in `main.js`. Both files stay in the repository root.

## UI localization

`src/i18n.ts` contains the UI catalog, Obsidian-language resolution and display-only helpers. `settings.language` accepts `auto`, `zh-CN` or `en`; older settings default to `auto`. Use `ui(...)` for fixed interface labels. Keep document content, editable prompts, custom model/service names and data-path strings literal. Built-in command names are translated only while their saved name is unchanged. Locale changes persist through the existing save queue; a failed save restores the previous locale. Open reader tabs update their explicitly bound UI labels in place, preserving active questions, selections and drafts.

`auto` uses Obsidian's `getLanguage()`: Chinese locales resolve to Simplified Chinese, while other locales resolve to English. The setting is per vault. UI language does not change the model's answer language or translate existing default prompts. Preserve canonical PDF source labels and other stored identity strings; translate their display labels without changing selection or citation matching.

The regression suite includes locale resolution, catalog coverage, placeholder preservation, custom command names, persistence and save-failure rollback, compiled-plugin integration and same-page PDF selection preservation. Compiled-plugin tests cover language changes in an already open notebook and retain draft inputs, source anchors and active controllers. Previously completed synthetic-vault UI checks cover both languages, settings and reader controls, reopening a reader and persistence after reload.

`bindUi()` registers explicitly translated text nodes and accessibility attributes; `refreshUi()` updates only those bindings, retaining child icons and skipping nodes changed by another renderer. User-authored content and input values are never registered. `refreshLanguage()` refreshes reader chrome and notebook labels without reloading documents, restarting services or triggering model requests.

## Release checklist

Keep `package.json`, the root package entries in `package-lock.json`, `manifest.json` and `versions.json` consistent. Update the current version and behavior in both READMEs and this guide; historical release entries retain their original versions. Build and run tests from the exact source revision being released.

Publish only `main.js`, `manifest.json` and `styles.css` as installation assets, using the manifest version as the release tag without a `v` prefix. Verify the published tag, source revision and downloaded asset hashes. Keep compiled output, credentials and vault data out of Git and the release. Existing users update those three files and restart Obsidian; preserve `data.json` and `indices/`.
