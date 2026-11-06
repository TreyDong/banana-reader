# 微信读书书架接入调研（浏览 + Z-Library 转交）

调研日期：2026-11-05。结论基于当天可复核的公开实现与腾讯官方文档；上游接口可能随时调整。

## 结论

微信读书已有**官方 Agent API**（腾讯维护的 [Tencent/WeChatReading](https://github.com/Tencent/WeChatReading) skills 仓库，Apache-2.0）：统一入口 `POST https://i.weread.qq.com/api/agent/gateway`，`Authorization: Bearer wrk-xxx`，`api_name` 与业务参数平铺在 body 顶层，必须带 `skill_version`（官方文档当前 1.0.5）。本机实测：无 Key 请求网关返回 `401 {"errcode":-2013,"errmsg":"鉴权失败"}`，网络路径可达。

本版只做**书架浏览**（只读元数据，无正文接口），并在每本书上提供「打开本地 / Z-Library 找书 / 微信读书打开」三个动作。

## 参考仓库

| 仓库 | 许可证 | 用途 |
| --- | --- | --- |
| [Tencent/WeChatReading](https://github.com/Tencent/WeChatReading)（官方 skills 文档） | Apache-2.0 | 接口契约唯一来源：`skills/shelf.md`、`notes.md`、`profile.md`、`SKILL.md` |
| [zhaohongxuan/obsidian-weread-plugin](https://github.com/zhaohongxuan/obsidian-weread-plugin)（2.3.0） | MIT | `requestUrl` 直连网关在 Obsidian 内可行的实证；V2 优先、V1 Cookie 回退的架构参考 |
| [zhaohongxuan/dsh-weread](https://github.com/zhaohongxuan/dsh-weread)（0.2.0） | MIT | 解析层与错误分型参考（401/403 区分、`upgrade_info` 处理） |

代码均为自写，仅参考行为与字段；如后续移植上述仓库代码需在 `THIRD_PARTY_NOTICES.md` 登记。

## 本版使用的接口

| api_name | 用途 | 要点 |
| --- | --- | --- |
| `/_list` | Key 校验 | 轻量探针；401=Key 无效，403=出口 IP 风控（Key 可能有效） |
| `/shelf/sync` | 书架全量 | 一次返回 `books[]`（bookId/title/author/cover/category/readUpdateTime/finishReading/isTop/secret/readerLink/deepLink）、`albums[]`（有声书）、`archive[]`（书单）、`mp`（文章收藏入口）；无需翻页 |
| — | 封面 | 公开 CDN，不带凭据；`/s_` 替换 `/t7_` 取高清版 |

未用但已知的接口（后续版本候选）：`/user/notebooks`（有笔记的书）、`/book/bookmarklist`（划线）、`/review/list/mine`（想法，含 abstract/range）、`/book/bestbookmarks`（热门划线 TOP20）、`/readdata/detail`（阅读统计）、`/store/search`（书城搜索）。**没有正文/章节内容接口**，微信读书永远无法替代本地阅读。

## 已确认的行为与坑

1. **参数必须平铺**：`{"api_name":"/shelf/sync","skill_version":"1.0.5"}`；包进 `params` 后端收不到。时间戳为 Unix 秒。
2. **401 与 403 必须分开报**：401 是 Key 问题；403 是 Key 有效但出口 IP 被风控，提示换网络。合并会误导用户重配 Key。
3. **`upgrade_info`**：回包出现时必须停下并提示升级（版本过旧）。
4. **公众号文章/书签内容不在此通道**：书签只在计数中体现；公众号笔记需要 Cookie 通道（V1），本版不做。
5. **本地同名匹配**：`normalizeBookKey` 只做大小写/空白/标点归一并剥括号备注（「三体全集（全三册）」→「三体全集」），**精确相等**才算命中，不做子串猜测，避免误开别的书。
6. **Key 即长期凭据**：只存 Obsidian SecretStorage（`weread-apikey`），缺失该接口时退回会话内存；不写 `data.json`，不进日志。

## 实施记录（本版）

- `src/weread.ts`：网关客户端 + 书架解析 + 本地匹配，注入 fetcher 保持可测；错误类 `WereadAuthError` / `WereadBlockedError` / `WereadApiError`。
- 入口形态（应用户要求调整）：**不用弹窗、不用命令**。API Key 配置在「设置 → Banana Reader → 书籍来源 → 微信读书」（保存并校验 / 清除 / 状态提示），书架浏览内嵌在书架视图顶部「本地书架 / 微信读书」切换中，详情为视图内浮层。
- `src/main.ts`：`wereadRequest` 适配器（`requestUrl` + 超时 20s / 封面 60s）；Key 存取与客户端工厂；`loadWereadShelf`（5 分钟 TTL 内存缓存，换 Key 即失效，不写入 data.json）；`BookshelfView` 云端封面网格、筛选、详情浮层（打开本地 / Z-Library 找书 / 微信读书打开）；设置保存/清除 Key 时实时刷新已打开的书架视图。
- 测试 `tests/weread.test.ts` 8 项（书架解析、请求形状与凭据隔离、错误分型、封面、本地匹配、划线解析、想法解析与翻页、笔记双接口合并）；i18n 全量英文条目；样式 `gr-shelf-sources` / `gr-cloud-*` / `gr-notes-*` / `gr-weread-key-*`。
- 数据边界声明已同步 README.md / README.zh-CN.md / docs/guide.zh-CN.md。

## 测试库实机验证（2026-11-05）

单元测试覆盖不到布局，必须在 Obsidian 里跑。用 `~/Desktop/90_系统/临时/banana-reader-测试库` + 本地伪网关（`weread-mock-server.mjs`，把网关地址指到 `127.0.0.1`，只认 `wrk-test-valid`，另有 `wrk-test-blocked` 返 403）实测。

已验证：设置里配置/校验/清除 Key（状态依次「已配置 → 无效，请检查后重新获取。→ 有效 → 未配置」，清除后书架视图的「微信读书」页签立即隐藏并退回本地书架）；书架切换、封面懒加载、书名/作者筛选、无匹配提示、点卡片在视图内展开详情浮层（三体命中本地文件给「打开本地」，其余给「从 Z-Library 找书」，另有「在微信读书打开」）；键盘 Enter 可打开详情；错误分型 401→鉴权失败、403→风控提示；「查看笔记」按章节列出划线与想法（共 3 条划线 · 2 条想法，章节顺序正确，整本书评排在最后），「返回详情」可回退。

**发现并修掉一个真实布局 bug**：书架卡片原本是 `<button>`，在 CSS grid 里 Chromium 不按内容撑开按钮——按钮高度停在 30px，封面被挤到卡片上方压住筛选框和状态行，书名/作者行高度为 0。改成 `role="button"` 的 `<div>` 卡片（自带 Enter/Space 键盘处理）后恢复正常。中间试过「绝对定位覆盖按钮」，会被 Obsidian 的 `button:not(.clickable-icon)` 规则盖上不透明底色，遮住封面和「读完」角标，故放弃。

结论：书架这类视图改动，改完要在测试库跑一遍再收工，Node 测试看不出来。

## 单本笔记查看（已实现）

- 接口：`/book/bookmarklist`（参数 `bookId`，一次返回 `updated[]` 划线 + `chapters[]` 章节表）与 `/review/list/mine`（参数是**小写 `bookid`**，`count` + `synckey` 游标翻页，内容在 `reviews[].review` 内层）。两个必须都调，只取划线会丢想法。
- 章节归属：划线用 `chapters[].chapterUid → title/chapterIdx` 映射；想法响应里没有章节表，用同一份映射按 `chapterUid` 补，`chapterName` 优先（整本书评就靠它）。
- 展示：详情浮层内「查看笔记」原地切换为笔记视图，按 `chapterIdx` 分组（没有章节号的整本书评排最后），划线为引用块，想法渲染在对应原文下方；翻页上限 5 页 × 100 条，超出提示「笔记较多，仅显示部分内容。」
- 缓存：按 bookId 在内存缓存 5 分钟，换 Key 即清空，不落盘。
- 书签只在 `/user/notebooks` 的计数里存在，`/book/bookmarklist` 已过滤（type=0），无法取书签内容。

## 后续候选（按价值排序）

1. 笔记导出为 Markdown 落库（当前只查看，不写文件）。
2. 书架显示真实阅读进度（`/book/getprogress` 批量，注意并发与频控）。
3. 划线对照阅读（本地书 + 云端划线边栏）——匹配脆弱，需先验证。
4. 阅读统计/年度报告面板。
