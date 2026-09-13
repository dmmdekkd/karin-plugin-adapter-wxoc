import QRCode from 'qrcode'
import path from 'node:path'
import { segment, watch } from 'node-karin'
import type { Message } from 'node-karin'
import { WechatClient } from '@/adapter/client'
import { WechatAdapter } from '@/adapter/bot'
import { dir } from '@/dir'
import { history } from '@/core/history'
import { state } from '@/core/state'
import { sleep } from '@/utils/common'
import { config, saveConfig } from '@/utils/config'
import type { Account, Config, QRCodeResponse, QRCodeStatus } from '@/types'

/** 账号管理 */
export class Manager {
  /** 在线适配器 */
  bots = new Map<string, WechatAdapter>()

  /** 正在连接的账号 防止并发重复连接 */
  #connecting = new Set<string>()

  /** 热加载去抖定时器 */
  #reloadTimer?: NodeJS.Timeout

  constructor () {
    /** 监听配置文件 变更后热加载账号 */
    setTimeout(() => watch(path.join(dir.ConfigDir, 'config.json'), () => this.#reload()), 2000)
  }

  /** 配置变更后差异同步账号连接 */
  #reload (): void {
    clearTimeout(this.#reloadTimer)
    this.#reloadTimer = setTimeout(async () => {
      const tasks: Array<Promise<unknown>> = []

      /** 配置中已移除、禁用或凭证变更的账号 断开 */
      for (const [botId, adapter] of this.bots) {
        const account = config().accounts.find(a => a.botId === botId)
        if (!account || account.isDisable || account.token !== adapter.data.token || account.baseUrl !== adapter.data.baseUrl) {
          tasks.push(this.destroy(botId))
        }
      }

      /** 新增或重新启用的账号 连接 */
      for (const account of config().accounts) {
        if (!account.token || account.isDisable || this.bots.has(account.botId) || this.#connecting.has(account.botId)) continue
        tasks.push(this.connect(account))
      }

      if (!tasks.length) return
      await Promise.all(tasks)
    }, 1000)
  }

  /** 生成新的账号ID 9位数字 */
  #nextId (): string {
    const accounts = config().accounts
    while (true) {
      const id = String(Math.floor(Math.random() * 1e9)).padStart(9, '0')
      if (!accounts.some(a => a.botId === id) && !this.bots.has(id)) return id
    }
  }

  /** 按序号/ID/昵称查找账号 */
  findAccount (input: string): { account?: Account; accounts: Account[] } {
    const accounts = config().accounts
    const index = Number(input) - 1
    if (Number.isInteger(index) && index >= 0 && index < accounts.length) {
      return { account: accounts[index], accounts }
    }
    return {
      account: accounts.find(a => a.botId === input || a.userId === input || a.nickname === input),
      accounts,
    }
  }

  /** 启动时并行加载所有账号 */
  async load (): Promise<void> {
    const accounts = config().accounts.filter(a => a.token && !a.isDisable && !this.bots.has(a.botId))
    if (!accounts.length) return
    await Promise.all(accounts.map(account => this.connect(account)))
  }

  /** 连接账号 直接创建适配器 凭证失效由轮询循环下线处理兜底 */
  async connect (account: Account): Promise<{ success?: boolean; needLogin?: boolean; error?: string }> {
    if (!account.token) return { needLogin: true, error: '缺少登录凭证' }
    /** 已在连接中直接放行 避免登录流程与热加载并发重复连接 */
    if (this.#connecting.has(account.botId) || this.bots.has(account.botId)) return { success: true }

    this.#connecting.add(account.botId)
    try {
      await this.#create(account, config())
      return { success: true }
    } finally {
      this.#connecting.delete(account.botId)
    }
  }

  /** 创建并启动适配器 已存在则先停止旧的 */
  async #create (account: Account, cfg: Config): Promise<void> {
    await this.destroy(account.botId)
    const adapter = new WechatAdapter(cfg, account, (botId, message) => this.#onOffline(botId, message))
    this.bots.set(account.botId, adapter)
    await adapter.start()
  }

  /** 停止并移除适配器 */
  async destroy (botId: string): Promise<void> {
    const adapter = this.bots.get(botId)
    if (!adapter) return
    this.bots.delete(botId)
    await adapter.destroy()
  }

  /** 删除账号 停止适配器并清理状态 */
  async remove (account: Account): Promise<void> {
    await this.destroy(account.botId)
    await state.clear(account.botId)
    await history.clear(account.botId)
    saveConfig({ accounts: config().accounts.filter(a => a !== account) })
  }

  /** 账号下线处理 */
  async #onOffline (botId: string, message: string): Promise<void> {
    const adapter = this.bots.get(botId)
    if (adapter) await adapter.offlineNotice(message)

    const account = config().accounts.find(a => a.botId === botId)
    if (account) {
      account.token = ''
      account.isDisable = true
      saveConfig({ accounts: config().accounts })
    }

    await this.destroy(botId)
  }

