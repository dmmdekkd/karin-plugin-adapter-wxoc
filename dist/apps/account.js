import { t as manager } from "../adapter-21xtijwT.js";
import { karin } from "node-karin";

//#region src/apps/account.ts
/** #微信登录 或 #微信个人号登录 */
const login = karin.command(/^#?微信(个人号)?登录$/, async (e) => {
	await manager.login(e);
	return true;
}, {
	name: "微信个人号登录",
	permission: "master"
});
/** #微信账号列表 */
const list = karin.command(/^#?微信(个人号)?(账号列表|列表|账号)$/, async (e) => {
	await e.reply(manager.listText());
	return true;
}, {
	name: "微信个人号账号列表",
	permission: "master"
});
/** #微信删除[序号] */
const remove = karin.command(/^#?微信(个人号)?删除(\d+)$/, async (e) => {
	const result = await manager.removeAccount(e.msg.replace(/^#?微信(个人号)?删除/, ""));
	await e.reply(result);
	return true;
}, {
	name: "微信个人号删除账号",
	permission: "master"
});
/** #微信禁用/启用[序号] */
const toggle = karin.command(/^#?微信(个人号)?(禁用|启用)(\d+)$/, async (e) => {
	const [, , action, input] = e.msg.match(/^#?微信(个人号)?(禁用|启用)(\d+)$/) || [];
	const result = await manager.toggleAccount(input || "", action === "禁用");
	await e.reply(result);
	return true;
}, {
	name: "微信个人号禁用启用账号",
	permission: "master"
});

//#endregion
export { list, login, remove, toggle };