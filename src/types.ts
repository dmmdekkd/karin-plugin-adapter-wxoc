/**
 * 微信 ilink 协议类型定义
 */

/** 媒体加密信息 */
export interface IlinkMedia {
  /** 加密查询参数 */
  encrypt_query_param: string
  /** AES 密钥 (base64) */
  aes_key: string
  /** 加密类型 */
  encrypt_type: number
}

/** 文本条目 */
export interface TextItem {
  type: 1
  text_item: { text: string }
}

/** 图片条目 */
export interface ImageItem {
  type: 2
  image_item: { media: IlinkMedia; mid_size: number }
}

/** 语音条目 */
export interface VoiceItem {
  type: 3
  voice_item: { media?: IlinkMedia; text?: string }
}

/** 文件条目 */
export interface FileItem {
  type: 4
  file_item: { media: IlinkMedia; file_name: string; len: string }
}

/** 视频条目 */
export interface VideoItem {
  type: 5
  video_item: { media: IlinkMedia; video_size: number }
}

/** 消息条目 */
export type IlinkItem = TextItem | ImageItem | VoiceItem | FileItem | VideoItem

/** 局部引用元数据 */
export interface PartialText {
  start: string
  end: string
  startindex: number
  endindex: number
  quotemd5: string
}

/** 引用消息 */
export interface RefMessage {
  message_item?: Partial<IlinkItem>
  message_id?: string
  msg_id?: string
  /** 新版客户端仅携带的服务端消息ID 用于本地缓存还原引用 */
  svr_id?: string
  client_id?: string
  from_user_id?: string
  from_user_name?: string
  partial_text?: PartialText
}

/** 带引用的消息条目 */
export type ItemWithRef = Partial<IlinkItem> & { ref_msg?: RefMessage }

/** 接收到的消息 */
export interface IlinkMessage {
  from_user_id: string
  from_user_name?: string
  message_id?: string
  msg_id?: string
  client_id?: string
  context_token?: string
  item_list?: ItemWithRef[]
}

/** 二维码响应 */
export interface QRCodeResponse {
  qrcode: string
  qrcode_img_content: string
}

/** 二维码扫码状态 */
export interface QRCodeStatus {
  status: 'waiting' | 'confirmed' | 'expired'
  ilink_user_id?: string
  ilink_bot_id?: string
  bot_token?: string
  nickname?: string
  baseurl?: string
}

/** 消息更新响应 */
export interface UpdatesResponse {
  ret?: number
  msgs?: IlinkMessage[]
  get_updates_buf?: string
  /** 服务端建议的下轮长轮询超时 (ms) */
  longpolling_timeout_ms?: number
}

/** 正在输入状态 */
export interface TypingState {
  ticket: string
  contextToken: string
  expire: number
  timer: NodeJS.Timeout
  autoStop: NodeJS.Timeout
  owners: Set<string>
}

/** 下线回调 */
export type OfflineCallback = (botId: string, message: string) => Promise<void>

/** 微信个人号账号 */
export interface Account {
  /** 账号ID weixin_personal_XXX */
  botId: string
  /** 登录凭证 */
  token: string
  /** ilink 机器人ID */
  accountId: string
  /** ilink 用户ID */
  userId: string
  /** 昵称 */
  nickname: string
  /** 登录返回的 API 地址 优先于全局配置 */
  baseUrl?: string
  /** 是否已禁用 */
  isDisable?: boolean
}

/** 插件配置 */
export interface Config {
  /** ilink API 地址 */
  baseUrl: string
  /** CDN 地址 */
  cdnUrl: string
  /** 机器人类型 */
  botType: string
  /** API 超时 (ms) */
  apiTimeout: number
  /** 长轮询超时 (ms) */
  longPollTimeout: number
  /** 二维码轮询间隔 (ms) */
  qrPollInterval: number
  /** 出站媒体大小上限 (MB) */
  mediaMaxSizeMb: number
  /** 接收文件是否自动下载 */
  downloadFile: boolean
  /** 正在输入续期间隔 (ms) */
  typingKeepalive: number
  /** 正在输入 ticket 有效期 (ms) */
  typingTicketTtl: number
  /** 正在输入最长持续时间 (ms) */
  typingTtl: number
  /** 调试模式 */
  debug: boolean
  /** 自动更新开关 */
  autoUpdate: boolean
  /** 自动更新检查间隔 (ms) */
  updateCheckInterval: number
  /** Bot 头像地址 */
  botAvatar: string
  /** 用户头像地址 */
  userAvatar: string
  /** 已登录账号 */
  accounts: Account[]
}

/** API 客户端选项 */
export interface ClientOptions {
  cfg: Config
  token?: string
  /** 覆盖 API 地址 扫码登录成功时使用 */
  baseUrl?: string
}

/** API 请求选项 */
export interface RequestOptions {
  params?: Record<string, string>
  body?: object
  token?: boolean
  timeout?: number
  headers?: Record<string, string>
}

/** 媒体上传凭证响应 */
export interface UploadUrlResponse {
  upload_param?: string
  upload_full_url?: string
}

/** 媒体上传结果 */
export interface UploadResult {
  media: IlinkMedia
  fileSize: number
  rawSize: number
  fileName: string
}

/** 媒体格式信息 */
export interface FormatInfo {
  mime: string
  ext: string
  kind: 'image' | 'video' | 'audio' | 'file'
}

/** 媒体格式识别结果 */
export interface Detected {
  format: string
  mime: string
  ext: string
  kind: 'image' | 'video' | 'audio' | 'file'
}

/** 媒体解析选项 */
export interface ResolveOptions {
  /** 下载超时 (ms) */
  timeoutMs?: number
  /** 大小上限 (bytes) */
  maxBytes?: number
  /** 指定文件名 */
  fileName?: string
}

/** 媒体解析结果 */
export interface Resolved extends Detected {
  buffer: Buffer
  fileName: string
}
