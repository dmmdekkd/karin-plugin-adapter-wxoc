import { dir } from "./dir.js";
import { n as sleep, r as uuid, t as msgId } from "./common-DjqiB3JB.js";
import { n as saveConfig, t as config } from "./config-FiIQcMOG.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AdapterBase, contactFriend, createBotOfflineNotice, createFriendMessage, db, logger, redis, registerBot, segment, senderFriend, unregisterBot, watch } from "node-karin";
import QRCode from "qrcode";
import crypto, { createHash } from "node:crypto";
import fs, { mkdir, writeFile } from "node:fs/promises";

//#region src/core/aes.ts
/** 根据密钥长度获取算法 */
const algo = (key) => {
	if (key.length === 16) return "aes-128-ecb";
	if (key.length === 24) return "aes-192-ecb";
	if (key.length === 32) return "aes-256-ecb";
	throw new Error(`不支持的 AES 密钥长度: ${key.length}`);
};
/** PKCS7 填充 */
const pad = (data, size = 16) => {
	const len = size - data.length % size;
	return Buffer.concat([data, Buffer.alloc(len, len)]);
};
/** PKCS7 去填充 */
const unpad = (data, size = 16) => {
	const len = data[data.length - 1];
	if (!len || len < 1 || len > size) return data;
	return data.subarray(0, data.length - len);
};
/** AES-ECB 加密 */
const encrypt = (data, key) => {
	const cipher = crypto.createCipheriv(algo(key), key, null);
	cipher.setAutoPadding(false);
	return Buffer.concat([cipher.update(pad(data)), cipher.final()]);
};
/** AES-ECB 解密 */
const decrypt = (data, key) => {
	const decipher = crypto.createDecipheriv(algo(key), key, null);
	decipher.setAutoPadding(false);
	return unpad(Buffer.concat([decipher.update(data), decipher.final()]));
};

