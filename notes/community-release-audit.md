# Banana Reader 0.12.3 发布与来源核实 — 2026-10-19

状态：来源局部替换、完整回归和本机原生验收已完成，官方条目已公开并提供 Add to Obsidian。0.12.3 官方审核已完成，并已成为公开目录当前版本。

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
- 当前版本 0.12.3，ID gloss-reader，最低 Obsidian 1.11.4，桌面限定。原命令、视图、SecretStorage 和数据路径不改。
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
- 官方发布状态见下文记录；本次不声称覆盖 Windows/Linux、Obsidian 1.11.4 实机或所有外部模型账户。

## 官方流程

- https://docs.obsidian.md/plugins/releasing/submit-plugin
- https://docs.obsidian.md/community-directory/developer-policies
- https://docs.obsidian.md/community-directory/submission-requirements-for-plugins

当前流程为 Community directory，使用已认证并关联 GitHub 的账户；不提交旧 obsidian-releases PR。用户已确认开发者政策与维护承诺。

## 官方审核反馈与文档修订

首次提交 0.12.1 已被官方目录识别，条目 ID 为 gloss-reader。0.12.1 审核已完成，依赖、混淆和构建逐字节复现检查通过；README 检查提示缺少英文介绍及英文安装/使用章节。0.12.2 补齐英文快速上手并同步版本元数据，业务 TypeScript 和 CSS 不变。根据官方反馈流程以新版本复核，最终 0.12.3 结果见下文。

当前公开源码：https://github.com/TreyDong/banana-reader 。公开根提交 80b5ef76fee869c09ef6bd3bf4b1ffd1e8ba8c5f 没有父提交，仅含 29 个白名单文件。原私有远端继续保持 PRIVATE。本地 main 沿原私有历史保存开发记录；community-release 分支追踪 publication/main，公开推送只使用该干净分支，不将私有 main 推到公开远端。

0.12.2 已补充英文快速上手，但官方检查仍提示 README 缺少英文。0.12.3 将 README 首页改为完整英文指南，原中文说明原样保存在 README.zh-CN.md；仅文档和版本元数据变更。目录条目已公开，显示 Add to Obsidian，最终 0.12.3 官方审核已完成。

## 公开发行记录

- 官方条目：https://community.obsidian.md/plugins/gloss-reader ，已公开并显示 Add to Obsidian。
- 最终文档发行：https://github.com/TreyDong/banana-reader/releases/tag/0.12.3 ，三个附件均已从公开地址下载并与本地核对一致。
- 0.12.3 干净公开提交：1b85d85f0f00aad13b5ecfb97540c105b3e7966f；当前白名单 30 个文件，多出单独的中文 README。私有 main 历史未上传。
- 0.12.1 官方构建逐字节复现，依赖与混淆检查通过。0.12.2 安装/使用章节警告已消除，但仍被提示非英文，故 0.12.3 单独提供完整英文首页；两次修订运行代码和 CSS 均未改变。
- 官方行为提示包括本地 fs / child_process、文件路径枚举和剪贴板；用途已在 README 说明。样式检查的 !important / :has / 最低版本部分 CSS 支持提示，以及未提供 GitHub artifact attestation 的建议仍保留，不为了消除提示重写无关功能。

| 0.12.3 附件 | 字节数 | SHA-256 |
| --- | --- | --- |
| main.js | 345376 | `5e17c8fe00fac1ad451c0c6304f8718a073dbdb4985343b4641bce9a53f2607f` |
| manifest.json | 292 | `ea033eb8d8cb89d064c7051c5ad5df4488617a0fa3b0b618c10bc303a50ca668` |
| styles.css | 782865 | `f52ea2f95a3284419ac1fb3620564e856d636f492e7bdec5a112808da0262fea` |

## 最终目录验收

2026-10-19 21:36（Asia/Shanghai）现场确认：官方账户面板中 0.12.3 / 1b85d85 显示 Completed，Current release 为 0.12.3；公开页面显示 Current version 0.12.3 和 Add to Obsidian。README 英文/安装/使用提示均已消除；依赖与混淆检查通过，构建再次逐字节复现。评分卡为 Health Excellent / Review Caution，保留上述 CLI/文件访问及 CSS 提示、attestation 建议；没有将 Completed 描述为无任何提示或法律认证。

公开目录：https://community.obsidian.md/plugins/gloss-reader 。本次使用官方 Community directory 申请，不创建 obsidian-releases PR，不创建 Reader 发布工作流。原私有仓库保持私有，原个人库安装与数据未改。

## 0.12.4：官方建议与市场介绍修订

用户要求逐条处理官方建议，并学习高星、高下载量插件的介绍。现场核实 0.12.3 的建议：artifact attestation、fs、child_process、文件路径枚举、剪贴板、text-decoration / clip-path 兼容性、!important 和 :has。

处理：移除 59 处强制覆盖和 3 处 :has；模态框与选区由本地明确类名标记；沉浸模式有专属 banana-reader 样式范围，兼容根元素移到 body 的呈现方式。屏幕阅读器标签用传统裁切保持可访问性；直线/波浪线采用局部背景和边框，保留重叠标记与 PDF 页面功能；减少动态效果使用动画/过渡变量。字体 5 份二进制保持不变。

权限核实：getFiles 仅在用户打开文档选择器时用于列路径，已有格式/隐私过滤；剪贴板 3 处均仅 writeText，没有 readText；CLI 使用 spawn 的分离参数且未启用 shell，使用隔离临时目录；索引位于本插件目录。保留这些实际功能及诚实披露，不换名称隐藏扫描器提示。

README 改为用途、真实截图、主要功能、快速上手、数据与服务、限制的顺序。发行审计和技术过程留在本记录，不再占据安装页面主要内容。中文快速上手置于详细设置说明前。0.12.4 截图仅使用本次新建的合成阅读文章。

参考于 2026-10-19 现场从 GitHub 和官方 community-plugin-stats.json 获取：Dataview 9,400 stars / 5,164,689 downloads；Templater 5,357 / 5,954,659；Excalidraw 7,752 / 8,592,122；PDF++ 2,499 / 845,907。Stars 是 GitHub 星标，downloads 是官方文件中的累计下载字段，不等于活跃用户数或星级评分。

- https://github.com/blacksmithgu/obsidian-dataview
- https://github.com/SilentVoid13/Templater
- https://github.com/zsviczian/obsidian-excalidraw-plugin
- https://github.com/RyotaUshio/obsidian-pdf-plus
- https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugin-stats.json

为回应来源证明建议，准备仅手动触发、只接受 0.12.4 标签的单次 GitHub 官方构建证明。固定官方 actions 提交，仓库权限 contents: read，仅额外允许本次 id-token / attestations 写入；先重建并逐字节比较 Release 三文件才签发证明，不上传、替换发行附件。完成后移除流程文件，保留证明记录。实际运行、原生验收与目录结果待现场补记。

### 本次中断点

用户已明确要求稍后进行 Obsidian 界面检查。0.12.4 只作为本地候选保留；公开当前版本仍是 0.12.3，未运行来源证明流程、未发布新版本、未改个人库安装。官方市场短介绍与长说明已保存，表单要求英文；README 英文及中文快速上手已重写，预览图片等待原生验收后补齐。0.12.4 样式已在临时库确认基础沉浸布局恢复，PDF/选文/模态框及最终截图仍需补查。109 项回归通过，五份字体字节一致。项目路径已由另一项用户操作改为 banana-reader，保留其 npm 包名调整；原私有历史不推到公开仓库。
