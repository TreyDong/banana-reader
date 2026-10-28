# Community review repair dry run — 2026-10-28

Status: batch approved by the user; 0.14.8 repair implemented and locally verified. Remote provenance and official review still pending.

## Verified starting point

- Official account review: https://community.obsidian.md/account/plugins/gloss-reader
- Reviewed release: 0.14.7, commit `ad067574ef4a778e424afeaf82e08b8f092ef35e`, repository `TreyDong/banana-reader`.
- Isolated repair branch: `fix/community-review-0.14.7`, worktree `/private/tmp/banana-reader-community-review`.
- The primary desktop checkout contains unrelated uncommitted changes and will be preserved.
- Existing 0.14.7 release is published with all three installation assets. Earlier local notes describing an incomplete draft are stale.
- Baseline official ESLint configuration: 0 errors, 826 warnings (including one ignored-manifest configuration warning). Baseline regression suite: 188 passed, 0 failed.
- Official review still says Pending / incomplete; SOURCE CODE and CSS LINT results were visible on this visit.

## Proposed file edit batch

All paths below are relative to this isolated worktree. No personal vault files, credentials, reading records, existing release assets or primary working-copy files are included.

| Files | Intended change |
| --- | --- |
| `src/agent.ts` | Type desktop module loading and provider response boundaries; validate untrusted response fields; preserve all four API protocols, streaming, cancellation, usage receipts and CLI isolation. |
| `src/brief.ts`, `src/prompts.ts`, `src/rag.ts` | Validate JSON and array elements before use; remove unsafe values without weakening existing evidence, migration or retrieval constraints. |
| `src/main.ts` | Type persisted settings and native integration boundaries; use owner-window APIs; preserve composition input; replace deprecated refresh calls; add searchable settings with a pre-1.13 fallback; remove unused declarations. |
| `src/pdf-engine.ts` | Use typed PDF text items and worker registration; retain disabled evaluation and native-page fallback. |
| `scripts/build.mjs` | Remove PDF dependency dynamic-code construction at build time, select its interpreter fallback, fail closed if pinned dependency structure changes, and verify the final installation bundle. |
| `src/pdf-ui.ts`, `src/reading-ui.ts` | Use document-owned DOM creation and window scheduling; preserve annotations and original-page coordinates across popout windows. |
| `src/formats.ts`, `src/translation.ts`, `src/zlibrary.ts` | Correct scheduling and data validation; remove unused code; preserve format limits, abort behavior and safe filenames. |
| `src/bookshelf.ts`, `src/core.ts`, `src/pdfbook.ts`, `src/services.ts`, `src/i18n.ts` | Resolve redundant assertions, unused values, regex and display-string warnings while preserving data formats. |
| `src/legacy-migration-desktop.ts` | Keep path helpers bound safely; retain exclusive-copy, conflict, symlink and rollback protections. |
| `styles.css` | Remove the redundant rectangular clip-path flagged for partial support; preserve bookmark appearance. |
| `eslint.config.mjs`, `package.json` | Make the exact intended source/metadata checks explicit; do not hide warnings by disabling or downgrading rules. |
| `.github/workflows/reader-release-verify.yml` (new) | Generalize provenance verification: build exact source, compare release bytes, attest only matching assets, and verify attestations. No automatic replacement of existing assets. |
| `tests/community-review.test.ts` (new), affected existing test fixtures | Add meaningful boundary checks for PDF without dynamic compilation, malformed model payloads, composition input, settings search and existing stored reading data. Update test fixtures only where documented window APIs require it. |
| `docs/development.md`, this repair record | Record the exact validation scope, residual intentional capabilities and release/official-review status. |

The concrete tests/fixtures will be selected after the boundary changes are implemented; expected existing candidates are `tests/mobile.test.ts`, `tests/mobile-lifecycle.test.ts`, `tests/i18n.test.ts`, `tests/agent.test.ts`, `tests/rag.test.ts` and `tests/formats.test.ts`. New metadata/version changes or publication are not claimed as already performed.

