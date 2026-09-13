import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  AdapterBase,
  contactFriend,
  createBotOfflineNotice,
  createFriendMessage,
  logger,
  registerBot,
  senderFriend,
  unregisterBot,
} from 'node-karin'
import type {
  Contact,
  DownloadFileOptions,
  DownloadFileResponse,
  Elements,
  GroupInfo,
  GroupMemberInfo,
  GroupSender,
  MessageResponse,
  NodeElement,
  SendElement,
  SendMsgResults,
  UserInfo,
} from 'node-karin'
import { isTokenInvalid, WechatClient } from '@/adapter/client'
import { nodeElements, parseItems, toBatches } from '@/adapter/convert'
import { history } from '@/core/history'
import { state } from '@/core/state'
import { sanitizeLog } from '@/core/media'
import { dir } from '@/dir'
import { msgId, sleep, uuid } from '@/utils/common'
import type { Account, Config, IlinkMessage, OfflineCallback, TypingState } from '@/types'

/** 微信个人号适配器 */
export class WechatAdapter extends AdapterBase {
  /** 停止标志 */
  stop = false
  /** 协议客户端 */
  client: WechatClient
  /** 账号配置 */
  data: Account

  #cfg: Config
  #offline: OfflineCallback
  /** 消息去重缓存 */
  #seen = new Map<string, number>()
  /** 消息缓存 供 getMsg 使用 */
  #cache = new Map<string, MessageResponse>()
  /** 正在输入状态 */
  #typing = new Map<string, TypingState>()

  constructor (cfg: Config, account: Account, offline: OfflineCallback) {
    super()
    this.#cfg = cfg
    this.#offline = offline
    this.data = account
    this.client = new WechatClient({ cfg, token: account.token })

    this.adapter.name = 'WeixinClaw'
    this.adapter.version = dir.version
    this.adapter.platform = 'wechat'
    this.adapter.standard = 'other'
    this.adapter.protocol = 'wechat-claw'
    this.adapter.communication = 'other'
    this.adapter.address = cfg.baseUrl

    this.account.selfId = account.botId
    this.account.uid = account.userId
    this.account.uin = account.botId
    this.account.name = account.nickname || account.botId
    this.account.avatar = cfg.botAvatar
    /** karin 预留的原生方法出口 指向适配器自身 供 e.bot.super 调用扩展方法 */
    this.super = this
  }

  /** 注册并启动消息轮询 */
  async start (): Promise<void> {
    this.adapter.index = registerBot('other', this)
    /** 通知服务端上线 不阻塞启动 */
    this.client.notify(true).catch(() => { })
    this.#poll()
  }

  /** 停止轮询并注销 */
  async destroy (): Promise<void> {
    this.stop = true
    /** 通知服务端下线 */
    await this.client.notify(false).catch(() => { })
    await sleep(1000)
    unregisterBot('index', this.adapter.index)
  }

  /** 下线通知 */
  async offlineNotice (message: string): Promise<void> {
    const contact = contactFriend(this.selfId)
    createBotOfflineNotice({
      bot: this,
      time: Date.now(),
      eventId: this.selfId,
      rawEvent: { message },
      contact,
      sender: senderFriend(this.selfId, this.account.name),
      content: { tag: '账号下线', message },
      srcReply: elements => this.sendMsg(contact, elements),
    })
  }

  /** 消息轮询 */
  async #poll (): Promise<void> {
    let errors = 0
    /** 下轮长轮询超时 优先使用服务端建议值 */
    let pollTimeout = this.#cfg.longPollTimeout

