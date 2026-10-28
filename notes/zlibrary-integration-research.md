# Z-Library 获取流程调研（搜索 + 下载）

调研日期：2026-10-21。目的：为 Banana Reader 增加「从 Z-Library 搜索并下载书籍到库内再阅读」的流程做技术选型。结论仅基于下述公开仓库的当前实现，上游无官方稳定契约，字段与域名随时可能变化。

## 两条可行路线

| 路线 | 原理 | 优缺点 |
| --- | --- | --- |
| **EAPI（移动端 API）— 推荐** | 直连 Z-Library 安卓 App 使用的 `/eapi/*` JSON 接口 | 纯 JSON、无需 HTML 解析，Obsidian 插件用 `requestUrl` 即可实现；缺点是登录端点偶发拒绝、域名会轮换 |
| HTML 爬取 / Playwright | 模拟浏览器登录会话（`/s/` 搜索页、`/dl/` 下载页），或 Playwright 持久化会话（本机 `zlibrary-to-notebooklm` skill 即此路线） | 不受 EAPI 限制、有全文搜索，但重、慢、依赖浏览器自动化，Obsidian 插件内不现实 |

## EAPI 端点清单（经 heartleo/zlib 与 bipinkrish 两家实现交叉验证）

会话凭据为两个 Cookie：`remix_userid` + `remix_userkey`；请求也可用同名小写 HTTP 头 `remix-userid` / `remix-userkey` 传递。响应统一信封 `{"success":0|1,"error":"..."}`。

| 功能 | 方法与端点 | 关键参数 / 响应 |
| --- | --- | --- |
| 登录 | `POST /eapi/user/login` | form `email`、`password` → `user.id`、`user.remix_userkey` |
| 搜索 | `POST /eapi/book/search` | form `message`、`page`、`limit`（≤50）、可选 `e`（精确）、`yearFrom`、`yearTo`、`languages[]`、`extensions[]`、`order` → `books[]` + `pagination{current,total_pages}` |
| 图书详情 | `GET /eapi/book/{id}/{hash}` | 书目元数据；`books[]` 条目含 `id/hash/title/author/year/language/extension/filesize/cover/description` |
| 下载票据 | `GET /eapi/book/{id}/{hash}/file` | → `file.downloadLink`（CDN 直链）、`file.description/author/extension`（组文件名用） |
| 下载文件 | `GET downloadLink` | 文件名优先取 `Content-Disposition`；CDN 域名与镜像不同，**不带账号 Cookie** |
| 配额与账号 | `GET /eapi/user/profile` | 剩余每日下载次数 |
| 域名健康 | `GET /eapi/info/domains` | 域名探测/切换 |
| 格式/语言枚举 | `GET /eapi/info/extensions`、`/eapi/info/languages` | 筛选项 |
| EAPI 无全文搜索 | — | 网页版全文搜索无已验证的 EAPI 端点 |

## 已知坑（heartleo/zlib docs/eapi.md，2026-09 实测）

1. **登录端点可能拒绝合法账号**：`/eapi/user/login` 曾对真实账号返回 `400 {"success":0,"error":"Authorization failed"}`，而同一账号用网页 `/rpc.php` 下发的 Cookie 访问其余 eapi 端点全部正常。密码错误时返回的是 `Incorrect email or password`，可区分。缓解：设置里支持直接粘贴浏览器导出的 `remix_userid`/`remix_userkey`。
2. **DiamWall 反爬**：部分域名（实测 `z-lib.fm`、`z-lib.sk`、`1lib.sk`）对非浏览器请求返回挑战循环；实测 EAPI 可用的域名：`z-lib.gd`、`z-lib.gl`、`z-library.ec`、`article.sk`、`articles.sk`、`zlib.bz`。域名必须做成可配置项 + 启动探测，不能写死。
3. **每日下载配额**：免费账号有限额，下载前读 profile 提示余量，限额时报 `daily limit reached`。
4. **凭据安全**：`remix_userkey` 等同会话密钥；下载 CDN 链接是签名的、不需要也不应携带该 Cookie。

## 参考仓库

