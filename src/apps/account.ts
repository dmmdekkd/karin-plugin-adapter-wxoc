import { karin } from 'node-karin'
import { manager } from '@/adapter'

/** #微信登录 或 #微信个人号登录 带序号时重登指定账号保留其数据 */
export const login = karin.command(/^#?微信(个人号)?登录(\s*\d+)?$/, async (e) => {
  const input = (e.msg.match(/^#?微信(个人号)?登录(\s*\d+)?$/)?.[2] || '').trim()
  await manager.login(e, input || undefined)
  return true
}, { name: '微信个人号登录', permission: 'master' })

/** #微信账号列表 */
export const list = karin.command(/^#?微信(个人号)?(账号列表|列表|账号)$/, async (e) => {
  await e.reply(manager.listText())
  return true
}, { name: '微信个人号账号列表', permission: 'master' })

/** #微信删除[序号] */
export const remove = karin.command(/^#?微信(个人号)?删除(\d+)$/, async (e) => {
  const result = await manager.removeAccount(e.msg.replace(/^#?微信(个人号)?删除/, ''))
  await e.reply(result)
  return true
}, { name: '微信个人号删除账号', permission: 'master' })

/** #微信禁用/启用[序号] */
export const toggle = karin.command(/^#?微信(个人号)?(禁用|启用)(\d+)$/, async (e) => {
  const [, , action, input] = e.msg.match(/^#?微信(个人号)?(禁用|启用)(\d+)$/) || []
  const result = await manager.toggleAccount(input || '', action === '禁用')
  await e.reply(result)
  return true
}, { name: '微信个人号禁用启用账号', permission: 'master' })
