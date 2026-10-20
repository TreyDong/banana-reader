# Development

Run commands from the repository root. Node.js and npm are required.

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

`src/i18n.ts` contains the UI catalog, Obsidian-language resolution and display-only helpers. `settings.language` accepts `auto`, `zh-CN` or `en`; older settings default to `auto`. Use `ui(...)` for fixed interface labels. Keep document content, editable prompts, custom model/service names and data-path strings literal. Built-in command names are translated only while their saved name is unchanged. Locale changes persist through the existing save queue; a failed save restores the previous locale. Open reader tabs apply the selected locale when reopened, preserving active questions and drafts.
