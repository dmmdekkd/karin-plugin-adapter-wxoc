import { dir } from "../dir.js";
import { n as sleep } from "../common-DjqiB3JB.js";
import { t as config } from "../config-FiIQcMOG.js";
import { checkPkgUpdate, karin, logger, restartDirect, updatePkg } from "node-karin";

//#region src/core/update.ts
/** 毫秒间隔转 cron 表达式（分 时 日 月 周） */
function toCron(ms) {
	if (ms < 36e5) return `*/${Math.max(1, Math.round(ms / 6e4))} * * * *`;
	const hours = ms / 36e5;
	if (hours <= 24) return `0 */${Math.max(1, Math.round(hours))} * * *`;
	return `0 0 */${Math.max(1, Math.round(hours / 24))} * *`;
}
/** 检查更新 返回结果文本 */
async function checkUpdate() {
	const result = await checkPkgUpdate(dir.name);
	if (result.status === "yes") {
		return `检查到新版本: ${result.local} → ${result.remote}\n发送 #微信更新 进行更新`;
	}
	if (result.status === "no") {
		return `当前已是最新版本: ${result.local}`;
	}
	return `检查更新失败: ${result.error.message}`;
}
/** 执行更新 返回结果文本与是否需要重启 */
async function performUpdate() {
	const result = await updatePkg(dir.name);
	if (result.status === "ok") {
		return {
			text: `更新成功: ${result.local} → ${result.remote}\n正在重启以应用新版本...`,
			needRestart: true
		};
	}
	return {
		text: `更新失败: ${result.data}`,
		needRestart: false
	};
}
/** 自动检查并静默更新 更新成功仅打印日志提示重启 不自动重启 */
async function autoCheck() {
	try {
		const result = await checkPkgUpdate(dir.name);
		if (result.status !== "yes") return;
		const updated = await updatePkg(dir.name);
		if (updated.status === "ok") {
			logger.info(`${logger.violet(`[插件:${updated.remote}]`)} ${logger.green(dir.name)} 自动更新完成 ${logger.green(`${updated.local} → ${updated.remote}`)} 重启 Karin 后生效`);
		} else {
			logger.warn(`[微信个人号] 自动更新失败: ${updated.data}`);
		}
	} catch (error) {
		logger.warn(`[微信个人号] 自动更新检查失败: ${error.message}`);
	}
}

//#endregion
//#region src/apps/update.ts
/** 自动更新定时任务 按配置间隔检查 Karin 启动时注册 */
const task = karin.task("微信个人号自动更新", toCron(config().updateCheckInterval), autoCheck, { name: dir.name });
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
export { check, task, update };