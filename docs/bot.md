# WechatAdapter 接口实现情况

本文档整理 `WechatAdapter`（微信个人号适配器）对照 node-karin `AdapterBase` 的接口实现情况。

状态说明：

- ✅ 已实现：完整可用
- ⛔ 不支持：协议无此能力，明确抛错或返回空
- ❌ 未实现：未覆写，走基类默认行为（返回 `undefined`）

## 消息收发

| 方法 | 状态 | 说明 |
| --- | --- | --- |
| `sendMsg` | ✅ | 仅支持好友私聊；文本合并为一批，图片/语音/视频/文件各自上传后独立成批；需对方先发过消息以取得 `contextToken` |
| `sendForwardMsg` | ✅ | 协议不支持合并转发，降级为逐条发送 |
| `getForwardMsg` | ✅ | 仅支持本账号发送过的转发缓存（10 分钟） |
| `sendLongMsg` | ✅ | 基于已发送的转发缓存重发 |
| `createResId` | ✅ | 协议不支持仅上传，降级为实际发送合并转发 |
| `recallMsg` | ⛔ | 协议不支持撤回消息，调用抛错 |
| `uploadFile` | ✅ | 降级为直接发送文件消息（走 CDN 加密上传链路） |

## 消息与历史获取

| 方法 | 状态 | 说明 |
| --- | --- | --- |
| `getMsg` | ✅ | 基于内存缓存，仅最近收到的消息（上限 100 条，10 分钟过期） |
| `getHistoryMsg` | ✅ | 仅支持最近缓存，无法拉取历史 |

## 信息查询

| 方法 | 状态 | 说明 |
| --- | --- | --- |
| `getStrangerInfo` | ✅ | 返回联系人缓存中的昵称，无缓存时 nick 为空 |
| `getFriendList` | ✅ | 基于消息驱动的联系人缓存（收到带昵称的消息时自动记录），返回 `userId`/`uid`/`nick` |
| `getAvatarUrl` | ✅ | 协议无头像接口，返回空串 |
| `getGroupAvatarUrl` | ✅ | 协议无头像接口，返回空串 |

## 群聊相关（协议不支持群聊）

| 方法 | 状态 | 说明 |
| --- | --- | --- |
| `getGroupList` | ✅ | 返回空列表 |
| `getGroupInfo` | ✅ | 抛错「不支持群聊」 |
| `getGroupMemberList` | ✅ | 返回空列表 |
| `getGroupMemberInfo` | ✅ | 抛错「不支持群聊」 |
| `getGroupHighlights` | ❌ | 未实现 |
| `setGroupHighlights` | ❌ | 未实现 |
| `groupKickMember` | ❌ | 未实现 |
| `setGroupMute` | ❌ | 未实现 |
| `setGroupAllMute` | ❌ | 未实现 |
| `setGroupAdmin` | ❌ | 未实现 |
| `setGroupMemberCard` | ❌ | 未实现 |
| `setGroupName` | ❌ | 未实现 |
| `setGroupQuit` | ❌ | 未实现 |
| `setGroupMemberTitle` | ❌ | 未实现 |
| `getGroupHonor` | ❌ | 未实现 |
| `setGroupRemark` | ❌ | 未实现 |
| `getNotJoinedGroupInfo` | ❌ | 未实现 |
| `getAtAllCount` | ❌ | 未实现 |
| `getGroupMuteList` | ❌ | 未实现 |
| `createGroupFolder` / `renameGroupFolder` / `delGroupFolder` | ❌ | 未实现 |
| `uploadGroupFile` / `delGroupFile` | ❌ | 未实现 |
| `getGroupFileSystemInfo` / `getGroupFileList` | ❌ | 未实现 |

## 请求与互动（协议无事件源或 QQ 专属）

| 方法 | 状态 | 说明 |
| --- | --- | --- |
| `setFriendApplyResult` | ❌ | 协议无好友申请事件 |
| `setGroupApplyResult` | ❌ | 未实现 |
| `setInvitedJoinGroupResult` | ❌ | 未实现 |
| `sendLike` | ❌ | 未实现 |
| `setMsgReaction` | ❌ | 未实现 |
| `pokeUser` | ❌ | 未实现 |
| `downloadFile` | ❌ | 未实现 |
| `getCookies` / `getCredentials` / `getCSRFToken` | ❌ | QQ 专属，未实现 |
| `setAvatar` | ❌ | 未实现 |
| `getRkey` | ❌ | QQ 专属，未实现 |
| `getAiCharacters` / `sendAiCharacter` | ❌ | 未实现 |

## 扩展能力（非基类强制）

| 方法 | 状态 | 说明 |
| --- | --- | --- |
| `sendTyping` | ✅ | 「正在输入」状态，`typingKeepalive` 心跳保活，支持多触发源 |
| `stopTyping` | ✅ | 停止「正在输入」，发消息后自动停止 |

## 生命周期（内部）

| 方法 | 状态 | 说明 |
| --- | --- | --- |
| `start` | ✅ | 注册 Bot 并启动长轮询 |
| `destroy` | ✅ | 停止轮询、通知服务端下线并注销 |
| `offlineNotice` | ✅ | 账号下线时发送内部通知事件 |
