# 仓库收敛到单一仓库（2026-11-07）

## 结论

插件对外的真身是公开仓库 **`TreyDong/banana-reader`**：社区目录条目 `gloss-reader` 指向 `treydong/banana-reader`，全部 release（最新 0.15.1）都在该仓库，`docs/development.md` 也早已把它定义为维护中的源码与发布仓库。

此前的 `TreyDong/obsidian-gloss-reader`（私有）只是开发镜像：无 release、无 tag，与公开仓库共享同一条提交历史，却长期领先若干提交，导致「哪个才是插件本体」难以判断。现已按维护者要求收敛为一个仓库。

## 处置

| 仓库 | 处置 | 依据 |
| --- | --- | --- |
| `TreyDong/banana-reader`（公开） | **保留为唯一仓库** | 社区目录与 release 指向它 |
| `TreyDong/obsidian-gloss-reader`（私有） | **归档** | 仅开发镜像；归档前确认其三个分支的提交（`0e1bc4f`、`9dd52e3`、`cc0fe4b`）在本地克隆中均可取得，无内容丢失 |
| `TreyDong/banana-reader-plugin`（公开） | 保持既有归档状态 | 旧插件 ID 的历史渠道，描述已指向 `TreyDong/banana-reader` |

- 镜像领先的 4 个提交（连接测试按钮 `adf1b5e`、选区与笔记面板修复 `cc0fe4b`、微信读书书架 `9dd52e3`、手机候选脚本与部署记录 `0e1bc4f`）已快进推送到公开仓库 `main`，公开仓库与开发状态一致。
- 本地仓库远端精简为单个 `origin` → `TreyDong/banana-reader`，`main` 跟踪 `origin/main`。仓库级配置由所有 worktree 共享，`.t3` 与 `.codex` 的 worktree 推送目标随之指向公开仓库。
- 未合并的历史分支（`backup/mobile-support-before-community-sync-20261029`、`codex/fix-answer-stop-release`、`codex/mobile-brat-candidate`、`t3/override-default-reader`）按既有约定保留在本地，未上传公开。
- 公开仓库 `main` 未做历史改写，只做快进；release 与 tag 未变动。

## 待决

微信读书书架等 11-06 的功能源码随本次同步进入公开仓库，发布与否仍由维护者决定；下次发版前需确认功能状态与 `manifest.json` 版本号。
