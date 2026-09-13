# AdapterBase 接口实现状态

Karin `AdapterBase` 接口在本插件(微信个人号 基于 ilink 协议)中的实现情况。

未实现的方法**无需覆写**:适配器基类默认实现即为抛出 `[adapter][wechat-claw] 此接口未实现`。

## 基类提供

| 接口 | 说明 |
| --- | --- |
| `account` / `adapter` | 账号信息、适配器信息(构造函数中填充) |
| `selfId` / `selfName` | Bot ID / Bot 昵称 |
| `selfSubId(key)` / `logger(level, ...args)` | 子 ID、Bot 专属日志 |
| `raw` / `super` | 原生方法(未使用) |

## 消息收发

| 接口 | 状态 | 说明 |
| --- | --- | --- |
| `sendMsg` | ✅ | 仅好友私聊;依赖对方的 contextToken(需对方先发来一条消息);ret=-2 时清除过期 token |
| `sendForwardMsg` | ✅ | 降级:拆开逐条发送,返回最后一条 messageId |
| `sendLongMsg` | ✅ | 降级:基于已发送的合并转发内容重发 |
| `createResId` | ✅ | 降级:协议不支持仅上传,直接实际发送,forwardId 即消息 ID |
| `uploadFile` | ✅ | 降级:直接发送文件消息 |
| `downloadFile` | ✅ | 支持 url / base64,下载到插件 `data/downloads` 目录,返回 `filePath` |
| `recallMsg` | ⛔ | 协议不支持撤回消息,抛错 |

## 消息获取

收发的消息都会持久化到 Karin 的 kv 数据库(SQLite),按账号一个 key(`wxoc:history:{botId}`)、按会话分组、按 messageId 索引。每个会话保留最近 **200** 条,超出裁剪最旧;删除账号时一并删除。

| 接口 | 状态 | 说明 |
| --- | --- | --- |
| `getMsg` | ✅ | 先查内存缓存(10 分钟)再查 kv 历史存储;未提供 messageId 时返回该会话最新一条 |
| `getHistoryMsg` | ✅ | 从 kv 历史存储读取;`startMsgId` 为空取最新 `count` 条,否则取该消息及其之前的 `count` 条,按时间新→旧排序 |
| `getForwardMsg` | ✅ | 仅支持本账号发送过的合并转发(内存缓存) |

## 信息查询

| 接口 | 状态 | 说明 |
| --- | --- | --- |
| `getAvatarUrl` | ✅ | 配置的头像地址:Bot 用 `botAvatar`,其余用户用 `userAvatar` |
| `getStrangerInfo` | ✅ | 返回 ilink 用户 ID 与联系人缓存昵称 |
| `getFriendList` | ✅ | 基于已收发消息的联系人缓存(无好友列表 API,消息驱动) |

## 群聊(协议无群聊)

| 接口 | 状态 | 说明 |
| --- | --- | --- |
| `getGroupList` / `getGroupMemberList` | ➖ | 返回空列表 |
| `getGroupInfo` / `getGroupMemberInfo` / `getGroupAvatarUrl` | ⛔ | 抛错:微信个人号不支持群聊 |

## 扩展接口

| 接口 | 状态 | 说明 |
| --- | --- | --- |
| `sendTyping` | ✅ | 发送"正在输入"状态,心跳保活,Ticket 缓存,TTL 自动停止,返回 ownerId |
| `stopTyping` | ✅ | 停止"正在输入";传 ownerId 时仅移除对应触发源 |

## 未实现(基类默认抛错)

协议或平台不支持,调用时抛出 `[adapter][wechat-claw] 此接口未实现`:

- **群文件**:`createGroupFolder` `delGroupFolder` `renameGroupFolder` `delGroupFile` `uploadGroupFile` `getGroupFileList` `getGroupFileSystemInfo`
- **群管理**:`groupKickMember` `setGroupAdmin` `setGroupAllMute` `setGroupMute` `setGroupMemberCard` `setGroupMemberTitle` `setGroupName` `setGroupQuit` `setGroupRemark`
- **群特色**:`getGroupHighlights` `setGroupHighlights` `getGroupHonor` `getGroupMuteList` `getNotJoinedGroupInfo` `getAtAllCount`
- **QQ 专属**:`getCookies` `getCredentials` `getCSRFToken` `getRkey` `setAvatar`
- **互动**:`sendLike` `pokeUser` `setMsgReaction` `setFriendApplyResult` `setGroupApplyResult` `setInvitedJoinGroupResult`
- **AI 语音**:`getAiCharacters` `sendAiCharacter`
