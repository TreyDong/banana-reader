# Banana Reader 0.12.1 发布与来源核实 — 2026-10-19

状态：来源局部替换、完整回归和本机原生验收已完成，正在准备公开发行与官方提交；尚未以 GitHub Release 或测试通过冒充官方收录。

## 结论的边界

早期私有原型明确参考并适配过 Gloss，但“整个插件来自上游”“只要复刻就必须授权”不是本次核实结论。本次按具体代码、样式、素材和各自许可处理，保留独立功能与标准技术做法。相似度检测是定位工具，不是法律标准，也不能单凭没有长匹配证明独立创作。

已识别的局部实现已替换；没有为上游无许可代码补写 MIT，也没有联系原作者。项目 MIT 仅覆盖当前项目代码，字体与依赖仍受各自条款约束。是否符合目录政策由官方审核决定，不将自动检查或本记录表述为法律鉴定或原作者认可。

## 可复核的来源

- Gloss 快照：`54b13b8882d8a109132c5b2045acd6b45628563d`。从 GitHub 获取该快照的归档，与早期本地参考文件逐字节核对一致。该快照无分发许可；本次复核公开仓库 license 仍为 null。
- Qiaomu Reader 参考：`fa622994cc79f9772e0a4adc8b824917c54b938f`，参考仓库为 GPL-3.0，不将其组件纳入本次发行。
- 参考文件 SHA-256：
  - Gloss `components/reader/Margin.tsx`：`48953e373fd3812cac04bdaf92e3ca4e6fda4c519bb6e5fcb7d96e0d92546c75`
  - Gloss `app/globals.css`：`44676faee1fcbdca3eb9f80979962c0a1ac07b8dfbba181a22083ed7e4e1f89f`
  - Gloss `lib/anchor.ts`：`d3ee331d69ab795309f939da662288b4992c9602e7c514d3d44bf2fa6aec03b8`
  - Gloss `lib/prompts.ts`：`f3c7a0c28798750ca6e0dc1c30b572b3645a14e81d22777aa8393bd4717d9d06`
- 私有历史用于定位：最初版本已有宿主视图、文档存储、模型服务和锚点；后续适配提交明确引入阅读样式与 reading-ui.ts。私有提交历史不随公开发行上传。

## 核实方法与逐模块处理

检查全部 12 个运行模块，使用 TypeScript 解析树的叶子 token 进行比对，保留字符串内容、规范引号差异，连续 24 token 以上的匹配作为人工复核线索。比较 117 个 Gloss 代码文件、89 个 Qiaomu Reader 源码文件；不把第三方生成数据或依赖包当作作者代码。另对 CSS 声明组合、Tailwind 转写的界面块、内嵌素材及历史提交人工检查。

| 本地部分 | 具体发现 | 处理 |
| --- | --- | --- |
| reading-ui.ts / placeMarginItems | 与 Gloss Margin.tsx 有多段连续 26–62 token 一致，历史注明适配 | 独立改为累计占位坐标与约束包络布局，保留活动卡片、非重叠、单行间隔等行为 |
| formats.ts / bookPath | 与 Qiaomu epub-context.js 路径辅助函数有 28–32 token 的同序片段；不足以认定整个解析器同源 | 仅此辅助函数改用 Node posix.normalize，保留编码、外部地址和根目录逃逸防护 |
| styles.css / 阅读表面 | 主题变量、阴影、标记、浮层、首字、页边卡片等成组声明相同；部分 Notebook/Brief 样式转写自参考组件 | 局部重写这些呈现规则，保留 DOM 选择器、主题种类、操作入口与非相关设置/电子书样式；不通过仅改名隐藏相同源码 |
| styles.css / 纸张纹理 | feTurbulence SVG 与 Gloss 完全一致 | 删除该 SVG，改用独立 CSS 径向渐变纹理 |
| styles.css / 字体 | 5 份 WOFF2 字体有独立 OFL 许可 | 原字节保留，完整版权与 OFL 内嵌进发行 main.js |
| main.ts / 宿主与界面 | Gloss 长匹配仅为按位置与创建时间排序；Qiaomu 匹配为标准 GET/429/503 处理及输入法/Escape 防护 | 保留；不因通用排序、宿主 API 或 IME 处理而重写视图。main.ts 字节未改 |
| core.ts | 本地摘录、前后文与位置恢复、存储和导出；无达到检测阈值的上游匹配，结合最初实现历史检查 | 保留，数据模型不迁移 |
| agent.ts | CLI/API 协议、取消、用量和模型发现；Qiaomu 命中仅为 URL 协议/凭据校验 | 保留；通用安全校验不是引入整个上游模块的依据 |
| services.ts | 本地连接、用途分配、模型及嵌入模型迁移 | 保留，未发现对应源码复用证据 |
| pdf-ui.ts | Obsidian 原生页面、文字层、覆盖标记与真实页码 | 保留，不引入或修改 PDF.js |
| formats.ts / readEpub | 本地 fflate、XML/spine、资源过滤和容量限制；与 Qiaomu 使用的 Foliate/zip.js 方案不同 | 保留解析器，只替换上述路径函数 |
| rag.ts | 本地分块、向量缓存、检索与证据引用 | 保留，未发现对应源码复用证据 |
| prompts.ts、brief.ts | 中文指令、本地 JSON 校验与缓存；功能和输出字段与参考存在联系，未发现原英文提示词的直接搬用 | 保留，不把通用 JSON 结构或摘要功能视为整段源码复制 |
| notebook.ts | 本地记录过滤、排序、时间与指令标签 | 保留，未发现对应源码复用证据 |
| translation.ts | Google 翻译协议、分段、取消、错误校验；匹配仅为标准数组形状校验 | 保留，不移入 Qiaomu 翻译组件 |

