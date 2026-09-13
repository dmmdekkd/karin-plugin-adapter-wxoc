import crypto from 'node:crypto'
import * as aes from '@/core/aes'
import { resolveMedia } from '@/core/media'
import { dir } from '@/dir'
import { uuid } from '@/utils/common'
import { http } from '@/utils/http'
import type {
  ClientOptions,
  Config,
  QRCodeResponse,
  QRCodeStatus,
  RequestOptions,
  SendMessageResponse,
  UpdatesResponse,
  UploadResult,
  UploadUrlResponse,
} from '@/types'

/** iLink API 错误 携带结构化响应信息 */
export class IlinkError extends Error {
  /** HTTP 状态码 */
  status?: number
  /** 应用层返回码 */
  ret?: number
  /** 应用层错误码 */
  errcode?: number

  constructor (message: string, status?: number, ret?: number, errcode?: number) {
    super(message)
    this.name = 'IlinkError'
    this.status = status
    this.ret = ret
    this.errcode = errcode
  }
}

/** 判断错误是否为登录凭证失效 基于结构化响应字段 */
export const isTokenInvalid = (error: unknown): boolean => {
  const e = error as IlinkError
  return e.status === 401 || e.status === 403 ||
    e.ret === 100 || e.errcode === -14
}

/** JSON 解析 将 uint64 标识字段加引号避免精度丢失 */
const parseJson = <T> (text: string): T => {
  let output = ''
  let index = 0
  while (index < text.length) {
    if (text[index] !== '"') {
      output += text[index++]
      continue
    }

    const stringStart = index
    index++
    let escaped = false
    while (index < text.length) {
      const char = text[index++]
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') break
    }
    const stringToken = text.slice(stringStart, index)
    output += stringToken

    let cursor = index
    while (/\s/.test(text[cursor] ?? '')) cursor++
    if (text[cursor] !== ':') continue
    let key: unknown
    try {
      key = JSON.parse(stringToken)
    } catch {
      continue
    }
    if (typeof key !== 'string' || (key !== 'message_id' && key !== 'msg_id' && key !== 'svr_id')) continue

    output += text.slice(index, cursor + 1)
    cursor++
    while (/\s/.test(text[cursor] ?? '')) output += text[cursor++]

    const numberStart = cursor
    if (text[cursor] === '-') cursor++
    while (/\d/.test(text[cursor] ?? '')) cursor++
    if (cursor > numberStart && !(cursor === numberStart + 1 && text[numberStart] === '-')) {
      output += `"${text.slice(numberStart, cursor)}"`
      index = cursor
    } else {
      index = numberStart
    }
  }
  return JSON.parse(output) as T
}

/** 解析媒体 AES 密钥 支持 hex 与 base64 */
export const decodeAesKey = (aesKey?: string): Buffer | null => {
  const trimmed = String(aesKey || '').trim()
  if (!trimmed) return null
  if (/^([0-9a-fA-F]{32}|[0-9a-fA-F]{48}|[0-9a-fA-F]{64})$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex')
  }
  try {
    const decoded = Buffer.from(trimmed, 'base64')
    const text = decoded.toString('utf8').trim()
    if (/^([0-9a-fA-F]{32}|[0-9a-fA-F]{48}|[0-9a-fA-F]{64})$/.test(text)) {
      return Buffer.from(text, 'hex')
    }
    if ([16, 24, 32].includes(decoded.length)) return decoded
  } catch { /* 忽略解码失败 */ }
  return null
}

/** 微信 ilink API 客户端 */
export class WechatClient {
  private readonly cfg: Config
  private readonly token: string
  private readonly baseUrl: string

  constructor (options: ClientOptions) {
    this.cfg = options.cfg
    this.token = options.token || ''
    this.baseUrl = options.baseUrl || options.cfg.baseUrl
  }

