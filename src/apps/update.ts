import { karin, restartDirect } from 'node-karin'
import { checkUpdate, performUpdate } from '@/core/update'
import { sleep } from '@/utils/common'

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
