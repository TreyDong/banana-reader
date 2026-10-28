# Development

Run commands from the repository root. Node.js and npm are required.

Published GitHub release: **0.14.7**. Community-review repair candidate: **0.14.8**, retaining the desktop-only `gloss-reader` community identity. Minimum Obsidian: **1.11.4**. Physical iOS/Android validation is pending; local checks are not directory approval.

```sh
npm ci
npm run check
```

## Layout

- `src/`: runtime TypeScript. The plugin entry is `src/main.ts`. Existing modules remain together so their relative imports and behavior are unchanged.
- `tests/`: Node test-runner regression tests. Imports point to `../src/`; tests use synthetic data and mocked or local-loopback services.
- `scripts/build.mjs`: bundle the entry with esbuild and embed the root project license and complete third-party notices.
- `tsconfig.json`: typecheck runtime sources using the existing compiler options; no JavaScript is emitted by TypeScript.
- `docs/`: developer and detailed reference documentation.

The build emits `main.js` in the repository root. Install that file together with root `manifest.json` and `styles.css`. Runtime outputs are independent of the source-directory layout. `main.js` and `node_modules/` are ignored by Git.

The community plugin ID is `gloss-reader`, restored in 0.14.7. The display name remains Banana Reader; never activate the historical `banana-reader` replacement at the same time. Internal view IDs remain stable. See [identity migration](plugin-id-migration.md). Build and tests do not deploy files to a vault. Preserve any existing `data.json` and `indices/`; they are user data and are never source files or release assets. Do not copy this repository into an Obsidian vault.

## Licenses

[LICENSE](../LICENSE) covers project code. [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) records bundled dependency and font notices plus historical source references. The build carries the complete texts in `main.js`. Both files stay in the repository root.

## Official source checks

`npm run lint` runs the pinned `eslint-plugin-obsidianmd` recommended configuration at its original severities with `--max-warnings 0`. Release metadata is validated separately, including the manifest, package, lockfile, versions map, identity and desktop-only status. No source rule is disabled or downgraded. `npm run check` also runs the regression suite and the TypeScript/bundle build.

The 0.14.7 baseline contained 826 local warnings and no lint errors. The repair types JSON/provider boundaries and native host integration, uses document-owned DOM helpers and scheduling, removes unused declarations, replaces deprecated keyboard/refresh calls and adds declarative settings search with a legacy fallback. Search indexes both Chinese and English labels without network requests or writes; the existing four settings tabs remain the editor.

Document selection and the unscoped bookshelf enumerate file paths only after the user opens those interfaces. A configured bookshelf folder is traversed directly, with protected subtrees excluded before traversal. These capabilities can still produce a Community behavior notice. Copy actions only call `clipboard.writeText` on a user click; the plugin does not read the clipboard. Do not replace these APIs with aliases just to hide capability findings.

The build's version-checked PDF transform removes both dynamic-code probes and the PostScript compiler branch from PDF.js 4.10.38, retaining the upstream interpreter. Both upstream global library/worker registrations are removed, and a dedicated MessageChannel prevents the bundled engine from replacing Obsidian's native PDF worker. Dependency files on disk remain unchanged. Source-structure changes fail the build, and the complete emitted installation bundle is parsed again to reject dynamic constructors/evaluation. A real synthetic PDF is extracted in a VM with string/wasm code generation disabled. PDF text/outline extraction stays local; the original-page view remains the fallback.

The 0.13.2 release previously replaced static style assignments and manual settings headings. Those changes and stored data formats are preserved.

## UI localization

`src/i18n.ts` contains the UI catalog, Obsidian-language resolution and display-only helpers. `settings.language` accepts `auto`, `zh-CN` or `en`; older settings default to `auto`. Use `ui(...)` for fixed interface labels. Keep document content, editable prompts, custom model/service names and data-path strings literal. Built-in command names are translated only while their saved name is unchanged. Locale changes persist through the existing save queue; a failed save restores the previous locale. Open reader tabs update their explicitly bound UI labels in place, preserving active questions, selections and drafts.

