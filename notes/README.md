# notes

工程决策与过程记录（依工作区宪法「项目开箱」）。

## 2026-10-20 — Restore desktop minimap

The paragraph navigation was still implemented, but the <=1259px container rule hid it even though the desktop layout reserved a 52/56px left column. Remove that hide rule and hide the rail only in the existing <=719px single-column layout. Keep PDF-specific behavior intact. Apply the same limited CSS patch to the personal installation and the synthetic QA installation without replacing their runtime or data.

Native QA at the previously affected window width: the Reading position slider is visible again; clicking its middle scrolls to 50%, and scrolling back returns it to 0%. The preview and viewport indicator are visible. Personal data.json remains byte-identical. No annotation, provider or font settings changed. Styles rollback copies were saved locally before patching.

## 2026-10-20 — Refine the paragraph minimap

Scope: the restored left paragraph preview. Compare the live original at https://www.usegloss.io/read/on-thinking-for-oneself with the native synthetic QA reader before changing it. The original uses thin, uneven text-line silhouettes and a light viewport outline. The previous reader stretched six paragraphs across the viewport, repeated almost equal-width strokes, and filled whole highlighted blocks.

Independently implemented rendered-line measurements, merging rectangles split by inline marks. Short documents now retain a natural line density; long documents fit the available viewport. Render actual line widths and paragraph gaps, soften the viewport outline, use thin highlight ticks, and keep hover emphasis horizontal so it does not distort paragraph height. Preserve existing navigation, marks, storage and PDF behavior.

1. Original reference — visually inspected live. Screenshot: `/private/tmp/reader-quality-20261020/01-gloss-reference.png`.
2. Reader before — confirmed oversized preview and heavy marker fill. Screenshot: `/private/tmp/reader-quality-20261020/02-reader-before.png`.
3. Reader after — native six-paragraph fixture shows compact variable-width strokes and retained yellow annotation. Clicking the preview midpoint reports 50%; a drag changed the reported position; scrolling to the beginning reports 0%. Screenshots: `/private/tmp/reader-quality-20261020/03-reader-after.png` and `04-reader-scrolled.png`. All 112 tests and the build passed, including new coverage for short/long sizing, viewport clipping and split line rectangles.

This is a component comparison, not a pixel-identical full-page acceptance: the reference is a 67-paragraph English text at a different viewport; QA is a six-paragraph Chinese text using existing font preferences. No upstream source was copied and no AI requests were sent.

Updated the personal installation's main.js, styles.css and manifest.json to local version 0.12.4; verified installed bytes match the build and data.json remains byte-identical. Rollback snapshot: `90_系统/归档/结构快照/banana-reader-预览本机更新前-20261020-084225`. The automatic approval review rejected Force Reload on the personal Banana Design window because it could lose unsaved workbench state. No alternative reload was attempted; the personal runtime will load the update at its next normal Obsidian restart. Native visual verification above used the separate QA vault. No public release or push was performed.

## 2026-10-20 — Push source version 0.12.5

Bump package.json, package-lock.json, manifest.json and versions.json to 0.12.5. The stable plugin ID remains gloss-reader. Remove README preview links targeting the nonexistent 0.12.4 release asset and describe the minimap changes. Keep private development history on origin/main; synchronize only the ten changed approved source/docs/version files into the independent community-release history for publication/main. Do not include notes/README.md, design-qa.md, private historical commits, data.json, built artifacts or the old one-time workflow in the public source update. This operation updates Git source/version metadata; it does not create a GitHub Release or change a local Obsidian installation.
