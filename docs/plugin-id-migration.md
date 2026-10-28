# Community identity restoration — 2026-10-28

The maintainer approved returning to the existing community entry. The supported community ID is `gloss-reader`; the visible name remains **Banana Reader**. Publication repository: [TreyDong/banana-reader](https://github.com/TreyDong/banana-reader). Version 0.14.7 restored the identity from the 0.14.6 working source; the current supported package is [0.14.8](https://github.com/TreyDong/banana-reader/releases/tag/0.14.8), with the complete automated Community review and provenance checks passed. It is desktop-only; physical iOS/Android acceptance remains pending. The former `banana-reader-plugin` repository and its beta channel are archived historical releases. Archival does not uninstall or migrate a vault installation.

## Existing gloss-reader users

Update the three installation assets in place. Preserve `data.json`, `indices/`, settings, annotations, conversations, reading progress and exported Markdown notes. No cross-ID migration is needed. Both `obsidian://gloss-reader` and `obsidian://banana-reader` note links remain handled.

## Existing banana-reader users

Restoring the community entry does not change an installed replacement. Continue using it until a deliberate local cutover. Never enable both identities: they share view IDs, extensions and note protocols. The restored release refuses to load if `banana-reader` is active, before reading or writing plugin data.

For a cutover, disable both installations through Obsidian, make a verified local archive containing both complete plugin folders, and inspect both data inventories. If both contain records, explicitly select the current source and preserve the other copy in the backup; do not silently merge. Install `main.js`, `manifest.json` and `styles.css` from the same maintained 0.14.8 release into `<vault>/.obsidian/plugins/gloss-reader/`, copy the selected `data.json` and recognized index files while both plugins remain stopped, and verify their hashes before enabling only `gloss-reader`. Do not remove or rename original folders to force old migration code. Keep backups and the disabled `banana-reader` installation until reading records, settings, model connections, note links, export and a restart have been checked. SecretStorage reference names remain `reader-<service-id>`; never copy credential values into JSON or release assets. Reassign shortcuts if necessary.

Automatic reverse migration is intentionally absent: old and replacement folders may both contain valid edits. The previous replacement's guarded gloss-to-banana import remains available for historical compatibility but is not invoked when the restored identity loads.

## Directory and release acceptance

The existing `gloss-reader` entry is restored and now serves 0.14.8. Its complete automated review shows Completed, with verified artifact attestations and byte-for-byte build reproduction; see [acceptance evidence](../notes/community-review-repair-plan.md). No new ID, name-release request or replacement listing is needed.

For later releases, run official lint, regression tests, TypeScript and bundle checks; submit the exact source through Review branch, then build and attest again on the version tag. Publish only its matching three files, synchronize the default-branch manifest, and run Check for new releases. Verify directory version, complete review and installability separately from GitHub publication. Use the [release checklist](development.md#release-checklist).
