# Plugin ID migration: preparation only

Status on 2026-10-22: the live entry, manifest and installation ID remain `gloss-reader`. The intended future ID is `banana-reader`. No live ID, vault installation, release asset or user data was changed by this preparation. This work is isolated on `migration/banana-reader-id`, based on the released 0.13.2 source; unrelated uncommitted 0.14.0 work is excluded.

## Official directory findings and remaining gate

The account editing form exposes descriptions, categories, icons, screenshots and source-repository settings, but no ID field. More actions exposes Get help, View on GitHub and Archive. The [official sample](https://github.com/obsidianmd/obsidian-sample-plugin/blob/master/AGENTS.md#manifest-rules-manifestjson) treats released IDs as stable API. The [manifest reference](https://docs.obsidian.md/Reference/Manifest) documents display-name changes and requires the local folder name to match the ID. Neither source documents a supported automatic installed-ID migration.

An authorized Get help inquiry was submitted on 2026-10-22 and appears under Your Help Requests as open. It asks whether an administrator can rename or alias the entry while preserving its history and existing users' update path, and how enabled state, commands/hotkeys and secret references should be handled. It explicitly asks the administrator not to change or archive the live entry yet. Administrator support for a rename/alias is still unknown; the absence of a self-service field does not prove an administrator cannot do it.

Do not publish a manifest with a new ID to the current update channel until the official process is confirmed. The [official releases repository](https://github.com/obsidianmd/obsidian-releases#how-community-plugins-are-pulled) explains that clients resolve the version from the repository manifest and install release files. Simply changing the ID would not establish a compatible update path for old installations. Its deprecation map contains version exclusions, not old-ID/new-ID aliases.

## Prepared data migration

`src/plugin-migration.ts` provides a read-only plan and a copy operation. `src/main.ts` calls it **only** when the installed manifest ID is exactly `banana-reader`, before `loadData()` or any settings persistence. The current `gloss-reader` installation does not call it. If migration fails, loading stops before defaults can be saved over imported content.

The migrator requires confirmation that the old plugin is disabled and a new installation whose manifest ID matches `banana-reader`. It uses the actual vault configuration directory, including custom configuration paths. It reads only the old Reader's `data.json` and recognized `indices/` files, copying bytes without rewriting fields. Thus language and appearance preferences, service/model IDs, editable prompts, custom command names, document keys, highlight anchors/styles/notes, question threads/citations, usage receipts, follow-up drafts, reading progress and summaries retain their stored values.

Files are staged with private permissions, hashed, and linked exclusively into the new installation. Existing destination data or indices without a valid migration receipt cause a refusal; no automatic merge or overwrite occurs. Copy failures roll back only newly created files, preserving the original installation and any subsequently modified destination files. The receipt makes repeated loads idempotent; later changes to old data require explicit reconciliation rather than silent reimport. Symlinks, malformed/future data formats, unexpected index files, source changes and excessive sizes stop the migration.

Old files are retained. Returning to the old plugin remains possible before new edits are made; after either copy gains new edits, reconcile both copies first. The runtime store itself is not reformatted by this copy. Normal pre-existing store-version migrations remain part of Reader loading.

Service IDs and the existing `reader-<service-id>` SecretStorage names are retained. No credential values are read or copied by the migration helper. Whether the platform's secret scope remains usable across a directory ID change must still be confirmed with the administrator and checked in an isolated vault before cutover. Session-only credentials are not persisted or exported.

## Cutover still to be implemented after official guidance

1. Obtain the supported directory rename/alias/replacement procedure and its effect on installed updates. If a replacement listing is required, retain a working old-ID release channel; do not point old and new entries at an incompatible single mutable manifest.
2. Confirm enabled-plugin state, SecretStorage access and shortcut migration on every supported client version. The prepared data copy does not rewrite `community-plugins.json`, `hotkeys.json` or workspace files, install another plugin, disable a plugin, rename a folder, or trigger a network request.
3. Preserve compatibility for old command references and restored reader view IDs. Existing internal view IDs and CSS names are deliberately retained in this preparation; they are separate from the requested directory/installation identity.
4. Rebase or cherry-pick this preparation onto the intended release source after concurrent feature work is ready. Test old-to-new installation, a fresh installation, both-copy conflicts, restart, all secrets/model assignments, Markdown/PDF/EPUB annotations and rollback in synthetic vaults. Never test by renaming an active personal installation.
5. Only after these gates pass, change release metadata, official links and installation instructions together, publish coordinated releases and verify the actual old-user upgrade path. Do not archive/delete the old entry or remove its data as part of cosmetic cleanup.

## Validation

Fourteen filesystem tests cover byte-preserving migration, custom configuration paths, idempotence, active/unknown old-plugin state, destination conflicts, malformed/future data, symlinks, changed source/destination data, partial disk failure and new installations. Two compiled new-ID startup tests verify import-before-load and refusal before any settings read/write while the old plugin is active; existing compiled-plugin tests continue to cover the old manifest ID. The complete suite contains 140 tests. Run `npm run check` for official lint, the complete regression suite and the TypeScript/bundle build.
