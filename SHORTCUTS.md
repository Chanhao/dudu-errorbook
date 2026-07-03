# 嘟嘟错题录入 Shortcut

这个 Shortcut 用来在 iPhone 上快速录入。

任何网络下使用时，请按 [REMOTE_SERVICE.md](./REMOTE_SERVICE.md) 使用 GitHub `repository_dispatch` API。

同一 Wi-Fi 的本地调试模式，可以自动同步到：

```text
http://192.168.31.10:5177/
```

同步 API：

```text
POST http://192.168.31.10:5177/api/entries
```

前提：Mac 正在运行：

```bash
cd /Users/yilepapa/Documents/Playground/dudu-errorbook
node server.js
```

iPhone 和 Mac 需要在同一个 Wi-Fi。

## 推荐 Shortcut 结构

在 iPhone「快捷指令」App 新建一个快捷指令，命名为：

```text
嘟嘟错题录入
```

### 1. 选择录入方式

添加动作：

```text
从菜单中选取
```

菜单项：

```text
拍照录入
手动录入
```

## 拍照录入分支

在「拍照录入」菜单下面添加这些动作：

1. `拍摄照片`
   - 显示相机预览：打开
   - 拍摄数量：1

2. `调整图像大小`
   - 宽度：1400
   - 高度留空

3. `Base64 编码`
   - 输入：调整大小后的图像

4. `询问输入`
   - 提示：`学科：语文/数学/英文/其他`
   - 默认答案：`语文`
   - 保存变量名：`学科`

5. `询问输入`
   - 提示：`错误类型`
   - 默认答案：`图片记录`
   - 保存变量名：`错误类型`

6. `询问输入`
   - 提示：`错题/错字/备注，可留空`
   - 保存变量名：`错误内容`

7. `询问输入`
   - 提示：`来源/单元，可留空`
   - 保存变量名：`来源`

8. `字典`
   - 添加以下键值：

```text
subject      = 学科
errorType    = 错误类型
wrongText    = 错误内容
source       = 来源
imageBase64  = Base64 编码结果
imageMimeType = image/jpeg
tags         = 拍照
createdBy    = shortcut
```

9. `获取 URL 内容`
   - URL：`http://192.168.31.10:5177/api/entries`
   - 方法：`POST`
   - 请求正文：`JSON`
   - JSON：选择上一步的字典

10. `显示结果`
   - 内容：`已同步到嘟嘟错题本`

## 手动录入分支

在「手动录入」菜单下面添加这些动作：

1. `询问输入`
   - 提示：`学科：语文/数学/英文/其他`
   - 默认答案：`语文`
   - 保存变量名：`学科`

2. `询问输入`
   - 提示：`错误类型`
   - 默认答案：`错字/别字`
   - 保存变量名：`错误类型`

3. `询问输入`
   - 提示：`错题、错字或原始答案`
   - 保存变量名：`错误内容`

4. `询问输入`
   - 提示：`正确答案，可留空`
   - 保存变量名：`正确答案`

5. `询问输入`
   - 提示：`原因/提醒，可留空`
   - 保存变量名：`原因`

6. `询问输入`
   - 提示：`来源/单元，可留空`
   - 保存变量名：`来源`

7. `询问输入`
   - 提示：`标签，用逗号分隔，可留空`
   - 保存变量名：`标签`

8. `字典`
   - 添加以下键值：

```text
subject     = 学科
errorType   = 错误类型
wrongText   = 错误内容
correctText = 正确答案
reason      = 原因
source      = 来源
tags        = 标签
createdBy   = shortcut
```

9. `获取 URL 内容`
   - URL：`http://192.168.31.10:5177/api/entries`
   - 方法：`POST`
   - 请求正文：`JSON`
   - JSON：选择上一步的字典

10. `显示结果`
   - 内容：`已同步到嘟嘟错题本`

## 可选优化

- 把 Shortcut 放到 iPhone 主屏幕，图标放在 Dock 或第一页。
- 如果主要用拍照，可以单独复制一个快捷指令，只保留「拍照录入」分支。
- 如果 Mac 的局域网 IP 变了，把 Shortcut 里的 URL 改成新的 `http://<Mac IP>:5177/api/entries`。

## 接口测试

Mac 上可以用这条命令验证同步：

```bash
curl -X POST http://localhost:5177/api/entries \
  -H 'Content-Type: application/json' \
  -d '{"subject":"数学","errorType":"计算错误","wrongText":"36+17=43","correctText":"36+17=53","reason":"忘记进位","source":"Shortcut 测试","tags":"进位,口算"}'
```