//#endregion
//#region src/core/media.ts
/** 常见媒体格式 */
const FORMATS = {
	jpg: {
		mime: "image/jpeg",
		ext: ".jpg",
		kind: "image"
	},
	png: {
		mime: "image/png",
		ext: ".png",
		kind: "image"
	},
	gif: {
		mime: "image/gif",
		ext: ".gif",
		kind: "image"
	},
	webp: {
		mime: "image/webp",
		ext: ".webp",
		kind: "image"
	},
	bmp: {
		mime: "image/bmp",
		ext: ".bmp",
		kind: "image"
	},
	mp4: {
		mime: "video/mp4",
		ext: ".mp4",
		kind: "video"
	},
	avi: {
		mime: "video/x-msvideo",
		ext: ".avi",
		kind: "video"
	},
	mkv: {
		mime: "video/x-matroska",
		ext: ".mkv",
		kind: "video"
	},
	webm: {
		mime: "video/webm",
		ext: ".webm",
		kind: "video"
	},
	wav: {
		mime: "audio/wav",
		ext: ".wav",
		kind: "audio"
	},
	mp3: {
		mime: "audio/mpeg",
		ext: ".mp3",
		kind: "audio"
	},
	ogg: {
		mime: "audio/ogg",
		ext: ".ogg",
		kind: "audio"
	},
	flac: {
		mime: "audio/flac",
		ext: ".flac",
		kind: "audio"
	},
	amr: {
		mime: "audio/amr",
		ext: ".amr",
		kind: "audio"
	},
	silk: {
		mime: "audio/silk",
		ext: ".silk",
		kind: "audio"
	},
	aac: {
		mime: "audio/aac",
		ext: ".aac",
		kind: "audio"
	},
	m4a: {
		mime: "audio/mp4",
		ext: ".m4a",
		kind: "audio"
	}
};
/** 别名后缀映射 */
const EXT_ALIAS = new Map(Object.entries(FORMATS).map(([format, info]) => [info.ext, format]));
EXT_ALIAS.set(".jpeg", "jpg").set(".jpe", "jpg").set(".m4v", "mp4").set(".mov", "mp4");
const magic = (buffer, hex, offset = 0) => buffer.length >= offset + hex.length / 2 && buffer.subarray(offset, offset + hex.length / 2).equals(Buffer.from(hex, "hex"));
const ascii = (buffer, text, offset = 0) => buffer.length >= offset + text.length && buffer.subarray(offset, offset + text.length).equals(Buffer.from(text));
/** 通过文件头识别格式 */
const detectByContent = (buffer) => {
	if (magic(buffer, "ffd8ff")) return "jpg";
	if (magic(buffer, "89504e470d0a1a0a")) return "png";
	if (ascii(buffer, "GIF87a") || ascii(buffer, "GIF89a")) return "gif";
	if (ascii(buffer, "RIFF") && ascii(buffer, "WEBP", 8)) return "webp";
	if (ascii(buffer, "BM")) return "bmp";
	if (ascii(buffer, "RIFF") && ascii(buffer, "WAVE", 8)) return "wav";
	if (ascii(buffer, "RIFF") && ascii(buffer, "AVI ", 8)) return "avi";
	if (ascii(buffer, "ftyp", 4)) return "mp4";
	if (magic(buffer, "1a45dfa3")) return "mkv";
	if (ascii(buffer, "ID3") || buffer[0] === 255 && (buffer[1] & 224) === 224) return "mp3";
	if (ascii(buffer, "OggS")) return "ogg";
	if (ascii(buffer, "fLaC")) return "flac";
	if (ascii(buffer, "#!AMR")) return "amr";
	if (ascii(buffer, "#!SILK_V3")) return "silk";
	if (buffer[0] === 255 && (buffer[1] & 246) === 240) return "aac";
	return "";
};
const formatByName = (fileName) => EXT_ALIAS.get(path.extname(fileName || "").toLowerCase()) || "";
const formatByMime = (mime) => {
	const normalized = String(mime || "").split(";", 1)[0].trim().toLowerCase();
	return Object.entries(FORMATS).find(([, info]) => info.mime === normalized)?.[0] || "";
};
const safeName = (name, fallback = "file") => path.basename(String(name || "").replaceAll("\\", "/")).trim() || fallback;
/** 识别媒体格式 优先文件头 其次声明 mime/文件名 */
const detectMedia = (buffer, fileName = "", mimeType = "") => {
	const format = detectByContent(buffer) || formatByMime(mimeType) || formatByName(fileName);
	const info = FORMATS[format];
	return {
		format,
		mime: info?.mime || mimeType.split(";", 1)[0].trim() || "application/octet-stream",
		ext: info?.ext || path.extname(fileName || "").toLowerCase(),
		kind: info?.kind || "file"
	};
};
/** 日志脱敏 移除 base64/密钥等敏感内容 */
const sanitizeLog = (value) => String(value).replace(/data:[^,\s]+,[A-Za-z0-9+/_=-]+/gi, (match) => `data:...,length=${match.length}`).replace(/base64:\/\/[A-Za-z0-9+/_=-]+/gi, (match) => `base64://...,length=${match.length - 9}`).replace(/\b(encrypt_query_param|upload_param|aes_key|authorization|token)=([^&\s"',}]+)/gi, "$1=...");
const decodeBase64 = (payload, maxBytes) => {
	const compact = payload.replace(/\s+/g, "");
	const padded = compact + "=".repeat((4 - compact.replace(/=+$/, "").length % 4) % 4);
	const buffer = Buffer.from(padded, "base64");
	if (buffer.length > maxBytes) throw new Error(`媒体大小超出限制 (${maxBytes})`);
	return buffer;
};
const nameFromUrl = (url) => {
	const dispositionName = url.pathname.split("/").pop();
	try {
		return safeName(decodeURIComponent(dispositionName || ""));
	} catch {
		return safeName(dispositionName || "");
	}
};
/**
* 解析媒体引用
* 支持 Buffer、base64://、data:、http(s)://、file://、本地路径、裸 base64
*/
const resolveMedia = async (mediaRef, options = {}) => {
	const { timeoutMs = 15e3, maxBytes = 100 * 1024 * 1024, fileName: suppliedName = "" } = options;
	let fileName = safeName(suppliedName);
	let mimeType = "";
	let buffer;
	if (Buffer.isBuffer(mediaRef)) {
		buffer = mediaRef;
	} else if (/^base64:\/\//i.test(mediaRef)) {
		buffer = decodeBase64(mediaRef.slice(9), maxBytes);
	} else if (/^data:/i.test(mediaRef)) {
		const comma = mediaRef.indexOf(",");
		if (comma < 0) throw new Error("无效的 data URI");
		const header = mediaRef.slice(5, comma).split(";");
		if (!header.slice(1).some((part) => part.toLowerCase() === "base64")) throw new Error("仅支持 base64 data URI");
		mimeType = header[0] || "";
		buffer = decodeBase64(mediaRef.slice(comma + 1), maxBytes);
	} else {
		let url = null;
		try {
			url = new URL(mediaRef);
		} catch {
			url = null;
		}
		if (url && /^https?:$/.test(url.protocol)) {
			const res = await fetch(url, { signal: AbortSignal.timeout(Math.max(timeoutMs, 1)) });
			if (!res.ok) throw new Error(`下载媒体失败: HTTP ${res.status}`);
			buffer = Buffer.from(await res.arrayBuffer());
			if (buffer.length > maxBytes) throw new Error(`媒体大小超出限制 (${maxBytes})`);
			mimeType = res.headers.get("content-type") || "";
			if (!suppliedName) fileName = nameFromUrl(url);
		} else {
			const filePath = url && url.protocol === "file:" ? fileURLToPath(url) : mediaRef;
			try {
				const stat = await fs.stat(filePath);
				if (!stat.isFile()) throw new Error("路径不是文件");
				if (stat.size > maxBytes) throw new Error(`媒体大小超出限制 (${maxBytes})`);
				buffer = await fs.readFile(filePath);
				if (!suppliedName) fileName = safeName(filePath);
			} catch (error) {
				if (error.code !== "ENOENT") throw error;
				buffer = decodeBase64(mediaRef, maxBytes);
			}
		}
	}
	const detected = detectMedia(buffer, fileName, mimeType);
	if (detected.ext) {
		const current = formatByName(fileName);
		if (!current || current !== detected.format) {
			fileName = `${path.parse(fileName).name || "file"}${detected.ext}`;
		}
	}
	return {
		buffer,
		fileName,
		...detected
	};
};

//#endregion
//#region src/adapter/client.ts
/** iLink API 错误 携带结构化响应信息 */
var IlinkError = class extends Error {
	/** HTTP 状态码 */
	status;
	/** 应用层返回码 */
	ret;
	/** 应用层错误码 */
	errcode;
	constructor(message, status, ret, errcode) {
		super(message);
		this.name = "IlinkError";
		this.status = status;
		this.ret = ret;
		this.errcode = errcode;
	}
};
/** 判断错误是否为登录凭证失效 基于结构化响应字段 */
const isTokenInvalid = (error) => {
	if (!(error instanceof IlinkError)) return false;
	return error.status === 401 || error.status === 403 || error.ret === 100 || error.errcode === -14;
};
/** JSON 解析 将 uint64 标识字段加引号避免精度丢失 */
const parseJson = (text) => {
	let output = "";
	let index = 0;
	while (index < text.length) {
		if (text[index] !== "\"") {
			output += text[index++];
			continue;
		}
		const stringStart = index;
		index++;
		let escaped = false;
		while (index < text.length) {
			const char = text[index++];
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === "\"") break;
		}
		const stringToken = text.slice(stringStart, index);
		output += stringToken;
		let cursor = index;
		while (/\s/.test(text[cursor] ?? "")) cursor++;
		if (text[cursor] !== ":") continue;
		let key;
		try {
			key = JSON.parse(stringToken);
		} catch {
			continue;
		}
		if (typeof key !== "string" || key !== "message_id" && key !== "msg_id" && key !== "svr_id") continue;
		output += text.slice(index, cursor + 1);
		cursor++;
		while (/\s/.test(text[cursor] ?? "")) output += text[cursor++];
		const numberStart = cursor;
		if (text[cursor] === "-") cursor++;
		while (/\d/.test(text[cursor] ?? "")) cursor++;
		if (cursor > numberStart && !(cursor === numberStart + 1 && text[numberStart] === "-")) {
			output += `"${text.slice(numberStart, cursor)}"`;
			index = cursor;
		} else {
			index = numberStart;
		}
	}
	return JSON.parse(output);
};
/** 解析媒体 AES 密钥 支持 hex 与 base64 */
const decodeAesKey = (aesKey) => {
	const trimmed = String(aesKey || "").trim();
	if (!trimmed) return null;
	if (/^([0-9a-fA-F]{32}|[0-9a-fA-F]{48}|[0-9a-fA-F]{64})$/.test(trimmed)) {
		return Buffer.from(trimmed, "hex");
	}
	try {
		const decoded = Buffer.from(trimmed, "base64");
		const text = decoded.toString("utf8").trim();
		if (/^([0-9a-fA-F]{32}|[0-9a-fA-F]{48}|[0-9a-fA-F]{64})$/.test(text)) {
			return Buffer.from(text, "hex");
		}
		if ([
			16,
			24,
			32
		].includes(decoded.length)) return decoded;
	} catch {}
	return null;
};
/** 微信 ilink API 客户端 */
var WechatClient = class {
	cfg;
	token;
	baseUrl;
	constructor(options) {
		this.cfg = options.cfg;
		this.token = options.token || "";
		this.baseUrl = options.baseUrl || options.cfg.baseUrl;
	}
	headers(auth) {
		const headers = {
			"Content-Type": "application/json",
			AuthorizationType: "ilink_bot_token",
			"X-WECHAT-UIN": Buffer.from(String(Math.floor(Math.random() * 4294967296))).toString("base64"),
			"iLink-App-Id": "bot",
			"iLink-App-ClientVersion": String(65536)
		};
		if (auth && this.token) headers.Authorization = `Bearer ${this.token}`;
		return headers;
	}
	/** 公共请求元数据 */
	baseInfo() {
		return {
			channel_version: dir.version,
			bot_agent: `${dir.name}/${dir.version}`
		};
	}
	/** 发送 API 请求 处理 iLink 应用层错误 */
	async request(method, endpoint, options = {}) {
		let url = `${this.baseUrl}/${endpoint.replace(/^\//, "")}`;
		if (options.params) url += `?${new URLSearchParams(options.params)}`;
		const start = Date.now();
		const response = await fetch(url, {
			method,
			headers: {
				...this.headers(options.token ?? false),
				...options.headers
			},
			body: options.body ? JSON.stringify(options.body) : undefined,
			signal: AbortSignal.timeout(options.timeout ?? this.cfg.apiTimeout)
		});
		const text = await response.text();
		if (this.cfg.debug) {
			logger.mark(`[微信个人号] ${method} ${url} -> ${response.status} ${Date.now() - start}ms: ${sanitizeLog(text.slice(0, 1e3))}`);
		}
		if (!response.ok) throw new IlinkError(`HTTP ${response.status}: ${text}`, response.status);
		const json = text ? parseJson(text) : {};
		const base = json.base_info || json.base_response || {};
		const ret = json.ret ?? base.ret ?? 0;
		const errcode = json.errcode ?? base.errcode ?? 0;
		if (ret !== 0 || errcode !== 0) {
			throw new IlinkError(`iLink API 错误: ret=${ret}, errcode=${errcode}, errmsg=${json.errmsg || base.errmsg || "none"}`, response.status, ret, errcode);
		}
		return json;
	}
	/** 获取登录二维码 */
	getQRCode() {
		return this.request("GET", "ilink/bot/get_bot_qrcode", {
			params: { bot_type: this.cfg.botType },
			timeout: 15e3
		});
	}
	/** 轮询二维码扫码状态 */
	pollQRStatus(qrcode) {
		return this.request("GET", "ilink/bot/get_qrcode_status", {
			params: { qrcode },
			timeout: this.cfg.apiTimeout
		});
	}
	/** 长轮询获取消息更新 timeout 可覆盖默认长轮询时长 */
	async getUpdates(syncBuf = "", timeout) {
		try {
			return await this.request("POST", "ilink/bot/getupdates", {
				body: {
					base_info: this.baseInfo(),
					get_updates_buf: syncBuf
				},
				token: true,
				timeout: timeout ?? this.cfg.longPollTimeout
			});
		} catch (error) {
			/** 长轮询超时属正常控制流 返回空响应供重试 */
			if (["AbortError", "TimeoutError"].includes(error.name)) {
				return {
					ret: 0,
					get_updates_buf: syncBuf
				};
			}
			throw error;
		}
	}
	/** 通知服务端连接状态 */
	notify(start) {
		return this.request("POST", `ilink/bot/msg/notify${start ? "start" : "stop"}`, {
			body: { base_info: this.baseInfo() },
			token: true,
			timeout: 1e4
		});
	}
	/** 发送消息 */
	async sendMessage(toUserId, itemList, contextToken) {
		const clientId = uuid();
		return this.request("POST", "ilink/bot/sendmessage", {
			body: {
				base_info: this.baseInfo(),
				msg: {
					from_user_id: "",
					to_user_id: toUserId,
					client_id: clientId,
					message_type: 2,
					message_state: 2,
					context_token: contextToken,
					item_list: itemList
				}
			},
			token: true
		});
	}
	/** 获取媒体上传凭证 */
	getUploadUrl(params) {
		return this.request("POST", "ilink/bot/getuploadurl", {
			body: params,
			token: true
		});
	}
	/** 上传加密文件到 CDN 返回加密查询参数 */
	async uploadToCdn(uploadParam, uploadFullUrl, fileKey, aesKeyHex, buffer) {
		if (!uploadFullUrl && !uploadParam) throw new Error("CDN 上传地址缺失");
		const url = uploadFullUrl || `${this.cfg.cdnUrl}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(fileKey)}`;
		const start = Date.now();
		const response = await fetch(url, {
			method: "POST",
			body: new Uint8Array(encrypt(buffer, Buffer.from(aesKeyHex, "hex"))),
			headers: { "Content-Type": "application/octet-stream" },
			signal: AbortSignal.timeout(this.cfg.apiTimeout)
		});
		if (this.cfg.debug) {
			logger.mark(`[微信个人号] CDN 上传 ${fileKey} -> ${response.status} ${Date.now() - start}ms`);
		}
		if (!response.ok) throw new Error(`CDN 上传失败: HTTP ${response.status}`);
		return response.headers.get("x-encrypted-param") || "";
	}
	/** 从 CDN 下载并解密媒体文件 */
	async downloadMedia(encryptQueryParam, aesKey) {
		const url = `${this.cfg.cdnUrl}/download?encrypted_query_param=${encodeURIComponent(encryptQueryParam)}`;
		const response = await fetch(url, { signal: AbortSignal.timeout(this.cfg.apiTimeout) });
		if (!response.ok) throw new Error(`CDN 下载失败: HTTP ${response.status}`);
		const encrypted = Buffer.from(await response.arrayBuffer());
		const key = decodeAesKey(aesKey);
		return key ? decrypt(encrypted, key) : encrypted;
	}
	/**
	* 上传媒体文件
	* @param file base64://、http(s)://、本地路径、Buffer
	* @param toUserId 目标用户
	* @param kind 媒体类型 image/video/file
	* @param fileName 指定文件名
	*/
	async uploadMedia(file, toUserId, kind, fileName = "") {
		const resolved = await resolveMedia(file, {
			timeoutMs: this.cfg.apiTimeout,
			maxBytes: Math.max(1, this.cfg.mediaMaxSizeMb) * 1024 * 1024,
			fileName
		});
		const fileKey = uuid();
		const aesKeyHex = uuid();
		const rawSize = resolved.buffer.length;
		const cipherSize = rawSize + (16 - rawSize % 16 || 16);
		const mediaType = kind === "image" ? 1 : kind === "video" ? 2 : 3;
		const uploadUrl = await this.getUploadUrl({
			filekey: fileKey,
			media_type: mediaType,
			to_user_id: toUserId,
			rawsize: rawSize,
			rawfilemd5: crypto.createHash("md5").update(resolved.buffer).digest("hex"),
			filesize: cipherSize,
			no_need_thumb: true,
			aeskey: aesKeyHex,
			base_info: this.baseInfo()
		});
		const encryptQueryParam = await this.uploadToCdn(uploadUrl.upload_param, uploadUrl.upload_full_url, fileKey, aesKeyHex, resolved.buffer);
		return {
			media: {
				encrypt_query_param: encryptQueryParam,
				aes_key: Buffer.from(aesKeyHex).toString("base64"),
				encrypt_type: 1
			},
			fileSize: cipherSize,
			rawSize,
			fileName: resolved.fileName
		};
	}
	/** 获取"正在输入" ticket */
	getTypingTicket(userId, contextToken) {
		return this.request("POST", "ilink/bot/getconfig", {
			body: {
				ilink_user_id: userId,
				context_token: contextToken,
				base_info: this.baseInfo()
			},
			token: true
		});
	}
	/** 发送"正在输入"状态 */
	sendTypingState(userId, typingTicket, cancel = false) {
		return this.request("POST", "ilink/bot/sendtyping", {
			body: {
				ilink_user_id: userId,
				typing_ticket: typingTicket,
				status: cancel ? 2 : 1,
				base_info: this.baseInfo()
			},
			token: true
		});
	}
};

//#endregion
//#region src/adapter/convert.ts
/** base64 数据URL */
const b64 = (buffer) => `base64://${buffer.toString("base64")}`;
/** 下载并解密消息条目中的媒体 */
const downloadItemMedia = async (client, item, itemKey) => {
	const specific = item?.[itemKey] || {};
	const param = specific.media?.encrypt_query_param;
	if (!param) throw new Error(`媒体下载参数缺失 (${itemKey})`);
	return client.downloadMedia(param, specific.aeskey || specific.media?.aes_key);
};
/** 解析单个消息条目为 karin 元素 */
const parseItem = async (cfg, client, item) => {
	switch (item?.type) {
		case 1: {
			const text = item.text_item?.text;
			return text ? segment.text(text) : null;
		}
		case 2: {
			const buffer = await downloadItemMedia(client, item, "image_item");
			const name = `image${detectMedia(buffer).ext || ".jpg"}`;
			return segment.image(b64(buffer), { name });
		}
		case 3: {
			const text = item.voice_item?.text;
			if (text) return segment.text(text);
			const buffer = await downloadItemMedia(client, item, "voice_item");
			return segment.record(b64(buffer));
		}
		case 4: {
			const name = item.file_item?.file_name || "file";
			if (!cfg.downloadFile) return segment.text(`[文件: ${name}]`);
			const buffer = await downloadItemMedia(client, item, "file_item");
			return segment.file(b64(buffer), { name });
		}
		case 5: {
			const buffer = await downloadItemMedia(client, item, "video_item");
			return segment.video(b64(buffer));
		}
		case 11:
		case 12: {
			const name = (item.tool_call_start_item || item.tool_call_result_item)?.tool_name;
			return segment.text(`[工具调用: ${name || "未知"}]`);
		}
		default: return null;
	}
};
/** 解析引用消息链 返回引用消息ID与引用条目 */
const collectRefs = (itemList = []) => {
	const items = [];
	let messageId = "";
	const walk = (ref) => {
		if (!ref) return;
		if (!messageId) messageId = ref.message_id || ref.msg_id || ref.svr_id || ref.client_id || "";
		if (ref.message_item) {
			items.push(ref.message_item);
			walk(ref.message_item?.ref_msg);
		}
	};
	for (const item of itemList) walk(item?.ref_msg);
	return {
		messageId: messageId || msgId(),
		items
	};
};
/** 按局部引用元数据截取文本元素 */
const applyPartial = (elements, ref) => {
	const p = ref.partial_text;
	if (!p) return elements;
	return elements.map((el) => el.type === "text" ? segment.text(String(el.text || "").slice(Number(p.startindex) || 0, Number(p.endindex) || undefined)) : el);
};
/**
* 解析 ilink 消息条目为 karin 元素
* @param lookupRef 引用还原 仅携带 svr_id 时从本地缓存取已收到的消息元素
* @returns 元素数组与引用消息ID
*/
const parseItems = async (cfg, client, itemList = [], lookupRef) => {
	const quote = collectRefs(itemList);
	const elements = [];
	if (quote.items.length) {
		elements.push(segment.reply(quote.messageId));
		for (const item of [...quote.items, ...itemList]) {
			const element = await parseItem(cfg, client, item);
			if (element) elements.push(element);
		}
	} else if (quote.messageId && lookupRef) {
		/** 新版客户端引用只携带 svr_id 从本地缓存还原引用内容 */
		const cached = applyPartial(lookupRef(quote.messageId), itemList[0]?.ref_msg || {});
		if (cached.length) {
			elements.push(segment.reply(quote.messageId));
			elements.push(...cached);
		}
		for (const item of itemList) {
			const element = await parseItem(cfg, client, item);
			if (element) elements.push(element);
		}
		return {
			elements,
			quoteId: quote.messageId
		};
	} else {
		for (const item of itemList) {
			const element = await parseItem(cfg, client, item);
			if (element) elements.push(element);
		}
	}
	return {
		elements,
		quoteId: quote.items.length ? quote.messageId : ""
	};
};
/** 文本条目 */
const textItem = (text) => ({
	type: 1,
	text_item: { text }
});
/** 上传媒体文件并构建消息条目 */
const uploadElement = async (client, peerId, file, kind, fileName = "") => {
	const result = await client.uploadMedia(file, peerId, kind, fileName);
	switch (kind) {
		case "image": return {
			type: 2,
			image_item: {
				media: result.media,
				mid_size: result.fileSize
			}
		};
		case "video": return {
			type: 5,
			video_item: {
				media: result.media,
				video_size: result.fileSize
			}
		};
		default: return {
			type: 4,
			file_item: {
				media: result.media,
				file_name: result.fileName,
				len: String(result.rawSize)
			}
		};
	}
};
/** 从转发节点中提取待发送元素 */
const nodeElements = (node) => {
	if (node.subType !== "fake") return [];
	return (node.message ?? []).map((element) => typeof element === "string" ? segment.text(element) : element);
};
/**
* karin 元素转 ilink 消息条目批次
* 文本合并为一批 多媒体各自一批 保持顺序
*/
const toBatches = async (client, peerId, elements, nodes = []) => {
	const batches = [];
	const nodeQueue = [...nodes];
	const texts = [];
	const flush = () => {
		const text = texts.join("").trim();
		if (text) batches.push([textItem(text)]);
		texts.length = 0;
	};
	/** 上传媒体并入批 失败仅记录日志不发送占位消息 */
	const pushUpload = async (file, name, kind, label, fallback = "") => {
		flush();
		try {
			batches.push([await uploadElement(client, peerId, file, kind, name || fallback)]);
		} catch (error) {
			logger.error(`[微信个人号] ${label}上传失败: ${error.message}`);
		}
	};
	for (const element of elements) {
		switch (element?.type) {
			case "text":
				texts.push(element.text);
				break;
			/** 微信客户端可渲染 markdown 直接作为文本发送 */
			case "markdown":
				texts.push(element.markdown);
				break;
			case "image":
				await pushUpload(element.file, element.name, "image", "图片");
				break;
			case "video":
				await pushUpload(element.file, element.name, "video", "视频");
				break;
			case "file":
				await pushUpload(element.file, element.name, "file", "文件");
				break;
			case "record":
				await pushUpload(element.file, element.name, "file", "语音", "voice.amr");
				break;
			case "node":
				flush();
				nodeQueue.push(element);
				break;
			default: break;
		}
	}
	flush();
	return {
		batches,
		nodes: nodeQueue
	};
};

//#endregion
//#region src/core/history.ts
/** 每个会话保留的历史消息条数上限 */
const HISTORY_MAX = 200;
const dbKey = (botId) => `wxoc:history:${botId}`;
/** 读取账号历史 */
const read = async (botId) => await db.get(dbKey(botId)) || {};
/**
* 历史消息存储 (Karin kv 数据库)
*/
const history = {
	/** 保存历史消息 每个会话超出上限裁剪最旧的 */
	async save(botId, raw) {
		if (!botId || !raw?.messageId) return;
		const peer = raw.contact?.peer;
		if (!peer) return;
		const data = await read(botId);
		const list = data[peer] || [];
		const index = list.findIndex((item) => item.messageId === raw.messageId);
		if (index !== -1) list[index] = raw;
		else list.push(raw);
		if (list.length > HISTORY_MAX) list.splice(0, list.length - HISTORY_MAX);
		data[peer] = list;
		await db.set(dbKey(botId), data);
	},
	/** 获取单条历史消息 */
	async get(botId, messageId) {
		if (!botId || !messageId) return null;
		const data = await read(botId);
		for (const list of Object.values(data)) {
			const raw = list.find((item) => item.messageId === messageId);
			if (raw) return raw;
		}
		return null;
	},
	/** 获取会话历史消息 startMsgId 为空取最新 count 条 否则取该消息及其之前的 count 条 按时间新→旧排序 */
	async list(botId, userId, startMsgId, count) {
		if (!botId || !userId) return [];
		const list = (await read(botId))[userId] || [];
		if (!list.length) return [];
		let selected;
		if (startMsgId) {
			const index = list.findIndex((item) => item.messageId === startMsgId);
			if (index === -1) return [];
			selected = list.slice(Math.max(0, index - count + 1), index + 1);
		} else {
			selected = list.slice(-count);
		}
		return selected.reverse();
	},
	/** 删除账号历史 */
	async clear(botId) {
		if (!botId) return;
		await db.del(dbKey(botId));
	}
};

//#endregion
//#region src/core/state.ts
const hashKey = (botId) => `karin:wechat-oc:${botId}`;
/**
* 账号状态存储 (syncBuf / contextToken)
*/
const state = {
	/** 获取长轮询游标 */
	async getSyncBuf(botId) {
		if (!botId) return "";
		try {
			return await redis.hGet(hashKey(botId), "syncBuf") || "";
		} catch (error) {
			logger.error(`[微信个人号] 读取 syncBuf 失败: ${error.message}`);
			return "";
		}
	},
	/** 保存长轮询游标 */
	async setSyncBuf(botId, syncBuf) {
		if (!botId || !syncBuf) return;
		await redis.hSet(hashKey(botId), "syncBuf", syncBuf);
	},
	/** 获取会话上下文 token */
	async getContext(botId, userId) {
		if (!botId || !userId) return "";
		try {
			return await redis.hGet(hashKey(botId), `context:${userId}`) || "";
		} catch (error) {
			logger.error(`[微信个人号] 读取 contextToken 失败: ${error.message}`);
			return "";
		}
	},
	/** 保存会话上下文 token */
	async setContext(botId, userId, contextToken) {
		if (!botId || !userId || !contextToken) return;
		await redis.hSet(hashKey(botId), `context:${userId}`, contextToken);
	},
	/** 删除会话上下文 token */
	async clearContext(botId, userId) {
		if (!botId || !userId) return;
		await redis.hDel(hashKey(botId), `context:${userId}`);
	},
	/** 记录联系人昵称 */
	async setContact(botId, userId, name) {
		if (!botId || !userId || !name) return;
		await redis.hSet(hashKey(botId), `contact:${userId}`, JSON.stringify({
			name,
			time: Date.now()
		}));
	},
	/** 获取单个联系人 */
	async getContact(botId, userId) {
		if (!botId || !userId) return null;
		try {
			const raw = await redis.hGet(hashKey(botId), `contact:${userId}`);
			if (!raw) return null;
			const data = JSON.parse(raw);
			return {
				name: data.name || "",
				time: data.time || 0
			};
		} catch {
			return null;
		}
	},
	/** 获取全部联系人 */
	async getContacts(botId) {
		if (!botId) return [];
		try {
			const all = await redis.hGetAll(hashKey(botId));
			const contacts = [];
			for (const [key, raw] of Object.entries(all || {})) {
				if (!key.startsWith("contact:")) continue;
				try {
					const data = JSON.parse(raw);
					contacts.push({
						userId: key.slice(8),
						name: data.name || "",
						time: data.time || 0
					});
				} catch {}
			}
			return contacts;
		} catch (error) {
			logger.error(`[微信个人号] 读取联系人失败: ${error.message}`);
			return [];
		}
	},
	/** 清理账号全部状态 */
	async clear(botId) {
		if (!botId) return;
		await redis.del(hashKey(botId));
	}
};

//#endregion
//#region src/adapter/bot.ts
/** 微信个人号适配器 */
var WechatAdapter = class extends AdapterBase {
	/** 停止标志 */
	stop = false;
	/** 协议客户端 */
	client;
	/** 账号配置 */
	data;
	#cfg;
	#offline;
	/** 消息去重缓存 */
	#seen = new Map();
	/** 消息缓存 供 getMsg 使用 */
	#cache = new Map();
	/** 正在输入状态 */
	#typing = new Map();
	constructor(cfg, account, offline) {
		super();
		this.#cfg = cfg;
		this.#offline = offline;
		this.data = account;
		this.client = new WechatClient({
			cfg,
			token: account.token
		});
		this.adapter.name = "WeixinClaw";
		this.adapter.version = dir.version;
		this.adapter.platform = "wechat";
		this.adapter.standard = "other";
		this.adapter.protocol = "wechat-claw";
		this.adapter.communication = "other";
		this.adapter.address = cfg.baseUrl;
		this.account.selfId = account.botId;
		this.account.uid = account.userId;
		this.account.uin = account.botId;
		this.account.name = account.nickname || account.botId;
		this.account.avatar = cfg.botAvatar;
		/** karin 预留的原生方法出口 指向适配器自身 供 e.bot.super 调用扩展方法 */
		this.super = this;
	}
	/** 注册并启动消息轮询 */
	async start() {
		this.adapter.index = registerBot("other", this);
		/** 通知服务端上线 不阻塞启动 */
		this.client.notify(true).catch(() => {});
		this.#poll();
	}
	/** 停止轮询并注销 */
	async destroy() {
		this.stop = true;
		/** 通知服务端下线 */
		await this.client.notify(false).catch(() => {});
		await sleep(1e3);
		unregisterBot("index", this.adapter.index);
	}
	/** 下线通知 */
	async offlineNotice(message) {
		const contact = contactFriend(this.selfId);
		createBotOfflineNotice({
			bot: this,
			time: Date.now(),
			eventId: this.selfId,
			rawEvent: { message },
			contact,
			sender: senderFriend(this.selfId, this.account.name),
			content: {
				tag: "账号下线",
				message
			},
			srcReply: (elements) => this.sendMsg(contact, elements)
		});
	}
	/** 消息轮询 */
	async #poll() {
		let errors = 0;
		/** 下轮长轮询超时 优先使用服务端建议值 */
		let pollTimeout = this.#cfg.longPollTimeout;
		while (!this.stop) {
			try {
				const syncBuf = await state.getSyncBuf(this.selfId);
				const result = await this.client.getUpdates(syncBuf, pollTimeout);
				pollTimeout = result.longpolling_timeout_ms || this.#cfg.longPollTimeout;
				if (errors >= 3) logger.bot("info", this.selfId, `[微信个人号] 网络恢复 (共重试${errors}次)`);
				errors = 0;
				/** 全部处理成功后才推进游标 避免处理失败丢消息 */
				for (const msg of result.msgs || []) {
					if (this.stop) return;
					await this.#onMessage(msg);
				}
				if (!this.stop && result.get_updates_buf) {
					await state.setSyncBuf(this.selfId, result.get_updates_buf);
				}
			} catch (error) {
				if (this.stop) return;
				const message = error.message || "";
				if (isTokenInvalid(error)) {
					await this.#offline(this.selfId, `登录凭证已失效: ${message}`);
					return;
				}
				if (/timeout/i.test(message) || error.name === "AbortError") continue;
				errors++;
				const ms = Math.min(errors * 5e3, 3e5);
				/** 前3次逐条报 之后每10次汇总一条 避免刷屏 */
				if (errors <= 3 || errors % 10 === 0) {
					logger.bot("warn", this.selfId, `[微信个人号] 轮询断开 (第${errors}次重连 休眠${ms / 1e3}s): ${message}`);
				}
				await sleep(ms);
			}
		}
	}
	/** 处理收到的消息 */
	async #onMessage(msg) {
		const userId = msg.from_user_id;
		if (!userId) return;
		const messageId = msg.message_id || msg.msg_id || msgId();
		const dedupKey = `${this.selfId}:${messageId}:${msg.client_id || ""}`;
		if (this.#seen.has(dedupKey)) return;
		if (msg.context_token) await state.setContext(this.selfId, userId, msg.context_token);
		/** 记录联系人昵称 供好友列表使用 */
		if (msg.from_user_name) await state.setContact(this.selfId, userId, msg.from_user_name);
		/** 引用还原 仅携带 svr_id 时从本地缓存取 */
		const { elements } = await parseItems(this.#cfg, this.client, msg.item_list, (id) => this.#cache.get(id)?.elements || []);
		if (!elements.length) return;
		const nickname = msg.from_user_name || this.account.name;
		const contact = contactFriend(userId, nickname);
		const raw = {
			time: Date.now(),
			messageId,
			messageSeq: Number(messageId) || 0,
			contact,
			sender: senderFriend(userId, nickname),
			elements
		};
		this.#cacheMessage(raw);
		createFriendMessage({
			bot: this,
			time: raw.time,
			contact,
			sender: senderFriend(userId, nickname),
			rawEvent: raw,
			messageId,
			messageSeq: raw.messageSeq,
			eventId: messageId,
			elements,
			srcReply: (elements) => this.sendMsg(contact, elements)
		});
		this.#seen.set(dedupKey, Date.now());
		while (this.#seen.size > 500) {
			this.#seen.delete(this.#seen.keys().next().value);
		}
	}
	/** 缓存消息 内存快路径 + 持久化到 Redis 供 getMsg / 引用消息 / 历史消息获取 */
	#cacheMessage(raw) {
		this.#cache.set(raw.messageId, raw);
		setTimeout(() => this.#cache.delete(raw.messageId), 10 * 60 * 1e3);
		while (this.#cache.size > 100) {
			const first = this.#cache.keys().next().value;
			this.#cache.delete(first);
		}
		history.save(this.selfId, raw).catch((error) => {
			logger.bot("warn", this.selfId, `[微信个人号] 保存历史消息失败: ${error.message}`);
		});
	}
	/** 发送消息 */
	async sendMsg(contact, elements, retryCount = 0) {
		if (contact.scene !== "friend") throw new Error("微信个人号仅支持好友私聊");
		const peerId = contact.peer;
		const contextToken = await state.getContext(this.selfId, peerId);
		if (!contextToken) {
			throw new Error("缺少上下文 contextToken 无法发送消息 请先让对方给你发一条消息");
		}
		const { batches, nodes } = await toBatches(this.client, peerId, elements);
		if (!batches.length && !nodes.length) throw new Error("消息为空或不支持的消息类型");
		this.stopTyping(peerId).catch(() => {});
		try {
			const results = [];
			for (const batch of batches) {
				results.push(await this.client.sendMessage(peerId, batch, contextToken));
			}
			for (const node of nodes) {
				await this.sendForwardMsg(contact, [node]);
			}
			const messageId = String(results[0]?.msg?.message_id || results[0]?.message_id || uuid().slice(0, 20));
			if (this.#cfg.debug) {
				logger.bot("debug", this.selfId, `[微信个人号] 发送消息: ${sanitizeLog(JSON.stringify(results))}`);
			}
			/** 发送的消息也存入历史 */
			this.#cacheMessage({
				time: Date.now(),
				messageId,
				messageSeq: Number(messageId) || 0,
				contact,
				sender: senderFriend(this.selfId, this.account.name),
				elements
			});
			return {
				messageId,
				time: Date.now(),
				rawData: results,
				message_id: messageId,
				messageTime: Date.now()
			};
		} catch (error) {
			if (retryCount > 0) return this.sendMsg(contact, elements, retryCount - 1);
			const message = error.message || "";
			if (message.includes("ret=-2")) {
				await state.clearContext(this.selfId, peerId);
				throw new Error("上下文 contextToken 已过期 请先让对方给你发一条消息");
			}
			throw error;
		}
	}
	/** 发送合并转发消息 降级为逐条发送 */
	async sendForwardMsg(contact, elements) {
		const parts = [];
		for (const node of elements) parts.push(...nodeElements(node));
		let messageId = "";
		for (const part of parts) {
			const result = await this.sendMsg(contact, [part]);
			messageId = result.messageId;
		}
		if (!messageId) throw new Error("合并转发消息为空");
		/** 缓存合成消息 供 getForwardMsg / sendLongMsg 使用 */
		this.#cache.set(messageId, {
			time: Date.now(),
			messageId,
			messageSeq: Number(messageId) || 0,
			contact,
			sender: senderFriend(this.selfId, this.account.name),
			elements: parts
		});
		return {
			messageId,
			forwardId: messageId
		};
	}
	/** 获取合并转发消息 仅支持本账号发送过的 */
	async getForwardMsg(resId) {
		const raw = this.#cache.get(resId);
		return raw ? [raw] : [];
	}
	/** 发送长消息 基于已发送的转发内容重发 */
	async sendLongMsg(contact, resId) {
		const [raw] = await this.getForwardMsg(resId);
		if (!raw) throw new Error("长消息内容不存在或已过期");
		return this.sendMsg(contact, raw.elements);
	}
	/** 构造资源ID 协议不支持仅上传 降级为实际发送合并转发 */
	async createResId(contact, elements) {
		const { forwardId } = await this.sendForwardMsg(contact, elements);
		return forwardId;
	}
	/** 上传文件 降级为直接发送文件消息 */
	async uploadFile(contact, file, name) {
		const element = {
			type: "file",
			file: `file://${file}`,
			name
		};
		await this.sendMsg(contact, [element]);
	}
	/** 下载文件到插件数据目录 支持 url 和 base64 */
	async downloadFile(options) {
		const root = path.join(dir.karinPath, "data", "downloads");
		await mkdir(root, { recursive: true });
		if (options && "base64" in options && options.base64) {
			const fileName = options.fileName || createHash("md5").update(options.base64).digest("hex");
			const filePath = path.join(root, fileName);
			await writeFile(filePath, Buffer.from(options.base64, "base64"));
			return { filePath };
		}
		if (!options?.url) throw new Error("downloadFile 需要 url 或 base64");
		const response = await fetch(options.url);
		if (!response.ok) throw new Error(`下载文件失败: HTTP ${response.status}`);
		const buffer = Buffer.from(await response.arrayBuffer());
		const ext = path.extname(new URL(options.url).pathname) || ".bin";
		const fileName = options.fileName || `${createHash("md5").update(buffer).digest("hex")}${ext}`;
		const filePath = path.join(root, fileName);
		await writeFile(filePath, buffer);
		return { filePath };
	}
	/** 微信个人号不支持撤回消息 */
	async recallMsg() {
		throw new Error("微信个人号协议不支持撤回消息");
	}
	/** 获取消息 提供 messageId 时查缓存和历史文件未提供时返回该会话最新一条 */
	async getMsg(contact, messageId) {
		const id = typeof contact === "string" ? contact : messageId || "";
		if (id) {
			return this.#cache.get(id) || await history.get(this.selfId, id);
		}
		if (typeof contact === "string") throw new Error("获取消息需要提供消息ID");
		const [raw] = await history.list(this.selfId, contact.peer, "", 1);
		if (!raw) throw new Error("未找到历史消息");
		return raw;
	}
	/** 获取历史消息 从本地历史文件读取 startMsgId 为空取最新 count 条 */
	async getHistoryMsg(contact, startMsgId, count = 1) {
		return history.list(this.selfId, contact.peer, startMsgId ? String(startMsgId) : "", Math.max(1, count || 1));
	}
	/** 获取头像url 支持配置头像 bot用botAvatar 其余用userAvatar */
	async getAvatarUrl(userId = this.selfId) {
		return userId === this.selfId ? this.#cfg.botAvatar : this.#cfg.userAvatar;
	}
	/** 微信个人号不支持群聊 */
	async getGroupAvatarUrl() {
		throw new Error("微信个人号不支持群聊");
	}
	/** 获取陌生人信息 */
	async getStrangerInfo(targetId) {
		const contact = await state.getContact(this.selfId, targetId);
		return {
			userId: targetId,
			uid: targetId,
			nick: contact?.name || ""
		};
	}
	/** 获取好友列表 基于已收发消息的联系人缓存 */
	async getFriendList() {
		const contacts = await state.getContacts(this.selfId);
		return contacts.map((contact) => ({
			userId: contact.userId,
			uid: contact.userId,
			nick: contact.name
		}));
	}
	/** 微信个人号不支持群聊 返回空列表 */
	async getGroupList() {
		return [];
	}
	/** 微信个人号不支持群聊 */
	async getGroupInfo(_groupId) {
		throw new Error("微信个人号不支持群聊");
	}
	/** 微信个人号不支持群聊 返回空列表 */
	async getGroupMemberList(_groupId) {
		return [];
	}
	/** 微信个人号不支持群聊 */
	async getGroupMemberInfo(_groupId, targetId) {
		throw new Error(`微信个人号不支持群聊 (${targetId})`);
	}
	/** 发送"正在输入"状态 返回ownerId 供 stopTyping 使用 */
	async sendTyping(peerId) {
		const ownerId = uuid().slice(0, 8);
		let typing = this.#typing.get(peerId);
		if (typing) {
			typing.owners.add(ownerId);
			return ownerId;
		}
		typing = {
			ticket: "",
			contextToken: "",
			expire: 0,
			timer: null,
			autoStop: null,
			owners: new Set([ownerId])
		};
		this.#typing.set(peerId, typing);
		const perform = async () => {
			try {
				const contextToken = await state.getContext(this.selfId, peerId);
				if (!contextToken) return;
				if (!typing.ticket || typing.contextToken !== contextToken || Date.now() > typing.expire) {
					const res = await this.client.getTypingTicket(peerId, contextToken);
					typing.ticket = res.typing_ticket;
					typing.contextToken = contextToken;
					typing.expire = Date.now() + this.#cfg.typingTicketTtl;
				}
				await this.client.sendTypingState(peerId, typing.ticket);
			} catch (error) {
				logger.bot("error", this.selfId, `[微信个人号] 发送正在输入状态失败: ${error.message}`);
			}
		};
		await perform();
		typing.timer = setInterval(perform, this.#cfg.typingKeepalive);
		typing.autoStop = setTimeout(() => this.stopTyping(peerId), this.#cfg.typingTtl);
		return ownerId;
	}
	/** 停止"正在输入"状态 传入ownerId时仅移除对应触发源 */
	async stopTyping(peerId, ownerId = null) {
		const typing = this.#typing.get(peerId);
		if (!typing) return;
		if (ownerId) {
			typing.owners.delete(ownerId);
		} else {
			typing.owners.clear();
		}
		if (typing.owners.size > 0) return;
		clearInterval(typing.timer);
		clearTimeout(typing.autoStop);
		this.#typing.delete(peerId);
		if (typing.ticket) {
			try {
				await this.client.sendTypingState(peerId, typing.ticket, true);
			} catch {}
		}
	}
};

//#endregion
//#region src/adapter/index.ts
/** 账号管理 */
var Manager = class {
	/** 在线适配器 */
	bots = new Map();
	/** 正在连接的账号 防止并发重复连接 */
	#connecting = new Set();
	/** 热加载去抖定时器 */
	#reloadTimer;
	constructor() {
		/** 监听配置文件 变更后热加载账号 */
		setTimeout(() => watch(path.join(dir.ConfigDir, "config.json"), () => this.#reload()), 2e3);
	}
	/** 配置变更后差异同步账号连接 */
	#reload() {
		clearTimeout(this.#reloadTimer);
		this.#reloadTimer = setTimeout(async () => {
			const tasks = [];
			/** 配置中已移除、禁用或凭证变更的账号 断开 */
			for (const [botId, adapter] of this.bots) {
				const account = config().accounts.find((a) => a.botId === botId);
				if (!account || account.isDisable || account.token !== adapter.data.token || account.baseUrl !== adapter.data.baseUrl) {
					tasks.push(this.destroy(botId));
				}
			}
			/** 新增或重新启用的账号 连接 */
			for (const account of config().accounts) {
				if (!account.token || account.isDisable || this.bots.has(account.botId) || this.#connecting.has(account.botId)) continue;
				tasks.push(this.connect(account).then(() => sleep(2e3)));
			}
			if (!tasks.length) return;
			await Promise.all(tasks);
		}, 1e3);
	}
	/** 生成新的账号ID 9位数字 */
	#nextId() {
		const accounts = config().accounts;
		while (true) {
			const id = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
			if (!accounts.some((a) => a.botId === id) && !this.bots.has(id)) return id;
		}
	}
	/** 按序号/ID/昵称查找账号 */
	findAccount(input) {
		const accounts = config().accounts;
		const index = Number(input) - 1;
		if (Number.isInteger(index) && index >= 0 && index < accounts.length) {
			return {
				account: accounts[index],
				accounts
			};
		}
		return {
			account: accounts.find((a) => a.botId === input || a.userId === input || a.nickname === input),
			accounts
		};
	}
	/** 启动时并行加载所有账号 */
	async load() {
		const accounts = config().accounts.filter((a) => a.token && !a.isDisable && !this.bots.has(a.botId));
		if (!accounts.length) return;
		const results = await Promise.all(accounts.map((account) => this.connect(account).then((result) => ({
			account,
			...result
		}))));
		const failed = results.filter((result) => result.needLogin);
		if (failed.length) {
			for (const { account, error } of failed) {
				logger.mark(`[微信个人号] [${account.nickname || account.botId}] 凭证已失效，请发送 #微信登录 重新扫码 (${error})`);
				account.token = "";
				account.isDisable = true;
			}
			saveConfig({ accounts: config().accounts });
		}
	}
	/** 连接账号 验证凭证后创建适配器 */
	async connect(account) {
		if (!account.token) return {
			needLogin: true,
			error: "缺少登录凭证"
		};
		/** 已在连接中直接放行 避免登录流程与热加载并发重复连接 */
		if (this.#connecting.has(account.botId) || this.bots.has(account.botId)) return { success: true };
		this.#connecting.add(account.botId);
		try {
			const cfg = config();
			const client = new WechatClient({
				cfg,
				token: account.token,
				baseUrl: account.baseUrl
			});
			try {
				const syncBuf = await state.getSyncBuf(account.botId);
				/** 短超时验证凭证 服务器未拒绝即放行 避免长轮询挂住连接流程 */
				await client.getUpdates(syncBuf, 3e3);
			} catch (error) {
				const message = error.message || "";
				if (isTokenInvalid(error)) return {
					needLogin: true,
					error: message
				};
				/** 网络波动时放行 交给轮询循环重连 */
				if (!/timeout|ECONNRESET|fetch failed|AbortError/i.test(message)) {
					return {
						needLogin: true,
						error: `凭证验证失败: ${message}`
					};
				}
			}
			await this.#create(account, cfg);
			return { success: true };
		} finally {
			this.#connecting.delete(account.botId);
		}
	}
	/** 创建并启动适配器 已存在则先停止旧的 */
	async #create(account, cfg) {
		await this.destroy(account.botId);
		const adapter = new WechatAdapter(cfg, account, (botId, message) => this.#onOffline(botId, message));
		this.bots.set(account.botId, adapter);
		await adapter.start();
	}
	/** 停止并移除适配器 */
	async destroy(botId) {
		const adapter = this.bots.get(botId);
		if (!adapter) return;
		this.bots.delete(botId);
		await adapter.destroy();
	}
	/** 删除账号 停止适配器并清理状态 */
	async remove(account) {
		await this.destroy(account.botId);
		await state.clear(account.botId);
		await history.clear(account.botId);
		saveConfig({ accounts: config().accounts.filter((a) => a !== account) });
	}
	/** 账号下线处理 */
	async #onOffline(botId, message) {
		const adapter = this.bots.get(botId);
		if (adapter) await adapter.offlineNotice(message);
		const account = config().accounts.find((a) => a.botId === botId);
		if (account) {
			account.token = "";
			account.isDisable = true;
			saveConfig({ accounts: config().accounts });
		}
		await this.destroy(botId);
		logger.mark(`[微信个人号] ${botId} 已下线: ${message}`);
	}
	/** 扫码登录 */
	async login(e) {
		const client = new WechatClient({ cfg: config() });
		let qr;
		try {
			qr = await client.getQRCode();
		} catch (error) {
			await e.reply(`获取二维码失败: ${error.message}`);
			return false;
		}
		if (!qr?.qrcode || !qr?.qrcode_img_content) {
			await e.reply("获取二维码失败");
			return false;
		}
		await this.#showQR(e, qr);
		/** 登录等待时长 5 分钟 */
		const deadline = Date.now() + 5 * 60 * 1e3;
		while (Date.now() < deadline) {
			await sleep(config().qrPollInterval);
			let status;
			try {
				status = await client.pollQRStatus(qr.qrcode);
			} catch (error) {
				const message = error.message || "";
				if (!/timeout/i.test(message)) logger.error(`[微信个人号] 轮询二维码状态失败: ${message}`);
				continue;
			}
			if (status.status === "expired") {
				await e.reply("二维码已过期，请重新登录");
				return false;
			}
			if (status.status !== "confirmed") continue;
			const { bot_token: token, ilink_user_id: userId, ilink_bot_id: accountId, nickname, baseurl } = status;
			if (!token || !userId) continue;
			const account = await this.#saveLogin({
				ilink_user_id: userId,
				ilink_bot_id: accountId,
				bot_token: token,
				nickname,
				baseurl
			});
			const result = await this.connect(account);
			await e.reply(result.success ? `微信个人号登录成功: ${account.nickname}` : `凭证已保存 但连接失败: ${result.error || "未知错误"}`);
			return true;
		}
		await e.reply("登录超时，请重新尝试");
		return false;
	}
	/** 展示登录二维码 */
	async #showQR(e, qr) {
		const link = qr.qrcode_img_content;
		/** 终端适配器直接在终端打印二维码 */
		if (e.bot.adapter.protocol === "console") {
			try {
				const terminal = await QRCode.toString(link, {
					type: "terminal",
					small: true
				});
				process.stdout.write(`\n请使用微信扫码登录:\n${terminal}\n`);
			} catch (error) {
				logger.error(`[微信个人号] 终端输出二维码失败: ${error.message}`);
			}
			await e.reply(`请扫码登录 或访问链接: ${link}`);
			return;
		}
		try {
			const image = (await QRCode.toDataURL(link, {
				width: 300,
				margin: 2
			})).replace(/^data:image\/png;base64,/, "");
			await e.reply([segment.text("请使用微信扫码登录"), segment.image(`base64://${image}`)]);
		} catch {
			await e.reply(`请扫码登录 或访问链接: ${link}`);
		}
	}
	/** 保存扫码登录结果 */
	async #saveLogin(status) {
		const accounts = config().accounts;
		const account = accounts.find((a) => a.userId === status.ilink_user_id);
		if (account) {
			account.token = status.bot_token;
			account.accountId = status.ilink_bot_id || account.accountId;
			if (status.baseurl) account.baseUrl = status.baseurl;
			account.isDisable = false;
			if (!account.botId) account.botId = this.#nextId();
			await this.destroy(account.botId);
		} else {
			accounts.push({
				botId: this.#nextId(),
				token: status.bot_token,
				accountId: status.ilink_bot_id || "",
				userId: status.ilink_user_id,
				nickname: status.nickname || `微信ClawBot${accounts.length + 1}`,
				baseUrl: status.baseurl
			});
		}
		saveConfig({ accounts });
		return account || accounts[accounts.length - 1];
	}
	/** 账号列表文本 */
	listText() {
		const accounts = config().accounts;
		if (!accounts.length) return "暂无账号，用 #微信登录 添加";
		const list = accounts.map((account, index) => {
			const status = account.isDisable ? "已禁用" : this.bots.has(account.botId) ? "在线" : "离线";
			return `${index + 1}. ${account.nickname || account.botId} [${status}]\n   ${account.userId}`;
		});
		return `微信个人号账号列表:\n${list.join("\n")}\n\n指令: #微信登录 | #微信删除[序号] | #微信禁用/启用[序号]`;
	}
	/** 删除账号 */
	async removeAccount(input) {
		const { account } = this.findAccount(input);
		if (!account) return "未找到账号，用 #微信账号列表 查看";
		const name = account.nickname || account.botId;
		await this.remove(account);
		return `已删除 ${name}，剩余 ${config().accounts.length} 个账号`;
	}
	/** 禁用/启用账号 */
	async toggleAccount(input, disable) {
		const { account, accounts } = this.findAccount(input);
		if (!account) return "未找到账号，用 #微信账号列表 查看";
		if (account.isDisable === disable) return `账号已是${disable ? "禁用" : "启用"}状态`;
		if (disable) await this.destroy(account.botId);
		account.isDisable = disable;
		saveConfig({ accounts });
		return `已${disable ? "禁用" : "启用"} ${account.nickname || account.botId}`;
	}
};
const manager = new Manager();

//#endregion
export { manager as t };