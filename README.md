# 嘟嘟错题本

一个 iPhone 优先的本地网页应用，用来快速记录嘟嘟的语文、数学、英文错题和错字，并用可配置的 AI API 生成巩固练习。

## 公网使用

推荐部署到 GitHub Pages，并使用 GitHub 私有仓库做远程数据同步。详细步骤见 [REMOTE_SERVICE.md](./REMOTE_SERVICE.md)。

## 本地调试

在本目录启动服务：

```bash
node server.js
```

然后打开：

```text
http://localhost:5177
```

如果仍想在局域网内访问，iPhone 和 Mac 在同一个 Wi-Fi 时，也可以用 Mac 的局域网 IP 访问，例如：

```text
http://192.168.1.10:5177
```

在 iPhone Safari 打开后，点“分享”按钮，再选“添加到主屏幕”，以后就可以像普通应用一样打开。

## 主要功能

- 快速记录：学科、错误类型、原题/错字、正确答案、原因、标签、来源和照片。
- 拍照识别：iPhone 拍作业照片后，可用支持视觉输入的 AI 模型提取题目、错误答案、正确答案和错因。
- 错题库：搜索、按学科和类型筛选、编辑、删除。
- 复习：根据复习表现自动安排下一次复习日期。
- AI 分类：对当前记录补全错误类型、原因和标签。
- AI 出题：按学科、时间范围和练习形式生成巩固题、小测验、听写/默写清单等。
- 数据管理：JSON 导入/导出，Markdown 导出。

## AI API 配置

打开“设置”，填写：

- Base URL：例如 `https://api.openai.com/v1`
- API Key：你的服务商密钥
- 模型名：填写服务商支持的模型名

接口使用 OpenAI-compatible Chat Completions 格式：`/chat/completions`。

API Key 只保存在当前浏览器本地，不会写入项目文件。若在 iPhone 使用，需要在 iPhone 浏览器里单独配置一次。

## 数据位置

本地服务模式下，错题记录会同步保存到本目录的 `data/entries.json`，浏览器 `localStorage` 只作为临时缓存。

公网模式下，错题记录保存在你配置的 GitHub 数据仓库 `data/entries.json`。建议数据仓库设为私有，并每周导出一次 JSON 备份。

## iPhone Shortcuts 录入

捷径专用同步接口：

```text
POST http://192.168.31.10:5177/api/entries
```

详细搭建步骤见 [SHORTCUTS.md](./SHORTCUTS.md)。

如果要在任何网络下使用，请按 [REMOTE_SERVICE.md](./REMOTE_SERVICE.md) 把 Shortcut URL 改成 GitHub `repository_dispatch` API。
