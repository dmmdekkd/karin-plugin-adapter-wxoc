import { dir } from "./dir.js";
import { i as sleep, t as config } from "./config-BsuKObe0.js";
import { checkPkgUpdate, karin, logger, restartDirect, updatePkg } from "node-karin";
import { scheduleJob } from "node-schedule";

//#region src/core/update.ts
/** 检查更新 返回结果文本 */
async function checkUpdate() {
	const result = await checkPkgUpdate(dir.name);
	if (result.status === "yes") {
		return `检查到新版本: ${result.local} → ${result.remote}\n发送 #Claw更新 进行更新`;
	}
	if (result.status === "no") {
		return `当前已是最新版本: ${result.local}`;
	}
	return `检查更新失败: ${result.error.message}`;
}
/** 执行更新 返回结果文本与是否需要重启 */
async function performUpdate() {
	const check = await checkPkgUpdate(dir.name);
	if (check.status === "no") return {
		text: `已是最新版本: ${check.local}`,
		needRestart: false
	};
	if (check.status === "error") return {
		text: `更新失败: ${check.error.message}`,
		needRestart: false
	};
	const result = await updatePkg(dir.name);
	if (result.status === "ok") {
		return {
			text: `更新成功: ${result.local} → ${result.remote}`,
			needRestart: true
		};
	}
	return {
		text: `更新失败: ${result.data}`,
		needRestart: false
	};
}
/** 按当前配置重建自动更新调度 WebUI 保存后调用 立即生效 */
function restartAutoUpdate(task) {
	task.schedule?.cancel();
	task.schedule = undefined;
	const { autoUpdate, updateCron } = config();
	if (!autoUpdate) return;
	task.cron = updateCron;
	task.schedule = scheduleJob(updateCron, () => autoCheck());
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
			logger.warn(`[微信Claw] 自动更新失败: ${updated.data}`);
		}
	} catch (error) {
		logger.warn(`[微信Claw] 自动更新检查失败: ${error.message}`);
	}
}

//#endregion
//#region src/apps/update.ts
/** 自动更新定时任务 按配置 cron 检查 Karin 启动时注册 */
const task = karin.task("微信Claw自动更新", config().updateCron, autoCheck, { name: dir.name });
/** #Claw检查更新 */
const check = karin.command(/^#?[cC][lL][aA][wW]检查更新$/, async (e) => {
	await e.reply(await checkUpdate());
	return true;
}, {
	name: "Claw检查更新",
	permission: "master"
});
/** #Claw更新 */
const update = karin.command(/^#?[cC][lL][aA][wW]更新$/, async (e) => {
	await e.reply("正在更新，请稍候...");
	const result = await performUpdate();
	await e.reply(result.text);
	if (result.needRestart) {
		await sleep(2e3);
		await restartDirect();
	}
	return true;
}, {
	name: "Claw更新",
	permission: "master"
});

//#endregion
export { restartAutoUpdate as i, task as n, update as r, check as t };