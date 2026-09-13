import { dir } from "./dir.js";
import path from "node:path";
import { copyConfigSync, requireFileSync } from "node-karin";
import fs from "node:fs";

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
export { saveConfig as n, config as t };