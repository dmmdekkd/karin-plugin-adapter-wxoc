import { components, defineConfig } from 'node-karin'
import { config, saveConfig } from '@/utils/config'
import { dir } from '@/dir'
import type { Config } from '@/types'

/** 数字类型的配置 key 及取值范围 [min, max] 保存时由 string 转回 number */
const NUMBER_KEYS = {
  apiTimeout: [1000, 60000],
  longPollTimeout: [10000, 120000],
  qrPollInterval: [500, 30000],
  mediaMaxSizeMb: [1, 1024],
  typingKeepalive: [1000, 30000],
  typingTicketTtl: [10000, 600000],
  typingTtl: [30000, 1800000],
  updateCheckInterval: [600000, 604800000],
} as const

/** WebUI 配置面板 */
export default defineConfig({
  /** 插件信息 */
  info: {
    id: 'karin-plugin-adapter-wxoc',
    name: 'karin-plugin-adapter-wxoc',
    author: {
      name: 'dmmdekkd',
      home: 'https://github.com/dmmdekkd/karin-plugin-adapter-wxoc',
    },
    icon: {
      name: 'forum',
      size: 24,
      color: '#F44336',
    },
    version: dir.version,
    description: 'Karin 微信个人号适配器 基于 ilink 协议',
  },

  /** 动态渲染的组件 */
  components: () => {
    const cfg = config()

    /** 数字输入框 带取值范围校验 */
    const numberInput = (key: keyof typeof NUMBER_KEYS, label: string) => {
      const [min, max] = NUMBER_KEYS[key]
      return components.input.number(key, {
        label,
        color: 'danger',
        defaultValue: String(cfg[key]),
        rules: [{ min, max, error: `数字应在 ${min}-${max} 之间` }],
      })
    }

    return [
      /** 账号管理 */
      components.accordionPro.create(
        'accounts',
        cfg.accounts.map(account => ({
          title: account.nickname || account.botId,
          subtitle: account.botId,
          botId: account.botId,
          token: account.token,
          accountId: account.accountId || '',
          userId: account.userId,
          nickname: account.nickname || '',
          baseUrl: account.baseUrl || '',
          isDisable: Boolean(account.isDisable),
        })),
        {
          label: '账号列表 可删除或新增',
          children: components.accordion.createItem('account', {
            title: '新账号',
            subtitle: '未命名账号',
            children: [
              components.input.string('botId', { label: '账号 ID', color: 'danger', isDisabled: true }),
              components.input.password('token', { label: '登录凭证', color: 'danger' }),
              components.input.string('accountId', { label: 'iLink Bot ID', color: 'danger' }),
              components.input.string('userId', { label: '用户 ID', color: 'danger' }),
              components.input.string('nickname', { label: '昵称', color: 'danger' }),
              components.input.url('baseUrl', { label: 'API 地址', color: 'danger' }),
              components.switch.create('isDisable', { label: '禁用', color: 'danger' }),
            ],
          }),
        }
      ),

      /** 其余配置统一折叠分组 */
      components.accordion.create('settings', {
        label: '基础配置',
        children: [
          components.accordion.createItem('server', {
            title: '服务端',
            subtitle: 'API 与 CDN 地址',
            children: [
              components.input.url('baseUrl', { label: 'API 地址', color: 'danger', defaultValue: cfg.baseUrl }),
              components.input.url('cdnUrl', { label: 'CDN 地址', color: 'danger', defaultValue: cfg.cdnUrl }),
              components.input.string('botType', { label: '机器人类型', color: 'danger', defaultValue: cfg.botType }),
            ],
          }),
          components.accordion.createItem('network', {
            title: '网络',
            subtitle: '超时与轮询',
            children: [
              numberInput('apiTimeout', 'API 超时 (ms)'),
              numberInput('longPollTimeout', '长轮询超时 (ms)'),
              numberInput('qrPollInterval', '二维码轮询间隔 (ms)'),
              numberInput('mediaMaxSizeMb', '出站媒体大小上限 (MB)'),
            ],
          }),
          components.accordion.createItem('switches', {
            title: '功能开关',
            subtitle: '行为开关与自动更新',
            children: [
              components.switch.create('downloadFile', { label: '接收文件自动下载', color: 'danger', defaultSelected: cfg.downloadFile }),
              components.switch.create('autoUpdate', { label: '自动更新', color: 'danger', defaultSelected: cfg.autoUpdate }),
              numberInput('updateCheckInterval', '自动更新检查间隔 (ms)'),
              components.switch.create('debug', { label: '调试模式', color: 'danger', defaultSelected: cfg.debug }),
            ],
          }),
          components.accordion.createItem('avatar', {
            title: '头像',
            subtitle: 'Bot 与用户头像',
            children: [
              components.input.url('botAvatar', { label: 'Bot 头像地址', color: 'danger', defaultValue: cfg.botAvatar }),
              components.input.url('userAvatar', { label: '用户头像地址', color: 'danger', defaultValue: cfg.userAvatar }),
            ],
          }),
          components.accordion.createItem('typing', {
            title: '正在输入',
            subtitle: '正在输入状态',
            children: [
              numberInput('typingKeepalive', '心跳保活间隔 (ms)'),
              numberInput('typingTicketTtl', 'Ticket 有效期 (ms)'),
              numberInput('typingTtl', '最长持续时间 (ms)'),
            ],
          }),
        ],
      }),
    ]
  },

  /** 前端点击保存后调用 手风琴返回按分组包裹的数组 数字类型的值是 string 需转回 number */
  save: (config: Record<string, unknown>) => {
    const { accounts, settings } = config

    /** 分组手风琴返回数组 每项为该组的字段集合 依次展开 */
    const payload: Record<string, unknown> = {}
    for (const group of Array.isArray(settings) ? settings : []) {
      if (group && typeof group === 'object') Object.assign(payload, group)
    }

    /** 数字类型由 string 转回 number */
    for (const key of Object.keys(NUMBER_KEYS)) {
      if (payload[key] !== undefined) payload[key] = Number(payload[key])
    }

    /** 账号列表 手风琴 Pro 返回数组 过滤掉缺失标识的项 */
    const list = Array.isArray(accounts) ? accounts : []
    const normalized = list.map(item => {
      const data = item as Record<string, unknown>
      return {
        botId: String(data.botId || ''),
        token: String(data.token || ''),
        accountId: String(data.accountId || ''),
        userId: String(data.userId || ''),
        nickname: String(data.nickname || ''),
        baseUrl: String(data.baseUrl || ''),
        isDisable: Boolean(data.isDisable),
      }
    }).filter(account => account.botId && account.token)

    saveConfig({ ...payload, accounts: normalized } as unknown as Partial<Config>)

    /** 自动更新定时任务为启动时注册 开关或间隔变更需重启生效 */
    const autoUpdateChanged = payload.autoUpdate !== undefined || payload.updateCheckInterval !== undefined
    const message = autoUpdateChanged ? '保存成功喵 ~ 自动更新配置将在重启 Karin 后生效' : '保存成功喵 ~'
    return { success: true, message }
  },
})