替换后的第二次比对：Gloss 只余 main.ts 的通用排序；Qiaomu 只余主视图 GET/HTTP 状态、IME 防护、agent URL 校验及翻译数组校验。保留这些匹配的具体分类，不宣称“所有 token 完全不同”。

## 当前发行内容与授权

- 项目 LICENSE：MIT；fflate 0.8.3：MIT；Newsreader、Schibsted Grotesk：SIL OFL。
- 全部 5 份字体二进制与替换前一致。未分发 Gloss 纸张 SVG、React/Next.js/Clerk/Together 服务或 Qiaomu GPL 组件。
- build.mjs 将项目许可与完整 THIRD_PARTY_NOTICES.md 内嵌 main.js；标准 main.js、manifest.json、styles.css 即携带完整许可。
- 版本 0.12.1，ID gloss-reader，最低 Obsidian 1.11.4，桌面限定。原命令、视图、SecretStorage 和数据路径不改。
- 原私有远端与历史保持私有；公开发行只使用当前审核文件的干净根提交。排除 design-qa.md 等旧私人验收记录、data.json、indices、电子书、个人笔记、凭据、模型缓存、备份、node_modules 和编译产物。编译文件只作为 Release 附件。

## 验证

- 完整回归 109 / 109 通过：原有 106 项，加上页边布局稳定/非重叠/活动卡片边界及 EPUB 编码/目录逃逸测试。
- TypeScript 与 esbuild 构建通过；标准三文件包的插件导出可加载，未要求额外本地源码模块，许可已内嵌。
- npm 运行依赖审计：0 已知漏洞。不将此结论扩展为没有任何安全风险。
- 临时空库 / Obsidian 1.14.4 / macOS：使用合成文章、两页合成原版 PDF、两章合成 EPUB，不使用个人库数据或书籍。
- 已验证默认问答 GPT-6-Luna、文章解读 GPT-5.6-Luna、翻译 Google 三者在设置中独立。
- Markdown 真实选文问答已完成，实际 gpt-6-luna 返回关闭条件及 ¶2 引用，报告 19121 输入 / 23 输出 token；引用可回跳并显示页边连接。
- 波浪线标记已保存，笔记本显示 1 问答 / 1 标记；实际导出 Markdown 含回答、标记样式与两条回跳链接，原文章 SHA-256 保持一致。
- 已检查纸张/夜读主题、文字与输入区对比、窄窗笔记本及宽窗页边卡片。原生 QA 找到并修正了本次样式替换中导致 PDF 高度收缩的 align-content 属性；修正后第一、第二原版页面实际可见，连续滚动正常。
- PDF 第二页实际选文解释成功：gpt-6-luna，19097 输入 / 73 输出 token，回答保存真实 p.2；滚回第一页后从笔记本跳回第二页，原版蓝色证据框、原文定位、页边回答与连线均可见。
- EPUB 两章按 spine 顺序实际显示，脚本内容未进入正文；实际解读生成 2 部分、4 论点、2 提醒与段落地图，引用 ¶5 回到第二章。成功模型 gpt-6-luna，19464 输入 / 255 输出 token。
- GPT-5.6-Luna 和 gpt-6.1-sol 两个测试分配未完成 CLI 请求，界面真实显示失败；在临时库手动将总结改为已实测可用的 gpt-6-luna 后完成上述解读，不将缓存列表当作模型权限保证。这不改变用户个人库的模型配置，也不自动替用户回退模型。
- 完整重载后重新打开 Markdown，1 条真实问答与 1 处波浪线标记仍保留；PDF 与 EPUB 三个合成源文件 SHA-256 全部未改变。
- 临时测试窗口已关闭、显示比例已恢复，测试库已从 Obsidian 仓库列表移除；原个人库设置窗口保持原先状态，原插件安装及个人数据未改。
- 最终官方目录状态将在实际提交后补记；本次不声称覆盖 Windows/Linux、Obsidian 1.11.4 实机或所有外部模型账户。

## 官方流程

- https://docs.obsidian.md/plugins/releasing/submit-plugin
- https://docs.obsidian.md/community-directory/developer-policies
- https://docs.obsidian.md/community-directory/submission-requirements-for-plugins

当前流程为 Community directory，使用已认证并关联 GitHub 的账户；不提交旧 obsidian-releases PR。用户已确认开发者政策与维护承诺。

## 官方审核反馈与文档修订

首次提交 0.12.1 已被官方目录识别，条目 ID 为 gloss-reader。0.12.1 审核已完成，依赖、混淆和构建逐字节复现检查通过；README 检查提示缺少英文介绍及英文安装/使用章节。0.12.2 补齐英文快速上手并同步版本元数据，业务 TypeScript 和 CSS 不变。根据官方反馈流程发布新版本后复核，不将尚未结束的 Pending 状态写成审核通过。

当前公开源码：https://github.com/TreyDong/banana-reader 。公开根提交 80b5ef76fee869c09ef6bd3bf4b1ffd1e8ba8c5f 没有父提交，仅含 29 个白名单文件。原私有远端继续保持 PRIVATE。本地 main 沿原私有历史保存开发记录；community-release 分支追踪 publication/main，公开推送只使用该干净分支，不将私有 main 推到公开远端。

0.12.2 已补充英文快速上手，但官方检查仍提示 README 缺少英文。0.12.3 将 README 首页改为完整英文指南，原中文说明原样保存在 README.zh-CN.md；仅文档和版本元数据变更。目录条目已公开，显示 Add to Obsidian，最新版本审核仍需等待实际返回。
