# karin-plugin-adapter-wxoc

Karin 微信Claw适配器，基于微信 ilink 协议。

## 功能

- 扫码登录，凭证自动保存，支持多账号
- 收发文本、图片、语音、视频、文件、回复
- 合并转发、长消息、正在输入状态

## 安装

在 Karin 根目录执行：

```bash
pnpm add karin-plugin-adapter-wxoc
```

重启 Karin 后自动加载。也可通过 WebUI 插件市场安装。

## 指令

| 指令 | 说明 |
| --- | --- |
| `#Claw登录` | 扫码登录 终端触发时直接在终端打印二维码 |
| `#Claw账号列表` | 查看账号状态 |
| `#Claw删除[序号]` | 删除账号 |
| `#Claw禁用/启用[序号]` | 禁用或启用账号 |
| `#Claw检查更新` | 检查插件是否有新版本（仅主人） |
| `#Claw更新` | 更新插件并自动重启（仅主人） |

## 配置

通过 WebUI「插件配置」页修改，配置文件位于 `@karinjs/karin-plugin-adapter-wxoc/config/config.json`：

```json
{
  "baseUrl": "https://ilinkai.weixin.qq.com",
  "cdnUrl": "https://novac2c.cdn.weixin.qq.com/c2c",
  "botType": "3",
  "apiTimeout": 15000,
  "longPollTimeout": 35000,
  "qrPollInterval": 2000,
  "mediaMaxSizeMb": 100,
  "downloadFile": true,
  "typingKeepalive": 5000,
  "typingTicketTtl": 60000,
  "typingTtl": 180000,
  "debug": false,
  "autoUpdate": true,
  "updateCheckInterval": 21600000,
  "botAvatar": "",
  "userAvatar": "",
  "accounts": []
}
```

## 数据存储

- **轮询游标 / 会话上下文 / 联系人缓存**：Karin 伪 Redis（`karin:wechat-oc:{botId}`）
- **历史消息**：Karin kv 数据库（SQLite，key `wxoc:history:{botId}`，每会话 200 条）
- 删除账号时自动清理对应数据

## 目录结构

```
src/
├── adapter/
│   ├── bot.ts       # 适配器 消息收发与轮询
│   ├── client.ts    # ilink 协议客户端
│   ├── convert.ts   # 消息双向转换
│   └── index.ts     # 账号管理 Manager
├── apps/
│   ├── account.ts   # 账号管理指令
│   └── update.ts    # 插件更新指令
├── core/
│   ├── aes.ts       # AES 加解密
│   ├── history.ts   # 历史消息存储（kv 数据库）
│   ├── media.ts     # 媒体格式与解析
│   ├── state.ts     # 轮询游标 / 会话上下文 / 联系人缓存
│   └── update.ts    # 插件更新与自动更新
├── utils/
│   ├── common.ts    # 通用工具
│   └── config.ts    # 配置读写
├── dir.ts           # 目录信息
├── index.ts         # 插件入口
├── types.ts         # 共享类型
└── web.config.ts    # WebUI 配置面板
```

## 接口实现情况

| 消息类型 | 支持状态 |
| --- | --- |
| 文本 / 图片 / 语音 / 视频 / 文件 / 回复 | ✅ 支持 |
| 正在输入 | ✅ 支持 |
| Markdown | ✅ 以文本消息发送 微信端渲染 |
| 合并转发 | ⚠️ 降级为逐条发送 |
| 长消息 | ⚠️ 降级为重发 |
| 消息撤回 | ⛔ 协议不支持 |

详细接口实现说明见 [docs/AdapterBase.md](docs/AdapterBase.md)。

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)。

## License

MIT
