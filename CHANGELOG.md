# Changelog

## [1.0.1](https://github.com/dmmdekkd/karin-plugin-adapter-wxoc/compare/karin-plugin-adapter-wxoc-v1.0.0...karin-plugin-adapter-wxoc-v1.0.1) (2026-09-13)


### 🔧 杂项

* 移除多余的release-as配置并更新机器人头像 ([9bfe7c1](https://github.com/dmmdekkd/karin-plugin-adapter-wxoc/commit/9bfe7c19d97e2cdcbb58b88b1bb3f9ae23604a90))

## [1.0.0](https://github.com/dmmdekkd/karin-plugin-adapter-wxoc/compare/karin-plugin-adapter-wxoc-v1.0.0...karin-plugin-adapter-wxoc-v1.0.0) (2026-09-13)


### ✨ 新功能

* 发布微信个人号适配器1.0.0正式版本 ([4cc5da3](https://github.com/dmmdekkd/karin-plugin-adapter-wxoc/commit/4cc5da32453d9f6b788083348651f0482573f605))


### 📝 文档

* add git commit message specification template ([7c3e722](https://github.com/dmmdekkd/karin-plugin-adapter-wxoc/commit/7c3e7223147698c54112f9974ab51fa0c4acbe68))


### 🔧 杂项

* **release:** 将版本升级至1.0.0并配置release-as ([866cd7d](https://github.com/dmmdekkd/karin-plugin-adapter-wxoc/commit/866cd7d95ae52dbbbc9d2d1672a6b19b9e7c1ae8))
* 修正release-please清单中的版本号 ([1697c4e](https://github.com/dmmdekkd/karin-plugin-adapter-wxoc/commit/1697c4e0ac8aafd7ed94260abfa6b3ff814ef13a))
* 更新pnpm工作空间配置，替换onlyBuiltDependencies为allowBuilds ([3b5cb3e](https://github.com/dmmdekkd/karin-plugin-adapter-wxoc/commit/3b5cb3eb7fcc27e227a11847ad8aea3b0398b7bc))

## 1.0.0

- 首个版本发布
- 扫码登录微信个人号，凭证自动保存，支持多账号并行加载
- 消息收发：文本、Markdown（以文本发送微信端渲染）、图片、语音、视频、文件、回复
- 合并转发消息降级为逐条发送，支持长消息与 `uploadFile`
- 「正在输入」状态发送与停止（`sendTyping` / `stopTyping`，经 `e.bot.super` 调用）
- 联系人缓存与历史消息持久化（每会话 200 条），支持 `getMsg` / `getHistoryMsg`
- 收到文件自动下载可配置，适配器 `downloadFile` 支持 url/base64
- Bot / 用户头像可配置（WebUI）
- WebUI 配置面板：账号增删改、服务端、网络、功能开关、头像、正在输入参数
- 数据存储：状态数据用 Karin 伪 Redis，历史消息用 Karin kv（SQLite），删除账号自动清理
