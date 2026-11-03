# Banana Reader

**在 Obsidian 里边读、边记、边提问。**

Banana Reader 为 Markdown、PDF 和 EPUB 提供专注阅读界面。选中一段文字，可以划线、写批注或向模型提问；回答中的引用可以跳回原文，读完后还能把摘录和理解导出为 Markdown 笔记。

[English](README.md) · [社区安装](https://community.obsidian.md/plugins/gloss-reader) · [详细使用指南](docs/guide.zh-CN.md) · [反馈问题](https://github.com/TreyDong/banana-reader/issues)

## 功能

- **专注阅读**：打开 Markdown、EPUB 和 PDF，使用目录、阅读主题、字体和字号设置；PDF 可切换文字重排与原版页面。
- **划线与批注**：用不同样式和颜色标记文字、记录想法，并在阅读笔记本中回看。
- **围绕原文提问**：解释、翻译或提出自己的问题，从回答中的引用回到相应原文。
- **选择模型**：连接 OpenAI 兼容、Anthropic 或 Gemini API，也可使用本机已登录的 Codex、Claude、Pi CLI；可选的嵌入索引用于长文检索。
- **导出阅读笔记**：将摘录、批注和问答导出为新的 Markdown 文件，保留原文链接。
- **书架与找书**：浏览库里的书架，或使用自己的 Z-Library 账号，通过配置的镜像搜索和下载书籍。

## 安装

当前社区正式版**仅支持桌面端**，需要 **Obsidian 1.11.4 或更新版本**，界面支持简体中文和英文。

1. 在 Obsidian 中打开「设置 → 第三方插件 → 浏览」。
2. 搜索 **Banana Reader**，安装并启用。
3. 打开 Markdown、PDF 或 EPUB，点击侧边栏的「打开 Banana Reader」，或在命令面板运行「进入沉浸阅读」。

手动安装时，从 [最新 Release](https://github.com/TreyDong/banana-reader/releases/latest) 下载 `main.js`、`manifest.json`、`styles.css`，放入 `<笔记库>/.obsidian/plugins/gloss-reader/`，然后启用插件。更新时保留原有 `data.json` 和 `indices/`。如果曾安装单独的 `banana-reader` 插件 ID，请先阅读[数据衔接说明](docs/plugin-id-migration.md)。

## 开始使用

选中正文后即可划线、添加批注或提问；打开阅读笔记本可查看记录并导出 Markdown。

阅读、划线和导出不需要 AI 账号。使用 AI 功能时，在「设置 → Banana Reader → 模型服务」添加服务、获取或手动添加模型，再为相应任务选择模型。如果使用同一台电脑上的 LM Studio，先启动其本地服务，选择「OpenAI 兼容」，填写服务显示的基础地址（通常为 `http://localhost:1234/v1`）和模型 ID。

更多操作、模型配置及格式限制见[详细使用指南](docs/guide.zh-CN.md)。

## 数据与使用范围

- 批注、问答、草稿和进度保存在插件的 `data.json`，可选索引保存在 `indices/`；导出会新建 Markdown 文件。同步插件目录时，这些数据也可能被同步。
- API 密钥在可用时保存在 Obsidian SecretStorage；如果接口不可用，则只保留在当前会话内。AI 请求会把相关文本与问题发送给你选择的模型或嵌入服务。Google 翻译、可选联网搜索和 Z-Library 分别连接对应服务。
- PDF 选文需要文字层，不含 OCR；EPUB 需要支持的未加密文本内容。Z-Library 属于非官方接入，镜像和可用性可能变化，请仅获取你有权使用的内容。
- 手机适配仍在开发中。社区正式版仅桌面，本地手机候选包不代表真机验收完成。

## 开发

```sh
npm ci
npm run check
```

源码、构建和发布说明见[开发指南](docs/development.md)。

## 许可与致谢

项目代码使用 [MIT 许可](LICENSE)。字体与依赖的许可见[第三方声明](THIRD_PARTY_NOTICES.md)。早期交互参考包括 [Gloss](https://github.com/Nutlope/gloss) 和 [Qiaomu Reader](https://github.com/joeseesun/qiaomu-reader)。
