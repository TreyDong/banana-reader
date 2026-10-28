# Community identity restoration — 2026-10-28

The maintainer approved returning to the existing community entry. The supported community ID is `gloss-reader`; the visible name remains **Banana Reader**. Publication repository: `TreyDong/banana-reader`. Version 0.14.7 carries the current 0.14.6 working source and the identity restoration. The community package is desktop-only; physical iOS/Android acceptance remains pending.

## Existing gloss-reader users

Update the three installation assets in place. Preserve `data.json`, `indices/`, settings, annotations, conversations, reading progress and exported Markdown notes. No cross-ID migration is needed. Both `obsidian://gloss-reader` and `obsidian://banana-reader` note links remain handled.

## Existing banana-reader users

Restoring the community entry does not change an installed replacement. Continue using it until a deliberate local cutover. Never enable both identities: they share view IDs, extensions and note protocols. The restored release refuses to load if `banana-reader` is active, before reading or writing plugin data.

For a cutover, disable both installations through Obsidian, make a verified local archive containing both complete plugin folders, and inspect both data inventories. If both contain records, explicitly select the current source and preserve the other copy in the backup; do not silently merge. Install the restored three-file package, copy the selected `data.json` and recognized index files while both plugins remain stopped, and verify their hashes before enabling only `gloss-reader`. Do not remove or rename original folders to force old migration code. Keep backups and the disabled `banana-reader` installation until reading records, settings, model connections, note links, export and a restart have been checked. SecretStorage reference names remain `reader-<service-id>`; never copy credential values into JSON or release assets. Reassign shortcuts if necessary.

Automatic reverse migration is intentionally absent: old and replacement folders may both contain valid edits. The previous replacement's guarded gloss-to-banana import remains available for historical compatibility but is not invoked when the restored identity loads.

## Directory and release acceptance

Run official lint, regression tests, TypeScript and bundle checks. Submit the exact release commit through Review branch on the existing entry. Upload matching `main.js`, `manifest.json`, `styles.css` with a tag exactly equal to the manifest version. Unarchive the existing entry after the matching package is ready. Verify directory version, review status and installability separately from GitHub publication. Update the earlier help request to reflect continuation of the existing ID; name release and a new listing are no longer required.
