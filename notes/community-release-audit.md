# Banana Reader 社区发布审计 — 2026-10-19

状态：BLOCKED（上游分发授权），未公开、未创建 Release、未提交申请。

## 官方依据

- https://docs.obsidian.md/plugins/releasing/submit-plugin ：现行入口为 Community directory，需要 Obsidian 登录并关联 GitHub；不再以 obsidian-releases PR 为当前申请流程。
- https://docs.obsidian.md/community-directory/developer-policies ：要求 LICENSE、遵守所有上游授权；fork 另受公开可核实作者许可等要求约束。
- https://docs.obsidian.md/community-directory/submission-requirements-for-plugins
- https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Releasing/Plugin%20guidelines.md
- obsidian-releases/.github 当前只保留通用 pull_request_template.md（其旧 plugin.md 链接无对应文件）。

## 许可证据与待决路径

- THIRD_PARTY_NOTICES.md 明确逐项列出直接适配自 Nutlope/gloss 的 CSS 和交互实现。
- 原快照：54b13b8882d8a109132c5b2045acd6b45628563d，无 LICENSE。
- 本次 GitHub API 复核 main：95373eb1a50ae77ce7826e80920813cc6b5139ad，repository.license=null，完整文件树仅 README.md 匹配许可关键词；/license 返回 HTTP 404。
- README 中自称 open source 不是明确的使用、修改和再分发许可；未发现覆盖本次适配的授权条款。
- 不为上游材料断言 MIT，不发布缺少授权的源码或二进制。
- 可行路径 A：用户自行取得覆盖已适配代码及公开发布的书面许可（如构成 fork，须满足目录公开可核实要求），再补完整 LICENSE 和审查。
- 可行路径 B：用户明确选择独立替代范围后，重做涉及的 UI、交互与样式并审核来源；不擅自承诺重写整个产品。
- 保留两款字体完整 OFL、fflate MIT 和既有来源声明；没有联系作者。

## 兼容与发布准备

- manifest 名称 Banana Reader、ID gloss-reader、版本 0.12.0、最低 Obsidian 1.11.4、isDesktopOnly=true。ID 合规，无须更名；命令、SecretStorage 引用、用户安装不作迁移。
- 新增 versions.json 仅登记实际当前兼容版本，不虚构历史支持范围。
- README 补齐网络、收费/账户、临时目录、外部 CLI 路径、凭据缓存及本地隐私数据披露。
- 源码仓库仍为原私有远端。将来公开时采用审核过的干净文件白名单，不能直接将私有历史切公开。
- main.js 继续忽略；Release 标准附件为 main.js / manifest.json / styles.css，第三方许可文本需内嵌或随安装可见保留，不能只依赖安装器不下载的额外附件。

## 验证

- Node 24：node --import tsx --test core.test.ts services.test.ts notebook.test.ts brief.test.ts formats.test.ts rag.test.ts：106 / 106 通过（本机模拟 HTTP 服务，不调用外部收费 API）。
- npm run build：TypeScript 与 esbuild 成功，main.js 约 323.2 KB。
- 未将历史界面验收视为本次完整发布验收。未改已安装插件、笔记、电子书、划线、问答、配置或索引。
- 后续仍需独立临时 vault 中覆盖原版 PDF、EPUB、划线持久化、模型选择与实际导出等完整关键路径；许可阻塞解决前不宣称已满足全部发布要求。