  private headers (auth: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      AuthorizationType: 'ilink_bot_token',
      'X-WECHAT-UIN': Buffer.from(String(Math.floor(Math.random() * 4294967296))).toString('base64'),
      'iLink-App-Id': 'bot',
      'iLink-App-ClientVersion': String(0x00010000), // 客户端版本 uint32 编码 0x00MMNNPP
    }
    if (auth && this.token) headers.Authorization = `Bearer ${this.token}`
    return headers
  }

  /** 公共请求元数据 */
  private baseInfo (): object {
    return {
      channel_version: dir.version,
      bot_agent: `${dir.name}/${dir.version}`,
    }
  }

  /** 发送 API 请求 处理 iLink 应用层错误 */
  private async request<T> (method: string, endpoint: string, options: RequestOptions = {}): Promise<T> {
    const response = await http({
      url: `${this.baseUrl}/${endpoint.replace(/^\//, '')}`,
      method,
      params: options.params,
      headers: { ...this.headers(options.token ?? false), ...options.headers },
      data: options.body ? JSON.stringify(options.body) : undefined,
      timeout: options.timeout ?? this.cfg.apiTimeout,
      transformResponse: [(data: string) => data],
    }, 'iLink API 请求失败')

    const text = String(response.data)
    const json = text ? parseJson<Record<string, unknown>>(text) : {}
    const base = (json.base_info || json.base_response || {}) as { ret?: number, errcode?: number, errmsg?: string }
    const ret = Number(json.ret ?? base.ret ?? 0)
    const errcode = Number(json.errcode ?? base.errcode ?? 0)
    if (ret !== 0 || errcode !== 0) {
      throw new IlinkError(`iLink API 错误: ret=${ret}, errcode=${errcode}, errmsg=${json.errmsg || base.errmsg || 'none'}`, response.status, ret, errcode)
    }

    return json as T
  }

  /** 获取登录二维码 */
  getQRCode (): Promise<QRCodeResponse> {
    return this.request('GET', 'ilink/bot/get_bot_qrcode', {
      params: { bot_type: this.cfg.botType },
      timeout: 15000,
    })
  }

  /** 轮询二维码扫码状态 */
  pollQRStatus (qrcode: string): Promise<QRCodeStatus> {
    return this.request('GET', 'ilink/bot/get_qrcode_status', {
      params: { qrcode },
      timeout: this.cfg.apiTimeout,
    })
  }

  /** 长轮询获取消息更新 timeout 可覆盖默认长轮询时长 */
  async getUpdates (syncBuf = '', timeout?: number): Promise<UpdatesResponse> {
    try {
      return await this.request('POST', 'ilink/bot/getupdates', {
        body: { base_info: this.baseInfo(), get_updates_buf: syncBuf },
        token: true,
        timeout: timeout ?? this.cfg.longPollTimeout,
      })
    } catch (error) {
      /** 长轮询超时属正常控制流 返回空响应供重试 */
      if (['ECONNABORTED', 'ETIMEDOUT'].includes((error as Error & { code?: string }).code || '')) {
        return { ret: 0, get_updates_buf: syncBuf }
      }
      throw error
    }
  }

  /** 通知服务端连接状态 */
  notify (start: boolean): Promise<unknown> {
    return this.request('POST', `ilink/bot/msg/notify${start ? 'start' : 'stop'}`, {
      body: { base_info: this.baseInfo() },
      token: true,
      timeout: 10000,
    })
  }

  /** 发送消息 */
  async sendMessage (toUserId: string, itemList: Array<object>, contextToken: string): Promise<SendMessageResponse> {
    const clientId = uuid()
    return this.request('POST', 'ilink/bot/sendmessage', {
      body: {
        base_info: this.baseInfo(),
        msg: {
          from_user_id: '',
          to_user_id: toUserId,
          client_id: clientId,
          message_type: 2,
          message_state: 2,
          context_token: contextToken,
          item_list: itemList,
        },
      },
      token: true,
    })
  }

  /** 获取媒体上传凭证 */
  private getUploadUrl (params: object): Promise<UploadUrlResponse> {
    return this.request('POST', 'ilink/bot/getuploadurl', { body: params, token: true })
  }

  /** 上传加密文件到 CDN 返回加密查询参数 */
  private async uploadToCdn (
    uploadParam: string | undefined,
    uploadFullUrl: string | undefined,
    fileKey: string,
    aesKeyHex: string,
    buffer: Buffer
  ): Promise<string> {
    if (!uploadFullUrl && !uploadParam) throw new Error('CDN 上传地址缺失')

    const url = uploadFullUrl ||
      `${this.cfg.cdnUrl}/upload?encrypted_query_param=${encodeURIComponent(uploadParam!)}&filekey=${encodeURIComponent(fileKey)}`

    const response = await http({
      url,
      method: 'post',
      data: new Uint8Array(aes.encrypt(buffer, Buffer.from(aesKeyHex, 'hex'))),
      headers: { 'Content-Type': 'application/octet-stream' },
      timeout: this.cfg.apiTimeout,
    }, 'CDN 上传失败')
    return String(response.headers?.['x-encrypted-param'] || '')
  }

  /** 从 CDN 下载并解密媒体文件 */
  async downloadMedia (encryptQueryParam: string, aesKey?: string): Promise<Buffer> {
    const response = await http({
      url: `${this.cfg.cdnUrl}/download?encrypted_query_param=${encodeURIComponent(encryptQueryParam)}`,
      method: 'get',
      timeout: this.cfg.apiTimeout,
      responseType: 'arraybuffer',
    }, 'CDN 下载失败')

    const encrypted = Buffer.from(response.data as ArrayBuffer)
    const key = decodeAesKey(aesKey)
    return key ? aes.decrypt(encrypted, key) : encrypted
  }

  /**
   * 上传媒体文件
   * @param file base64://、http(s)://、本地路径、Buffer
   * @param toUserId 目标用户
   * @param kind 媒体类型 image/video/file
   * @param fileName 指定文件名
   */
  async uploadMedia (
    file: string | Buffer,
    toUserId: string,
    kind: 'image' | 'video' | 'file',
    fileName = ''
  ): Promise<UploadResult> {
    const resolved = await resolveMedia(file, {
      timeoutMs: this.cfg.apiTimeout,
      maxBytes: Math.max(1, this.cfg.mediaMaxSizeMb) * 1024 * 1024,
      fileName,
    })

    const fileKey = uuid()
    const aesKeyHex = uuid()
    const rawSize = resolved.buffer.length
    const cipherSize = rawSize + (16 - (rawSize % 16) || 16)
    const mediaType = kind === 'image' ? 1 : kind === 'video' ? 2 : 3

    const uploadUrl = await this.getUploadUrl({
      filekey: fileKey,
      media_type: mediaType,
      to_user_id: toUserId,
      rawsize: rawSize,
      rawfilemd5: crypto.createHash('md5').update(resolved.buffer).digest('hex'),
      filesize: cipherSize,
      no_need_thumb: true,
      aeskey: aesKeyHex,
      base_info: this.baseInfo(),
    })

    const encryptQueryParam = await this.uploadToCdn(
      uploadUrl.upload_param,
      uploadUrl.upload_full_url,
      fileKey,
      aesKeyHex,
      resolved.buffer
    )

    return {
      media: {
        encrypt_query_param: encryptQueryParam,
        aes_key: Buffer.from(aesKeyHex).toString('base64'),
        encrypt_type: 1,
      },
      fileSize: cipherSize,
      rawSize,
      fileName: resolved.fileName,
    }
  }

  /** 获取"正在输入" ticket */
  getTypingTicket (userId: string, contextToken: string): Promise<{ typing_ticket: string }> {
    return this.request('POST', 'ilink/bot/getconfig', {
      body: { ilink_user_id: userId, context_token: contextToken, base_info: this.baseInfo() },
      token: true,
    })
  }

  /** 发送"正在输入"状态 */
  sendTypingState (userId: string, typingTicket: string, cancel = false): Promise<unknown> {
    return this.request('POST', 'ilink/bot/sendtyping', {
      body: {
        ilink_user_id: userId,
        typing_ticket: typingTicket,
        status: cancel ? 2 : 1,
        base_info: this.baseInfo(),
      },
      token: true,
    })
  }
}
