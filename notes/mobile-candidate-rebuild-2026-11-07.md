# 手机候选 0.15.2-mobile.1（2026-11-07）

## 基线

- 本地 `main` 由 `92224a9` 快进到当时的开发镜像 `origin/main`（`obsidian-gloss-reader`）`3e4c3b6`，补齐此前未拉取的 6 个提交：连接测试按钮与地址规范化 `adf1b5e`、选区预览与笔记面板状态修复 `cc0fe4b`、微信读书书架浏览与本地交接 `9dd52e3`。无本地独有改动被覆盖。该镜像已于同日归档，仓库收敛为 `TreyDong/banana-reader`，详见 `notes/repository-consolidation-2026-11-07.md`。
- 正式版根 manifest 保持 `gloss-reader`、`0.15.1`、`isDesktopOnly: true`；`validate-metadata` 仍强制桌面元数据。
- `scripts/build-mobile-candidate.mjs` 更新：断言基线 `0.15.1`（原断言停在 `0.14.9`），候选版本改为 `0.15.2-mobile.1`（原常量 `0.15.0-mobile.9`）。

## 验证

- `npm run check` 通过：lint 0 警告，252 项测试全部通过（0.15.1 为 231 项，新增微信读书与 API 连接测试），TypeScript 与生产构建成功。
- 候选 `main.js` 与同一源码的主线构建逐字节一致；启动不导入 Node / Electron，由既有移动传输、生命周期、迁移与镜头测试及构建时的动态代码检查覆盖。
- 候选三件套 SHA-256：
  - `main.js` `72b6862a212a18baed1563cac4ef21b4381234bea75b29ad597ec93215b2a77c`
  - `manifest.json` `01c9acf82b77568f69147f5a0fd372d0e68ce2fbe5d2120616ae66660956d82f`（版本 `0.15.2-mobile.1`，`isDesktopOnly: false`）
  - `styles.css` `be57b90cc4c749d13b6913b9ab3edce9c18af980cc34a69ec9942a985c655fc6`

## 部署

- 个人库插件目录 `<vault>/.obsidian/plugins/gloss-reader/` 已替换为上述三件套并逐一核对哈希；`data.json` 与 `indices/` 未改动。
- 替换前部署的是微信读书试验分支构建（`t3/weread-integration-feasibility`，`main.js` `a1ab2072…`、`styles.css` `efa551be…`、`manifest.json` `615bf73b…`），已备份到外置硬盘归档（20261107）。
- Obsidian 桌面端需重载插件或重启后才加载新包；运行中的实例仍持旧内存。

## 剩余

- 真机验收要求不变，见 `docs/mobile-candidate.md`。本候选额外包含微信读书书架、连接测试按钮与选区/笔记面板修复，这些区域一并纳入设备检查；微信读书需使用自己的账号登录，安装包不包含账号数据。
- `publication/main`（`TreyDong/banana-reader`）仍落后 `origin/main` 4 个提交，微信读书、连接测试与选区修复尚未同步到公开仓库；发布前需先决定是否同步。