## Intentional capabilities

- File enumeration currently occurs in the document picker and bookshelf. Do not replace a scanner-recognized call with equivalent hidden enumeration just to suppress a finding. Audit scope, timing and protected-path handling, and keep documentation truthful.
- Clipboard calls are user-clicked `writeText` operations; no clipboard-reading call was found in runtime source. Keep copy features and explain any remaining capability notice.
- Dynamic code comes from bundled pdf.js (two feature probes and a PostScript compiler). `getDocument` already sets `isEvalSupported:false`; the build still needs to remove these constructors so the release can be statically inspected.
- Artifact attestations require an actual successful GitHub Actions execution against exact asset hashes. Adding a workflow file alone does not satisfy the recommendation.

## Acceptance

1. Full source lint and TypeScript/bundle build, with no suppressed new findings.
2. Existing regression suite plus targeted boundary tests; preserve reading data, API receipts and identity guards.
3. Inspect installation bundle for dynamic constructors and external imports; exercise real PDF extraction with dynamic generation unavailable.
4. Verify settings and reading behavior in an isolated synthetic vault if the application is available. Do not alter the personal installation.
5. Before claiming the release/provenance item fixed, execute and verify the workflow against published or candidate assets and compare SHA-256 values.
6. Keep official Community review acceptance separate from local checks; the currently visible results are incomplete.

## Implementation and current verification

- Local strict recommended ESLint: zero errors and zero warnings. Recommended severities are no longer downgraded; warnings block the release. Manifest/package/lockfile/version metadata receive explicit validation.
- 197 regression tests passed (188 existing plus nine targeted cases), including real PDF extraction with dynamic string/wasm generation prohibited, final-bundle syntax inspection, malformed provider payloads, complete embedding vectors, settings search, composition events and scoped shelf enumeration.
- TypeScript and the complete 0.14.8 installation build passed. Dynamic PDF code constructors are removed by a pinned, structure-checked build transform; the dependency installation itself remains untouched.
- Native Obsidian 1.14.5 in `/private/tmp/reader-community-0148-qa`: plugin 0.14.8 loaded; existing four-tab settings editor rendered; global search for Bookshelf folder found the plugin settings; configured Books folder was visible; synthetic saved annotation and unsent draft survived; Markdown export was created with the annotation and source links; the scoped shelf opened its synthetic EPUB successfully.
- The personal vault installation has not been modified. The test vault contains synthetic fixtures only.
- Necessary file enumeration and clipboard-write behavior notices are retained and documented rather than concealed.
- GitHub workflow proof, official preview scan and publication remain to be verified.

### PDF native-view acceptance follow-up

Native acceptance caught an existing global-worker collision: PDF.js registers both `pdfjsLib` and `pdfjsWorker` globally when its modules load, which can replace the host viewer's worker version. The build now removes both registrations with exact structure checks. Text extraction uses a dedicated MessageChannel and disposes its task, worker and ports. The protected VM test supplies host library/worker sentinels and verifies their identity remains unchanged. Native PDF mounting also reveals the source leaf before moving it and resizes it in the reader window, with cancellation checked again after reveal.

After reloading only the synthetic test window, native Obsidian displayed the original PDF with page count 1/1; opening Reader reflow and then switching to Original pages both displayed the actual synthetic text. Personal-vault files were not changed. An additional lifecycle test covers native initialization and cancellation while showing the source.

The user explicitly approved uploading to `https://github.com/TreyDong/banana-reader`, running provenance and official review, and publishing 0.14.8 only after verification. The earlier upload rejection performed no remote mutation.

### Official preview reconciliation

The official preview of `55e8913` completed with one remaining source warning: an unnecessary type assertion on the bound modal-close callback (`src/main.ts:1198`). The local compiler had inferred that bind result as `any` because strictBindCallApply was unset. Enable TypeScript's strictBindCallApply and remove the assertion, so both local and official checks use the real callback type without suppression. A second exact-source preview is required before release.
