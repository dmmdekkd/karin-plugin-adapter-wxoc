import { karin, restartDirect } from 'node-karin'
import { autoCheck, checkUpdate, performUpdate, toCron } from '@/core/update'
import { config } from '@/utils/config'
import { dir } from '@/dir'
import { sleep } from '@/utils/common'

/** 自动更新定时任务 按配置间隔检查 Karin 启动时注册 */
export const task = karin.task('微信个人号自动更新', toCron(config().updateCheckInterval), autoCheck, { name: dir.name })

/** #微信检查更新 */
export const check = karin.command(/^#?微信(个人号)?检查更新$/, async (e) => {
  await e.reply(await checkUpdate())
  return true
}, { name: '微信个人号检查更新', permission: 'master' })

/** #微信更新 */
export const update = karin.command(/^#?微信(个人号)?更新$/, async (e) => {
  await e.reply('正在更新，请稍候...')
  const result = await performUpdate()
  await e.reply(result.text)
  if (result.needRestart) {
    await sleep(2000)
    await restartDirect()
  }
  return true
}, { name: '微信个人号更新', permission: 'master' })
