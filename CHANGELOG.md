# Changelog

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
