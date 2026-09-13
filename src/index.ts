import { dir } from './dir'
import { logger } from 'node-karin'
import { manager } from './adapter'
import { restartAutoUpdate } from './core/update'

logger.info(`${logger.violet(`[插件:${dir.version}]`)} ${logger.green(dir.name)} 初始化完成~ 耗时 ${logger.green(`${Math.round(process.uptime() * 1000)}ms`)}`)

/** 加载账号 */
manager.load()

/** 启动自动更新检查 */
restartAutoUpdate()