`auto` uses Obsidian's `getLanguage()`: Chinese locales resolve to Simplified Chinese, while other locales resolve to English. The setting is per vault. UI language does not change the model's answer language or translate existing default prompts. Preserve canonical PDF source labels and other stored identity strings; translate their display labels without changing selection or citation matching.

The regression suite includes locale resolution, catalog coverage, placeholder preservation, custom command names, persistence and save-failure rollback, compiled-plugin integration and same-page PDF selection preservation. Compiled-plugin tests cover language changes in an already open notebook and retain draft inputs, source anchors and active controllers. The latest complete suite passed 180 tests, including two compiled-plugin lifecycle regressions for recoverable PDF loading and cancelled mounts. After automatic approval service access recovered, independent Obsidian mobile emulation also verified native PDF retry, rapid document switching, multiline entry, keyboard-sized viewports and the complete selection-to-export flow. Physical iOS/Android acceptance remains pending; see [mobile release validation](mobile-release-validation.md) for the exact scope. Native checks in an isolated synthetic vault use BRAT to restart only the test Reader, then switch English/Chinese/English in the same open reader. Notebook filters and counters, mark styles, reading statistics and index tooltips update while the unsent draft and saved marks remain intact.

`bindUi()` registers explicitly translated text nodes and accessibility attributes; `refreshUi()` updates only those bindings, retaining child icons and skipping nodes changed by another renderer. User-authored content and input values are never registered. `refreshLanguage()` refreshes reader chrome, notebook labels and reading statistics without reloading documents, restarting services or triggering model requests. Index progress retains a label callback so counts can be rendered in the current locale; repainting does not restart indexing. After notebook rendering, remove only generated accessibility captions no longer referenced by `aria-labelledby`.

## Release checklist

Keep `package.json`, the root package entries in `package-lock.json`, `manifest.json` and `versions.json` consistent. Run `npm run check` on the exact revision being reviewed. The `reader-release-verify.yml` workflow repeats these checks on GitHub, builds the three installation files, generates SHA-256 values, creates provenance attestations for all three and verifies the attestations against the workflow, source ref and source commit before uploading its candidate artifact.

Before a community release, obtain a successful official **Review branch** scan. Retain documented necessary file-enumeration and clipboard-write behavior notices; do not claim they are code failures or conceal them. Keep official review results separate from local verification.

A release tag is the manifest version without a `v` prefix. Build and attest again on the exact tag. Publish the three installation files from that attested artifact, then download the actual published bytes, compare all hashes and run `gh attestation verify` against the tag commit. Adding a workflow file or passing local checks alone does not establish artifact provenance.

Preserve existing `data.json` and `indices/`; they are not release assets. Physical mobile acceptance remains pending and `isDesktopOnly` stays true. Do not change the personal installation during isolated release validation.

## Mobile runtime

Obsidian mobile has no Node.js or Electron. Runtime built-ins are loaded only inside guarded desktop paths, including the published legacy migration. Mobile uses injected `requestUrl` transport and Vault.adapter storage; EPUB uses `fflate/browser`. Keep the compiled-entry test that forbids every external import except `obsidian`.

Phone model assignments use `mobileTaskModels`; shared service IDs, desktop task routes and historical model receipts remain intact. Mobile receives complete JSON answers, with stop/timeout discarding late results. Native requests cannot actually be aborted by the plugin. On startup, recover pending requests before any settings save. Interrupted regeneration restores the last complete answer and its exact evidence.

Mobile never performs an initial cross-ID data copy because DataAdapter does not offer exclusive creation. It permits fresh and stable-ID installations, and verifies existing desktop migration receipts and legacy file hashes without writing either copy. Desktop keeps the published exclusive-copy, conflict, symlink and rollback checks.
