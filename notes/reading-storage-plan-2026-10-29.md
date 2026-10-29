# Markdown 导出目录设置 — 2026-10-29

Release delivery for the accepted final implementation is tracked in [0.14.9 verification](release-0.14.9.md). Earlier preview statements below describe their original test stage.
用户明确取消此前的 13 文件存储改造方案，只要求设置导出 Markdown 的目标目录。原提案未执行，副本保留在 `/private/tmp/reader-cancelled-storage-plan-20261029.md`。

## 本轮范围

- 第一个「外观配置」设置页增加 Markdown 导出目录，支持选择现有文件夹或手填新路径。
- 旧安装未配置时仍默认「收集箱」；明确留空时使用笔记库根目录。
- 选定路径持久保存，导出时使用该目录，新路径在实际导出时创建。
- 保留当前每次导出新建一份 Markdown 的文件命名、内容及原文回跳行为。
- 仅校验目标路径，不允许越界、受保护目录或将文件当作目录；保存设置失败时回退原值。
- 不改阅读数据、类型、自动保存方式、Z-Library、索引、书架或个人安装。

预计修改 `src/main.ts`、`src/i18n.ts`、`tests/mobile-lifecycle.test.ts`、两份 README 和本记录（六文件）。

## 验证

- `npm run check` 通过：零警告 lint、元数据检查、205 项测试、类型检查与生产构建；`git diff --check` 通过。
- 新测试覆盖目录保存与重新加载、嵌套目录创建、导出内容和不重复覆盖、根目录输出、非法/受保护路径、同名文件阻塞、失败回退以及输入框/选择器接入。
- 独立合成 Obsidian 1.14.5 库中，默认显示收集箱；选择已有 Books 目录能保存，再手填 QA Exports/Nested，实际导出成功创建新目录和 Markdown，内容保留原有摘录、批注与原文回跳。
- 导出后核对原有划线、问答、草稿及所有其他设置均未改变。只更新了测试库插件；个人库安装和正式发布未变。预览包仍只包含三个安装文件。
