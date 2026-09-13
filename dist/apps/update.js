import { n as sleep } from "../common-DjqiB3JB.js";
import { n as performUpdate, t as checkUpdate } from "../update-uQdzwqvT.js";
import { karin, restartDirect } from "node-karin";

//#region src/apps/update.ts
/** #微信检查更新 */
const check = karin.command(/^#?微信(个人号)?检查更新$/, async (e) => {
	await e.reply(await checkUpdate());
	return true;
}, {
	name: "微信个人号检查更新",
	permission: "master"
});
/** #微信更新 */
const update = karin.command(/^#?微信(个人号)?更新$/, async (e) => {
	await e.reply("正在更新，请稍候...");
	const result = await performUpdate();
	await e.reply(result.text);
	if (result.needRestart) {
		await sleep(2e3);
		await restartDirect();
	}
	return true;
}, {
	name: "微信个人号更新",
	permission: "master"
});

//#endregion
export { check, update };