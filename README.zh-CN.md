# Banana Reader

**在 Obsidian 里边读、边记、边提问。**

Banana Reader 为 Markdown、PDF 和 EPUB 提供专注阅读界面。选中一段文字，可以划线、写批注或向模型提问；回答中的引用可以跳回原文，读完后还能把摘录和理解导出为 Markdown 笔记。

[English](README.md) · [社区安装](https://community.obsidian.md/plugins/gloss-reader) · [详细使用指南](docs/guide.zh-CN.md) · [反馈问题](https://github.com/TreyDong/banana-reader/issues)

**已上架 Obsidian 社区插件市场。** 在「设置 → 第三方插件 → 浏览」中搜索 **Banana Reader**，安装后点击 **启用**。

[安装与启用](#安装与启用) · [功能介绍](#功能介绍) · [开始阅读](#开始阅读) · [作者](#作者)

## 功能介绍

| 功能 | 可以做什么 |
| --- | --- |
| 沉浸阅读 | 打开 Markdown、EPUB 和 PDF，调整阅读主题、字体和字号，通过目录定位内容；EPUB 目录支持层级和估算页码，PDF 可切换文字重排与原版页面。 |
| 划线与批注 | 选中文字，用不同样式和颜色标记，写下自己的想法，再在阅读笔记本里回看。 |
| 主动记笔记 | 点击阅读工具栏或 AI 回答旁的「记笔记」，也可按 `Shift + N`；无需选中文字，笔记可在阅读笔记本中编辑和导出。 |
| AI 伴读 | 围绕选中的段落提问、解释或翻译，继续追问，并通过回答中的引用回到原文。 |
| 自选模型 | 连接 OpenAI 兼容、Anthropic 或 Gemini API，也可以使用本机已登录的 Codex、Claude、Pi CLI；可选嵌入索引帮助检索长文。 |
| 导出笔记 | 将摘录、批注和问答导出为新的 Markdown 笔记，保留原文链接。 |
| 书架与找书 | 浏览库里的书架；也可以使用自己的 Z-Library 账号，通过配置的镜像搜索、下载书籍。 |
| 书籍推荐 | 浏览 Hacker Books 推荐并筛选，打开书籍详情后可在 Z-Library 搜索对应书名。 |

阅读、划线、批注和导出不需要配置 AI；需要提问时再连接自己的模型服务。

## 安装与启用

当前社区正式版**仅支持桌面端**，需要 **Obsidian 1.11.4 或更新版本**，界面支持简体中文和英文。

### 从社区插件市场安装（推荐）

1. 打开 Obsidian，进入「设置 → 第三方插件」。如果是首次使用，按提示开启社区插件。
2. 点击「浏览」，搜索 **Banana Reader**，确认作者为 **Trey**。
3. 点击「安装」，安装完成后点击「启用」。如果已经安装，可在第三方插件列表中找到 Banana Reader 并打开开关。
4. 打开库中的 Markdown、PDF 或 EPUB 文件，点击左侧「打开 Banana Reader」，或在命令面板运行「Banana Reader: 进入沉浸阅读」。

也可打开 [Obsidian 官方插件页](https://community.obsidian.md/plugins/gloss-reader)，点击 **Add to Obsidian**，然后在 Obsidian 中安装并启用。更新时可进入「设置 → 第三方插件」检查更新。

### 手动安装

从 [最新 Release](https://github.com/TreyDong/banana-reader/releases/latest) 下载 `main.js`、`manifest.json`、`styles.css`，放入 `<笔记库>/.obsidian/plugins/gloss-reader/`，重新加载 Obsidian 后在「第三方插件」中启用 Banana Reader。更新时保留原有 `data.json` 和 `indices/`。如果曾安装单独的 `banana-reader` 插件 ID，请先阅读[数据衔接说明](docs/plugin-id-migration.md)。

## 开始阅读

1. **打开内容**：在笔记库中打开一篇 Markdown、PDF 或 EPUB，进入 Banana Reader；也可以从书架选择图书。
2. **边读边记**：选中正文划线或批注；也可以按 `Shift + N` 独立记录想法，再在阅读笔记本中回看。
3. **按需提问**：配置模型后，选中原文提问或翻译，通过回答中的引用回到原文。
4. **保存收获**：在阅读笔记本中导出 Markdown，得到包含摘录、批注和问答的新笔记。

阅读、划线和导出不需要 AI 账号。使用 AI 功能时，在「设置 → Banana Reader → 模型服务」添加服务、获取或手动添加模型，再为相应任务选择模型。如果使用同一台电脑上的 LM Studio，先启动其本地服务，选择「OpenAI 兼容」，填写服务显示的基础地址（通常为 `http://localhost:1234/v1`）和模型 ID。

更多操作、模型配置及格式限制见[详细使用指南](docs/guide.zh-CN.md)。

## 数据与使用范围

- 批注、问答、草稿和进度保存在插件的 `data.json`，可选索引保存在 `indices/`；导出会新建 Markdown 文件。同步插件目录时，这些数据也可能被同步。
- API 密钥在可用时保存在 Obsidian SecretStorage；如果接口不可用，则只保留在当前会话内。AI 请求会把相关文本与问题发送给你选择的模型或嵌入服务。Google 翻译、可选联网搜索和 Z-Library 分别连接对应服务。
- 打开书籍推荐时会连接 Hacker Books 获取书目、主题和封面；搜索与筛选在本地进行。
- PDF 选文需要文字层，不含 OCR；EPUB 需要支持的未加密文本内容。Z-Library 属于非官方接入，镜像和可用性可能变化，请仅获取你有权使用的内容。
- 手机适配仍在开发中。社区正式版仅桌面，本地手机候选包不代表真机验收完成。

## 开发

```sh
npm ci
npm run check
```

源码、构建和发布说明见[开发指南](docs/development.md)。

## 作者

Banana Reader 由 [Trey（TreyDong）](https://github.com/TreyDong)维护。这个项目围绕 Obsidian 中的阅读、思考和笔记展开，让摘录与自己的理解能够回到原文。

欢迎在 [GitHub Issues](https://github.com/TreyDong/banana-reader/issues) 分享使用体验、提出建议或反馈问题。

## 许可与致谢

项目代码使用 [MIT 许可](LICENSE)。字体与依赖的许可见[第三方声明](THIRD_PARTY_NOTICES.md)。早期交互参考包括 [Gloss](https://github.com/Nutlope/gloss) 和 [Qiaomu Reader](https://github.com/joeseesun/qiaomu-reader)。
