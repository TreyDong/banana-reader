# notes

工程决策与过程记录（依工作区宪法「项目开箱」）。

## 2026-10-20 — Restore desktop minimap

The paragraph navigation was still implemented, but the <=1259px container rule hid it even though the desktop layout reserved a 52/56px left column. Remove that hide rule and hide the rail only in the existing <=719px single-column layout. Keep PDF-specific behavior intact. Apply the same limited CSS patch to the personal installation and the synthetic QA installation without replacing their runtime or data.

Native QA at the previously affected window width: the Reading position slider is visible again; clicking its middle scrolls to 50%, and scrolling back returns it to 0%. The preview and viewport indicator are visible. Personal data.json remains byte-identical. No annotation, provider or font settings changed. Styles rollback copies were saved locally before patching.