  /** 扫码登录 消息带序号时重登指定账号 保留其 botId 与数据 */
  async login (e: Message): Promise<boolean> {
    let target: Account | undefined
    const seq = e.msg.match(/^#?[cC][lL][aA][wW]登录\s*(\d+)$/)?.[1]
    if (seq) {
      target = this.findAccount(seq).account
      if (!target) {
        await e.reply('未找到该账号，用 #Claw账号列表 查看序号')
        return false
      }
    }

    const client = new WechatClient({ cfg: config() })

    let qr: QRCodeResponse
    try {
      qr = await client.getQRCode()
    } catch (error) {
      await e.reply(`获取二维码失败: ${(error as Error).message}`)
      return false
    }
    if (!qr?.qrcode || !qr?.qrcode_img_content) {
      await e.reply('获取二维码失败')
      return false
    }

    await this.#showQR(e, qr)

    /** 登录等待时长 5 分钟 */
    const deadline = Date.now() + 5 * 60 * 1000
    while (Date.now() < deadline) {
      await sleep(config().qrPollInterval)

      let status: QRCodeStatus
      try {
        status = await client.pollQRStatus(qr.qrcode)
      } catch {
        continue
      }

      if (status.status === 'expired') {
        await e.reply('二维码已过期，请重新登录')
        return false
      }
      if (status.status !== 'confirmed') continue

      const { bot_token: token, ilink_user_id: userId, ilink_bot_id: accountId, nickname, baseurl } = status
      if (!token || !userId) continue

      const account = await this.#saveLogin({ ilink_user_id: userId, ilink_bot_id: accountId, bot_token: token, nickname, baseurl }, target)
      const result = await this.connect(account)
      if (!result.success) throw new Error(result.error)
      await e.reply(`微信Claw登录成功: ${account.nickname}`)
      return true
    }

    await e.reply('登录超时，请重新尝试')
    return false
  }

  /** 展示登录二维码 */
  async #showQR (e: Message, qr: QRCodeResponse): Promise<void> {
    const link = qr.qrcode_img_content!

    /** 终端适配器直接在终端打印二维码 */
    if (e.bot.adapter.protocol === 'console') {
      const terminal = await QRCode.toString(link, { type: 'terminal', small: true })
      process.stdout.write(`\n请使用微信扫码登录:\n${terminal}\n${link}\n`)
      return
    }

    try {
      const image = (await QRCode.toDataURL(link, { width: 300, margin: 2 })).replace(/^data:image\/png;base64,/, '')
      await e.reply([segment.text('请使用微信扫码登录'), segment.image(`base64://${image}`)])
    } catch {
      await e.reply(`请扫码登录 或访问链接: ${link}`)
    }
  }

  /** 保存扫码登录结果 target 为指定重登的既有账号 保留其 botId 与数据 */
  async #saveLogin (status: { ilink_user_id: string; ilink_bot_id?: string; bot_token: string; nickname?: string; baseurl?: string }, target?: Account): Promise<Account> {
    const accounts = config().accounts
    const account = target || accounts.find(a => a.userId === status.ilink_user_id)

    if (account) {
      account.token = status.bot_token
      account.userId = status.ilink_user_id
      account.accountId = status.ilink_bot_id || account.accountId
      if (status.baseurl) account.baseUrl = status.baseurl
      account.isDisable = false
      if (!account.botId) account.botId = this.#nextId()
      await this.destroy(account.botId)
    } else {
      accounts.push({
        botId: this.#nextId(),
        token: status.bot_token,
        accountId: status.ilink_bot_id || '',
        userId: status.ilink_user_id,
        nickname: status.nickname || `微信Claw${accounts.length + 1}`,
        baseUrl: status.baseurl,
      })
    }

    saveConfig({ accounts })
    return account || accounts[accounts.length - 1]
  }

  /** 账号列表文本 */
  listText (): string {
    const accounts = config().accounts
    if (!accounts.length) return '暂无账号，用 #Claw登录 添加'

    const list = accounts.map((account, index) => {
      const status = account.isDisable ? '已禁用' : this.bots.has(account.botId) ? '在线' : '离线'
      return `${index + 1}. ${account.nickname || account.botId} [${status}]\n   ${account.userId}`
    })

    return `微信Claw账号列表:\n${list.join('\n')}`
  }

  /** 删除账号 */
  async removeAccount (input: string): Promise<string> {
    const { account } = this.findAccount(input)
    if (!account) return '未找到账号，用 #Claw账号列表 查看'

    const name = account.nickname || account.botId
    await this.remove(account)
    return `已删除 ${name}，剩余 ${config().accounts.length} 个账号`
  }

  /** 禁用/启用账号 */
  async toggleAccount (input: string, disable: boolean): Promise<string> {
    const { account, accounts } = this.findAccount(input)
    if (!account) return '未找到账号，用 #Claw账号列表 查看'
    if (account.isDisable === disable) return `账号已是${disable ? '禁用' : '启用'}状态`

    if (disable) await this.destroy(account.botId)
    account.isDisable = disable
    saveConfig({ accounts })
    return `已${disable ? '禁用' : '启用'} ${account.nickname || account.botId}`
  }
}

export const manager = new Manager()
