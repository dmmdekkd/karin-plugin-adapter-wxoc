import crypto from "node:crypto";

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
export { sleep as n, uuid as r, msgId as t };