| 仓库 | 语言 | 许可证 | 活跃度 | 用途 |
| --- | --- | --- | --- | --- |
| [heartleo/zlib](https://github.com/heartleo/zlib)（1124★） | Go | MIT | 持续维护（2026-10 仍在推） | **首选移植参考**：`eapi.go`（登录/搜索）、`eapi_book.go`（详情/票据解析）、`download.go`（CDN 下载、重试、文件名清洗、凭据隔离）、`docs/eapi.md` |
| [bipinkrish/Zlibrary-API](https://github.com/bipinkrish/Zlibrary-API)（159★） | Python | MIT | 2024-10 | 单文件最简参考，端点全（含 registration、send-to-kindle、saved 等） |
| [sertraline/zlibrary](https://github.com/sertraline/zlibrary)（470★） | Python | **GPL-3.0** | 2025-04 | HTML 爬取路线参考；**只读思路，代码不可移植进 MIT 插件** |
| [baroxyton/zlibrary-eapi-documentation](https://github.com/baroxyton/zlibrary-eapi-documentation)（32★） | 文档 | 无 | 2023-10 | EAPI 原始端点文档（源自安卓 APK 逆向） |
| [zstmfhy/zlibrary-to-notebooklm](https://github.com/zstmfhy/zlibrary-to-notebooklm)（1749★，本机已装同名 skill） | Python | MIT | 2026-01 | Playwright 会话路线参考；`~/.zlibrary/storage_state.json` 可作 cookie 来源 |

## Banana Reader 集成建议（已于 0.14.0 实施，2026-10-22）

- **设置**（模型服务旁新增「书籍来源」）：镜像域名（可配置，默认 `https://z-lib.gd`，含探测）、账号凭据 `remix_userid`/`remix_userkey`（存 Obsidian SecretStorage，与现有 Agent 密钥同路径；也可支持邮箱密码登录但需提示可能被拒）。
- **流程**：入口放命令面板（如 `Banana Reader: 从 Z-Library 找书`）→ 搜索弹窗（关键词 + 语言/格式/年份/排序/分页，结果列表含封面标题作者格式大小）→ 选中 → 下载到用户配置的库内文件夹（默认 `收集箱/`）→ 下载完成提示打开，随后按既有 EPUB/PDF 阅读路径进入沉浸阅读。
- **实现要点**：`requestUrl` 带 `remix-userid`/`remix-userkey` 头 + `Accept: application/json`；下载 `downloadLink` 时不带凭据头；文件名从 Content-Disposition 取并清洗；会话失效（`Invalid credentials`/`Please login`）给出明确重登提示；下载前读 profile 显示余量。
- **数据边界声明需同步**：README「账号、网络与本地访问」需写明搜索词与下载请求发往用户配置的 Z-Library 镜像域名；`THIRD_PARTY_NOTICES.md` 若借用 heartleo/zlib 代码需登记 MIT 来源；内置版权提醒（仅限有合法访问权的资源，支持正版）。
- **存量技能复用**：本机 `~/.agents/skills/zlibrary-to-notebooklm` 的 Playwright 流程可作为插件外的人工兜底（会话文件 `~/.zlibrary/storage_state.json`），插件内不引入浏览器自动化。

## 实施记录（0.14.0）

- `src/zlibrary.ts`：EAPI 客户端（登录/搜索/详情票据/下载/配额），网络经注入的 fetcher（main.ts 用 `requestUrl` 适配），纯逻辑可测；`tests/zlibrary.test.ts` 12 项（含多镜像）。
- 多镜像（同日追加）：`ZLIB_MIRRORS` 默认 6 域名列表；`parseMirrorList`（支持裸域名/逗号分号分隔）、`probeMirror`（`GET /eapi/info/domains` 测活+延迟，8s 超时）、`withMirrorFailover`（仅镜像级故障切换：`ZlibMirrorError`/网络错误才换站，服务器应答的 `ZlibApiError`/`ZlibSessionError` 不换）；错误类拆分为 `ZlibApiError`（success:0 应答）与 `ZlibMirrorError`（无信封/被墙/网关）。设置页为镜像列表 textarea + 当前镜像 + 探测按钮；弹窗内 login/search/profile/ticket 均经 `via()` 走故障切换，成功的镜像自动存为当前域名。
- 设置页新增「书籍来源」标签：镜像域名（HTTPS 源站校验）、下载目录（默认 `收集箱/`）、登录状态与凭据清除；凭据存 SecretStorage（`zlib-remix`）。
- `ZLibraryModal`：登录（邮箱密码 / Cookie 粘贴）→ 搜索（格式/语言/排序筛选、分页、配额显示）→ 下载（票据 + CDN，重名加序号，隐私边界校验）→ 通知内「打开」进入沉浸阅读。
- 命令 `zlibrary-search`（`从 Z-Library 找书`）；133 项回归测试、lint、TypeScript、构建全部通过。

## 书架视图（0.14.0 同版追加）

- `src/bookshelf.ts`：书目整理（最近阅读在前、未读按名排序）、按容器宽度分行、书脊颜色/高度由书名稳定散列；`tests/bookshelf.test.ts` 5 项。
- `main.ts` 的 `BookshelfView`（视图 `gloss-bookshelf`）：木板 + 布面书脊（竖排书名、格式角标、进度红书签）、悬停抽出、入架 stagger 下落、悬停信息卡；侧栏图书馆图标与 `open-bookshelf` 命令入口。视觉概念参考 gloss 的书架交互（该仓库无许可证，样式与代码均为原创）。

### 书架重做（同日，用户反馈「太丑、按钮太多」）

- 对照 gloss 的 library.css 深读后定位丑的根源：布纹高光方向错误（应横向绕脊 90deg 而非纵向）、木板过薄过艳、书脊贴格式角标、全部等宽等高。
- 重做：横向布纹光影 + 细织纹叠加；每本书宽度 40–56px、高度 158–197px、装帧变体（plain/label 奶油纸标签/foil 烫金/bands 竹节）由书名散列；18px 厚木板带顶面高光与板上方墙面投影；板下居中安静的板架标签（最近阅读/藏书 + 数量）；悬停抽出 + 信息卡保留；入架 stagger 下落保留。
- 书架页移除全部按钮（头部只留书名与计数，空态只有文字）；入口仍为侧栏图标与 `open-bookshelf` 命令。
- `rowsByWidth` 按真实宽度贪心排架取代固定列数；`spineStyle` 增加 width/variant。测试 5 项更新。
- 注意：另一会话在并行开发移动端（mobile*.test.ts、plugin-migration 等），改动与之兼容，全套 180 项测试通过。

### 书架第三版（2026-10-23，用户给了 gloss 截图再纠偏）

用户指出两点：①不应该什么都放上架——书架只应收书，现已只收 PDF/EPUB，Markdown 笔记不再变成书脊；②文字溢出书脊。对照截图修正：书脊改为真实比例（宽 56–72、高 320–391px），色板加深加饱和（墨绿/紫/青/酒红…），木板改为细长浅木板并整幅通宽，头部改为大号衬线标题+安静统计行，板下标签左对齐，每行末书斜倚（≥3 本时），末板右端加平放书堆与盆栽 SVG（DOMParser 注入）。标题裁切双重收敛（wrap 与 title 双 overflow:hidden）。

### 翻开的书籍卡片（2026-10-23，用户点名 gloss 的打开动效）

点击书脊不再直接开书，而是弹出「翻开的书」卡片：左页环衬用本书布色的点纹 + 藏书票（藏书于/{vault 名}/No. 散列号），右页为格式角标、衬线大标题、大小/进度/最近阅读时间、开始（继续）阅读按钮与「放回去 · Esc」；封面硬壳用本书深布色，打开动效为 perspective rotateY(-24°→0) 带上升淡入，关闭反向。`formatBookSize`/`bookNumber` 纯函数 + 测试；Esc/点背景放回，视图关闭时清理。

### PDF 文字重排（2026-10-23，gloss 调研后立项）

- 路线：捆绑 pdf.js（pdfjs-dist@4.10.38，Apache-2.0，已登记 THIRD_PARTY_NOTICES）→ 抽取每页文字（坐标/字号/粗体）+ 书签大纲 → `src/pdfbook.ts` 纯启发式（行分组→页眉页脚/页码剔除→段落合并（跨页开放式续接、缩进/行距/句界判据）→ 字号分层标题 → 大纲匹配切章）→ 复用现有 EPUB 重排管线；段落携带 `page` 字段，划线/引用仍回跳原版页。
- 构建：双入口（`main.js` + 懒加载 `pdf-engine.js` 2.7MB，仅打开 PDF 重排时 `require(manifest.dir+'/pdf-engine.js')`；缺失/移动端静默回落原版）。pdf.js 走 main-thread fake worker（`globalThis.pdfjsWorker`），无 worker/CSP 问题，仅文本抽取不渲染。
- 视图：重排默认，工具栏「原版页面/文字重排」按钮互切（`pdfModeOverride`，换文档或退出阅读时复位）；扫描版（文字 <20 字符页超 25%）自动回落原版并提示；RAG/要旨/划线全部复用。
- 已知边界：双栏/复杂版式启发式会乱（切回原版）；扫描版需 OCR（未做）；部分 CJK PDF 缺 ToUnicode 时无 cmap 兜底可能乱码（回落原版）。
- 教训：启发式测试夹具的 y 坐标必须符合 PDF 坐标系（页眉 y 大）；「跨页重复文本=家具」判据会正确剔除两页相同的百万字正文——夹具要逐页独特。
