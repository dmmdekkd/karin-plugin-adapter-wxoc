import { t as manager } from "../adapter-Zr1Opu1S.js";
import { karin } from "node-karin";

//#region src/apps/account.ts
/** #Claw登录 带序号时重登指定账号保留其数据 */
const login = karin.command(/^#?[cC][lL][aA][wW]登录(\s*\d+)?$/, async (e) => {
	await manager.login(e);
	return true;
}, {
	name: "Claw登录",
	permission: "master"
});
/** #Claw账号列表 */
const list = karin.command(/^#?[cC][lL][aA][wW](账号列表|列表|账号)$/, async (e) => {
	await e.reply(manager.listText());
	return true;
}, {
	name: "Claw账号列表",
	permission: "master"
});
/** #Claw删除[序号] */
const remove = karin.command(/^#?[cC][lL][aA][wW]删除(\d+)$/, async (e) => {
	const result = await manager.removeAccount(e.msg.replace(/^#?[cC][lL][aA][wW]删除/, ""));
	await e.reply(result);
	return true;
}, {
	name: "Claw删除账号",
	permission: "master"
});
/** #Claw禁用/启用[序号] */
const toggle = karin.command(/^#?[cC][lL][aA][wW](禁用|启用)(\d+)$/, async (e) => {
	const [, action, input] = e.msg.match(/^#?[cC][lL][aA][wW](禁用|启用)(\d+)$/) || [];
	const result = await manager.toggleAccount(input || "", action === "禁用");
	await e.reply(result);
	return true;
}, {
	name: "Claw禁用启用账号",
	permission: "master"
});

//#endregion
export { list, login, remove, toggle };