# 公网使用方案

目标：网页和 iPhone Shortcut 在任何网络下都能使用，不依赖 `192.168.*` 局域网地址。

## 推荐架构

- 网页：部署到 GitHub Pages。
- 数据：放在 GitHub 仓库的 `data/entries.json`。
- Shortcut 录入：调用 GitHub `repository_dispatch` API。
- 网页同步：在设置里配置 GitHub 数据仓库和 Token 后，直接读写 GitHub `data/entries.json`。

## 隐私建议

错题和作业照片属于家庭隐私。建议：

- App 代码仓库可以公开，用于 GitHub Pages。
- 错题数据仓库建议私有，例如 `dudu-errorbook-data`。
- 网页设置和 Shortcut 里都使用同一个私有数据仓库。

如果把数据仓库设为公开，任何知道仓库地址的人都能看到错题和照片。

## GitHub 数据仓库准备

建议新建一个私有仓库：

```text
dudu-errorbook-data
```

把本项目里的这些文件复制到数据仓库：

```text
.github/workflows/shortcut-entry.yml
scripts/append-entry.js
```

然后在数据仓库里创建空文件：

```text
data/entries.json
```

内容：

```json
[]
```

## 网页端配置

打开网页的「设置」->「GitHub 远程同步」，填写：

```text
Owner: Chanhao
Repo: dudu-errorbook-data
Branch: main
Data Path: data/entries.json
GitHub Token: 你的 token
```

保存后点击「测试同步」。

## GitHub Token 权限

建议创建 Fine-grained personal access token，只授权给数据仓库。

需要权限：

```text
Contents: Read and write
Actions: Read and write
Metadata: Read-only
```

Token 会保存在当前设备浏览器本地，以及 iPhone Shortcut 里。不要把 Token 写进代码仓库。

## Shortcut 远程录入接口

把原来的局域网 URL：

```text
http://192.168.31.10:5177/api/entries
```

改成 GitHub API：

```text
https://api.github.com/repos/Chanhao/dudu-errorbook-data/dispatches
```

方法：

```text
POST
```

Headers：

```text
Accept: application/vnd.github+json
Authorization: Bearer <你的 GitHub Token>
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json
```

请求 JSON：

```json
{
  "event_type": "dudu-add-entry",
  "client_payload": {
    "subject": "数学",
    "errorType": "计算错误",
    "wrongText": "36+17=43",
    "correctText": "36+17=53",
    "reason": "忘记进位",
    "source": "口算练习",
    "tags": "进位,口算",
    "createdBy": "shortcut"
  }
}
```

拍照录入时，把 `imageBase64`、`imageMimeType` 放进 `client_payload`：

```json
{
  "event_type": "dudu-add-entry",
  "client_payload": {
    "subject": "语文",
    "errorType": "图片记录",
    "wrongText": "作业照片",
    "source": "课堂练习",
    "tags": "拍照",
    "imageBase64": "<Base64 编码结果>",
    "imageMimeType": "image/jpeg",
    "createdBy": "shortcut"
  }
}
```

GitHub Action 写入数据后，网页端会在下一次同步时看到记录。通常会有几十秒延迟。