    while (!this.stop) {
      try {
        const syncBuf = await state.getSyncBuf(this.selfId)
        const result = await this.client.getUpdates(syncBuf, pollTimeout)
        pollTimeout = result.longpolling_timeout_ms || this.#cfg.longPollTimeout
        if (errors >= 3) logger.bot('info', this.selfId, `[微信个人号] 网络恢复 (共重试${errors}次)`)
        errors = 0

        /** 全部处理成功后才推进游标 避免处理失败丢消息 */
        for (const msg of result.msgs || []) {
          if (this.stop) return
          await this.#onMessage(msg)
        }
        if (!this.stop && result.get_updates_buf) {
          await state.setSyncBuf(this.selfId, result.get_updates_buf)
        }
      } catch (error) {
        if (this.stop) return

        const message = (error as Error).message || ''
        if (isTokenInvalid(error)) {
          await this.#offline(this.selfId, `登录凭证已失效: ${message}`)
          return
        }
        if (/timeout/i.test(message) || (error as Error).name === 'AbortError') continue

        errors++
        const ms = Math.min(errors * 5000, 300000)
        /** 前3次逐条报 之后每10次汇总一条 避免刷屏 */
        if (errors <= 3 || errors % 10 === 0) {
          logger.bot('warn', this.selfId, `[微信个人号] 轮询断开 (第${errors}次重连 休眠${ms / 1000}s): ${message}`)
        }
        await sleep(ms)
      }
    }
  }

  /** 处理收到的消息 */
  async #onMessage (msg: IlinkMessage): Promise<void> {
    const userId = msg.from_user_id
    if (!userId) return

    const messageId = msg.message_id || msg.msg_id || msgId()
    const dedupKey = `${this.selfId}:${messageId}:${msg.client_id || ''}`
    if (this.#seen.has(dedupKey)) return

    if (msg.context_token) await state.setContext(this.selfId, userId, msg.context_token)
    /** 记录联系人昵称 供好友列表使用 */
    if (msg.from_user_name) await state.setContact(this.selfId, userId, msg.from_user_name)

    /** 引用还原 仅携带 svr_id 时从本地缓存取 */
    const { elements } = await parseItems(
      this.#cfg,
      this.client,
      msg.item_list,
      (id: string) => this.#cache.get(id)?.elements || []
    )
    if (!elements.length) return

    const nickname = msg.from_user_name || this.account.name
    const contact = contactFriend(userId, nickname)
    const raw: MessageResponse = {
      time: Date.now(),
      messageId,
      messageSeq: Number(messageId) || 0,
      contact,
      sender: senderFriend(userId, nickname) as unknown as GroupSender,
      elements,
    }

    this.#cacheMessage(raw)
    createFriendMessage({
      bot: this,
      time: raw.time,
      contact,
      sender: senderFriend(userId, nickname),
      rawEvent: raw,
      messageId,
      messageSeq: raw.messageSeq,
      eventId: messageId,
      elements,
      srcReply: elements => this.sendMsg(contact, elements),
    })

    this.#seen.set(dedupKey, Date.now())
    while (this.#seen.size > 500) {
      this.#seen.delete(this.#seen.keys().next().value as string)
    }
  }

  /** 缓存消息 内存快路径 + 持久化到 Redis 供 getMsg / 引用消息 / 历史消息获取 */
  #cacheMessage (raw: MessageResponse): void {
    this.#cache.set(raw.messageId, raw)
    setTimeout(() => this.#cache.delete(raw.messageId), 10 * 60 * 1000)
    while (this.#cache.size > 100) {
      const first = this.#cache.keys().next().value as string
      this.#cache.delete(first)
    }
    history.save(this.selfId, raw).catch(error => {
      logger.bot('warn', this.selfId, `[微信个人号] 保存历史消息失败: ${(error as Error).message}`)
    })
  }

  /** 发送消息 */
  async sendMsg (contact: Contact, elements: Array<SendElement>, retryCount = 0): Promise<SendMsgResults> {
    if (contact.scene !== 'friend') throw new Error('微信个人号仅支持好友私聊')

    const peerId = contact.peer
    const contextToken = await state.getContext(this.selfId, peerId)
    if (!contextToken) {
      throw new Error('缺少上下文 contextToken 无法发送消息 请先让对方给你发一条消息')
    }

    const { batches, nodes } = await toBatches(this.client, peerId, elements)
    if (!batches.length && !nodes.length) throw new Error('消息为空或不支持的消息类型')

    this.stopTyping(peerId).catch(() => { })

    try {
      const results: Array<Record<string, any>> = []
      for (const batch of batches) {
        results.push(await this.client.sendMessage(peerId, batch, contextToken))
      }
      for (const node of nodes) {
        await this.sendForwardMsg(contact, [node])
      }

      const messageId = String(results[0]?.msg?.message_id || results[0]?.message_id || uuid().slice(0, 20))
      if (this.#cfg.debug) {
        logger.bot('debug', this.selfId, `[微信个人号] 发送消息: ${sanitizeLog(JSON.stringify(results))}`)
      }

      /** 发送的消息也存入历史 */
      this.#cacheMessage({
        time: Date.now(),
        messageId,
        messageSeq: Number(messageId) || 0,
        contact,
        sender: senderFriend(this.selfId, this.account.name) as unknown as GroupSender,
        elements: elements as Elements[],
      })

      return { messageId, time: Date.now(), rawData: results, message_id: messageId, messageTime: Date.now() }
    } catch (error) {
      if (retryCount > 0) return this.sendMsg(contact, elements, retryCount - 1)

      const message = (error as Error).message || ''
      if (message.includes('ret=-2')) {
        await state.clearContext(this.selfId, peerId)
        throw new Error('上下文 contextToken 已过期 请先让对方给你发一条消息')
      }
      throw error
    }
  }

  /** 发送合并转发消息 降级为逐条发送 */
  async sendForwardMsg (contact: Contact, elements: Array<NodeElement>): Promise<{ messageId: string; forwardId: string }> {
    const parts: Elements[] = []
    for (const node of elements) parts.push(...nodeElements(node))

    let messageId = ''
    for (const part of parts) {
      const result = await this.sendMsg(contact, [part])
      messageId = result.messageId
    }
    if (!messageId) throw new Error('合并转发消息为空')

    /** 缓存合成消息 供 getForwardMsg / sendLongMsg 使用 */
    this.#cache.set(messageId, {
      time: Date.now(),
      messageId,
      messageSeq: Number(messageId) || 0,
      contact,
      sender: senderFriend(this.selfId, this.account.name) as unknown as GroupSender,
      elements: parts,
    })
    return { messageId, forwardId: messageId }
  }

  /** 获取合并转发消息 仅支持本账号发送过的 */
  async getForwardMsg (resId: string): Promise<Array<MessageResponse>> {
    const raw = this.#cache.get(resId)
    return raw ? [raw] : []
  }

  /** 发送长消息 基于已发送的转发内容重发 */
  async sendLongMsg (contact: Contact, resId: string): Promise<SendMsgResults> {
    const [raw] = await this.getForwardMsg(resId)
    if (!raw) throw new Error('长消息内容不存在或已过期')
    return this.sendMsg(contact, raw.elements)
  }

  /** 构造资源ID 协议不支持仅上传 降级为实际发送合并转发 */
  async createResId (contact: Contact, elements: Array<NodeElement>): Promise<string> {
    const { forwardId } = await this.sendForwardMsg(contact, elements)
    return forwardId
  }

  /** 上传文件 降级为直接发送文件消息 */
  async uploadFile (contact: Contact, file: string, name: string): Promise<void> {
    const element: SendElement = { type: 'file', file: `file://${file}`, name }
    await this.sendMsg(contact, [element])
  }

  /** 下载文件到插件数据目录 支持 url 和 base64 */
  async downloadFile (options?: DownloadFileOptions): Promise<DownloadFileResponse> {
    const root = path.join(dir.karinPath, 'data', 'downloads')
    await mkdir(root, { recursive: true })

    if (options && 'base64' in options && options.base64) {
      const fileName = options.fileName || createHash('md5').update(options.base64).digest('hex')
      const filePath = path.join(root, fileName)
      await writeFile(filePath, Buffer.from(options.base64, 'base64'))
      return { filePath }
    }

    if (!options?.url) throw new Error('downloadFile 需要 url 或 base64')

    const response = await fetch(options.url)
    if (!response.ok) throw new Error(`下载文件失败: HTTP ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())

    const ext = path.extname(new URL(options.url).pathname) || '.bin'
    const fileName = options.fileName || `${createHash('md5').update(buffer).digest('hex')}${ext}`
    const filePath = path.join(root, fileName)
    await writeFile(filePath, buffer)
    return { filePath }
  }

  /** 微信个人号不支持撤回消息 */
  async recallMsg (): Promise<void> {
    throw new Error('微信个人号协议不支持撤回消息')
  }

  /** 获取消息 提供 messageId 时查缓存和历史文件未提供时返回该会话最新一条 */
  async getMsg (contact: Contact | string, messageId?: string): Promise<MessageResponse> {
    const id = typeof contact === 'string' ? contact : messageId || ''
    if (id) {
      return this.#cache.get(id) || (await history.get(this.selfId, id)) as MessageResponse
    }

    if (typeof contact === 'string') throw new Error('获取消息需要提供消息ID')
    const [raw] = await history.list(this.selfId, contact.peer, '', 1)
    if (!raw) throw new Error('未找到历史消息')
    return raw
  }

  /** 获取历史消息 从本地历史文件读取 startMsgId 为空取最新 count 条 */
  async getHistoryMsg (contact: Contact, startMsgId: string | number, count: number = 1): Promise<Array<MessageResponse>> {
    return history.list(this.selfId, contact.peer, startMsgId ? String(startMsgId) : '', Math.max(1, count || 1))
  }

  /** 获取头像url 支持配置头像 bot用botAvatar 其余用userAvatar */
  async getAvatarUrl (userId: string = this.selfId): Promise<string> {
    return userId === this.selfId ? this.#cfg.botAvatar : this.#cfg.userAvatar
  }

  /** 微信个人号不支持群聊 */
  async getGroupAvatarUrl (): Promise<string> {
    throw new Error('微信个人号不支持群聊')
  }

  /** 获取陌生人信息 */
  async getStrangerInfo (targetId: string): Promise<UserInfo> {
    const contact = await state.getContact(this.selfId, targetId)
    return { userId: targetId, uid: targetId, nick: contact?.name || '' }
  }

  /** 获取好友列表 基于已收发消息的联系人缓存 */
  async getFriendList (): Promise<Array<UserInfo>> {
    const contacts = await state.getContacts(this.selfId)
    return contacts.map(contact => ({ userId: contact.userId, uid: contact.userId, nick: contact.name }))
  }

  /** 微信个人号不支持群聊 返回空列表 */
  async getGroupList (): Promise<Array<GroupInfo>> {
    return []
  }

  /** 微信个人号不支持群聊 */
  async getGroupInfo (_groupId: string): Promise<GroupInfo> {
    throw new Error('微信个人号不支持群聊')
  }

  /** 微信个人号不支持群聊 返回空列表 */
  async getGroupMemberList (_groupId: string): Promise<Array<GroupMemberInfo>> {
    return []
  }

  /** 微信个人号不支持群聊 */
  async getGroupMemberInfo (_groupId: string, targetId: string): Promise<GroupMemberInfo> {
    throw new Error(`微信个人号不支持群聊 (${targetId})`)
  }

  /** 发送"正在输入"状态 返回ownerId 供 stopTyping 使用 */
  async sendTyping (peerId: string): Promise<string> {
    const ownerId = uuid().slice(0, 8)
    let typing = this.#typing.get(peerId)

    if (typing) {
      typing.owners.add(ownerId)
      return ownerId
    }

    typing = {
      ticket: '',
      contextToken: '',
      expire: 0,
      timer: null as unknown as NodeJS.Timeout,
      autoStop: null as unknown as NodeJS.Timeout,
      owners: new Set([ownerId]),
    }
    this.#typing.set(peerId, typing)

    const perform = async () => {
      try {
        const contextToken = await state.getContext(this.selfId, peerId)
        if (!contextToken) return

        if (!typing!.ticket || typing!.contextToken !== contextToken || Date.now() > typing!.expire) {
          const res = await this.client.getTypingTicket(peerId, contextToken)
          typing!.ticket = res.typing_ticket
          typing!.contextToken = contextToken
          typing!.expire = Date.now() + this.#cfg.typingTicketTtl
        }
        await this.client.sendTypingState(peerId, typing!.ticket)
      } catch (error) {
        logger.bot('error', this.selfId, `[微信个人号] 发送正在输入状态失败: ${(error as Error).message}`)
      }
    }

    await perform()
    typing.timer = setInterval(perform, this.#cfg.typingKeepalive)
    typing.autoStop = setTimeout(() => this.stopTyping(peerId), this.#cfg.typingTtl)

    return ownerId
  }

  /** 停止"正在输入"状态 传入ownerId时仅移除对应触发源 */
  async stopTyping (peerId: string, ownerId: string | null = null): Promise<void> {
    const typing = this.#typing.get(peerId)
    if (!typing) return

    if (ownerId) {
      typing.owners.delete(ownerId)
    } else {
      typing.owners.clear()
    }
    if (typing.owners.size > 0) return

    clearInterval(typing.timer)
    clearTimeout(typing.autoStop)
    this.#typing.delete(peerId)

    if (typing.ticket) {
      try {
        await this.client.sendTypingState(peerId, typing.ticket, true)
      } catch { /* 忽略停止失败 */ }
    }
  }
}
