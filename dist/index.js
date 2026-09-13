import { dir } from "./dir.js";
import { t as manager } from "./adapter-CkuglFLk.js";
import { logger } from "node-karin";

//#region src/index.ts
logger.info(`${logger.violet(`[插件:${dir.version}]`)} ${logger.green(dir.name)} 初始化完成~ 耗时 ${logger.green(`${Math.round(process.uptime() * 1e3)}ms`)}`);
/** 加载账号 */
manager.load();

//#endregion
export {  };