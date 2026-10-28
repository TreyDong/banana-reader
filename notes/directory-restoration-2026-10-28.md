# Restore the existing Banana Reader community entry

User approved restoring the archived entry and retaining `gloss-reader` as the internal ID, with Banana Reader as the display name. Prepare 0.14.7 from a Git snapshot of the existing 0.14.6 working source in an isolated worktree; preserve the original working tree and personal installation. Existing marketplace repository: TreyDong/banana-reader. Use desktop-only metadata until physical mobile acceptance.

The current personal banana-reader installation is not automatically changed. Its latest records must not be replaced by the old gloss-reader data. Keep both copies, stop both instances and verify backups before any personal cutover. New identity guard rejects simultaneous activation before reading settings.

Validation: official lint 0 errors, 826 warnings retained; 188/188 regression tests passed; TypeScript and esbuild bundle passed; git diff whitespace check passed. Regression executes the compiled plugin and verifies the restored identity loads saved records and refuses simultaneous banana-reader activation before reading data. Original personal plugin files and reading records remain unchanged.

Publication candidate: branch release/restore-gloss-reader in TreyDong/banana-reader; commit ad06757. Previous publication history is retained through a merge parent. GitHub draft release 0.14.7 exists (release ID 426305948); manifest.json upload was confirmed, main.js/styles.css uploads still unconfirmed. Do not recreate the release; first reread its actual assets. A local three-file ZIP and SHA-256 inventory are available under dist/ (ignored).

Blocked: Codex automatic approval review repeatedly failed with a thread-store initialization error. The browser mutation was not executed; Unarchive is available but the entry remains archived. Exact-commit Review branch scan, full release-asset verification, publication and directory acceptance remain pending. Native isolated vault opening was attempted; the file picker did not accept the full test path, so no native acceptance is claimed. Do not switch the personal installation until those checks and a verified backup are complete.
