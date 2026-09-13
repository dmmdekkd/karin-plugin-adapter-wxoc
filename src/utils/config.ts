import fs from 'node:fs'
import path from 'node:path'
import { dir } from '@/dir'
import {
  copyConfigSync,
  requireFileSync,
} from 'node-karin'
import type { Config } from '@/types'

const configFile = path.join(dir.ConfigDir, 'config.json')

/** 初始化配置文件 */
copyConfigSync(dir.defConfigDir, dir.ConfigDir, ['.json'])

/** 读取配置 */
export const config = (): Config => {
  const cfg = requireFileSync(configFile)
  const def = requireFileSync(path.join(dir.defConfigDir, 'config.json'))
  return { ...def, ...cfg }
}

/** 保存配置 */
export const saveConfig = (cfg: Partial<Config>): void => {
  fs.writeFileSync(configFile, JSON.stringify({ ...config(), ...cfg }, null, 2))
}
