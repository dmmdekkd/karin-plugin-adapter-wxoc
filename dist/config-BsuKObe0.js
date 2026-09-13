import { dir } from "./dir.js";
import path from "node:path";
import { copyConfigSync, requireFileSync } from "node-karin";
import crypto from "node:crypto";
import fs from "node:fs";

//#region src/utils/common.ts
/** 睡眠函数
* @param ms 毫秒
*/
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** 生成无连字符的随机UUID */
const uuid = () => crypto.randomUUID().replaceAll("-", "");
/** 生成消息ID */
const msgId = () => `${Date.now()}${Math.floor(Math.random() * 1e3)}`;

//#endregion
//#region src/utils/config.ts
const configFile = path.join(dir.ConfigDir, "config.json");
/** 初始化配置文件 */
copyConfigSync(dir.defConfigDir, dir.ConfigDir, [".json"]);
/** 读取配置 */
const config = () => {
	const cfg = requireFileSync(configFile);
	const def = requireFileSync(path.join(dir.defConfigDir, "config.json"));
	return {
		...def,
		...cfg
	};
};
/** 保存配置 */
const saveConfig = (cfg) => {
	fs.writeFileSync(configFile, JSON.stringify({
		...config(),
		...cfg
	}, null, 2));
};

//#endregion
export { uuid as a, sleep as i, saveConfig as n, msgId as r, config as t };