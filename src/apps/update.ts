import { karin, restartDirect } from 'node-karin'
import { autoCheck, checkUpdate, performUpdate } from '@/core/update'
import { config } from '@/utils/config'
import { dir } from '@/dir'
import { sleep } from '@/utils/common'

/** 自动更新定时任务 按配置 cron 检查 Karin 启动时注册 */
export const task = karin.task('微信Claw自动更新', config().updateCron, autoCheck, { name: dir.name })

/** #Claw检查更新 */
export const check = karin.command(/^#?[cC][lL][aA][wW]检查更新$/, async (e) => {
  await e.reply(await checkUpdate())
  return true
}, { name: 'Claw检查更新', permission: 'master' })

/** #Claw更新 */
export const update = karin.command(/^#?[cC][lL][aA][wW]更新$/, async (e) => {
  await e.reply('正在更新，请稍候...')
  const result = await performUpdate()
  await e.reply(result.text)
  if (result.needRestart) {
    await sleep(2000)
    await restartDirect()
  }
  return true
}, { name: 'Claw更新', permission: 'master' })
