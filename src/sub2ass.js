import { DOMParser } from	'xmldom';
import axios from 'axios'
import * as zlib from 'node:zlib';

class DanmakuConverter {
	constructor() {
		this.contents = '';
	}

	// 核心转换方法
	async xml2ass(
		cid,
		width = 1920,
		height = 1080,
		protect = 0,
		font = 'SimHei',
		fontsize = 25,
		alpha = 0.95,
		duration_marquee = 5,
		duration_still = 5,
		_filter = null,
		_filterFile = null,
		is_reduce = false
	) {
		try {
			const comments = await this.getComments(cid, fontsize);
			console.debug('Parsed danmaku data:', comments)
			return this.generateASS(
				comments,
				width,
				height,
				protect,
				font,
				fontsize,
				alpha,
				duration_marquee,
				duration_still,
				is_reduce,
				null);
		} catch (error) {
			console.error('Error converting danmaku:', error);
			return '';
		}
	}
	async getComments(cid, fontSize = 25) {
		const headers = {
			'Accept': 'text/html',
			"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Safari/537.36",
			'Accept-Encoding': 'deflate'
		};

		if (cid.length <= 0) return [];

		try {
			// 发送 HTTP 请求（使用 Axios API）
			const response = await axios.get(`https://comment.bilibili.com/${cid}.xml`, {
				headers: headers,
				responseType: 'arraybuffer'
			});
			const buffer = response.data;
			const decompressed = zlib.inflateRawSync(new Uint8Array(buffer));
			const data = new TextDecoder('utf-8').decode(decompressed);
			console.debug('Received danmaku data:', data)


			// 解析 XML 数据
			const parser = new DOMParser();
			const xmlDoc = parser.parseFromString(data, "text/xml");

			// 检测 XML 版本并处理注释
			const comments = [];
			if (data.includes('<?xml version="1.0"')) {
				comments.push(...this.ReadCommentsBilibili1(xmlDoc, fontSize));
			} else if (data.includes('<?xml version="2.0"')) {
				comments.push(...this.ReadCommentsBilibili2(xmlDoc, fontSize));
			} else {
				return comments;
			}

			// 按时间戳排序（假设 ele[0] 是时间戳）
			comments.sort((a, b) => a[0] - b[0]);
			return comments;
		} catch (error) {
			console.error("Error fetching comments:", error);
			return [];
		}
	}

	ReadCommentsBilibili1(xmlDoc, fontSize) {
		const comments = [];
		const commentElements = xmlDoc.getElementsByTagName('d');

		// 将 HTMLCollection 转为数组以便使用 forEach
		Array.from(commentElements).forEach((comment, i) => {
			try {
				const p = comment.getAttribute('p').split(',');
				if (p.length < 5) throw new Error('Invalid p attribute length');
				if (!['1', '4', '5', '6', '7', '8'].includes(p[1])) throw new Error('Invalid comment type');

				if (comment.childNodes.length > 0) {
					const textNode = comment.childNodes[0];
					const c = textNode.nodeValue.replace('/n', '\n');

					// 处理不同类型的弹幕
					const typeMap = { '1': 0, '4': 2, '5': 1, '6': 3 };
					if (typeMap.hasOwnProperty(p[1])) {
						const size = parseInt(p[2]) * fontSize / 25.0;
						const entry = [
							parseFloat(p[0]),         // 时间戳
							parseInt(p[4]),           // 弹幕池
							i,                        // 索引
							c,                        // 内容
							typeMap[p[1]],            // 类型映射
							parseInt(p[3]),           // 颜色
							size,                     // 字体大小
							(c.split('\n').length) * size, // 计算高度（修正后的逻辑）
							calculateLength(c) * size // 假设已实现 calculateLength
						];
						comments.push(entry);
					} else if (p[1] === '7') {
						comments.push([
							parseFloat(p[0]),
							parseInt(p[4]),
							i,
							c,
							'bilipos',
							parseInt(p[3]),
							parseInt(p[2]),
							0,
							0
						]);
					}
				}
			} catch (error) {
				console.warn('Invalid comment:', new XMLSerializer().serializeToString(comment));
			}
		});

		return comments.sort((a, b) => a[0] - b[0]); // 按时间戳排序
	}

	ReadCommentsBilibili2(xmlDoc, fontSize) {
		const comments = [];
		const commentElements = xmlDoc.getElementsByTagName('d');

		Array.from(commentElements).forEach((comment, i) => {
			try {
				const p = comment.getAttribute('p').split(',');
				if (p.length < 7) throw new Error('Invalid p attribute length');
				if (!['1', '4', '5', '6', '7', '8'].includes(p[3])) throw new Error('Invalid comment type');

				if (comment.childNodes.length > 0) {
					const time = parseFloat(p[2]) / 1000.0;  // 时间戳转换
					const textNode = comment.childNodes[0];
					const c = textNode.nodeValue.replace('/n', '\n');

					// 类型处理逻辑
					const typeMap = { '1': 0, '4': 2, '5': 1, '6': 3 };
					if (typeMap.hasOwnProperty(p[3])) {
						const size = parseInt(p[4]) * fontSize / 25.0;
						comments.push([
							time,                       // 转换后的时间戳
							parseInt(p[6]),             // 弹幕池
							i,                          // 原始索引
							c,                          // 内容文本
							typeMap[p[3]],              // 类型映射
							parseInt(p[5]),             // 颜色值
							size,                       // 计算后的字体大小
							(c.split('\n').length) * size,  // 高度计算
							calculateLength(c) * size   // 长度计算（需实现）
						]);
					} else if (p[3] === '7') {
						comments.push([
							time,
							parseInt(p[6]),
							i,
							c,
							'bilipos',                  // 特殊类型标识
							parseInt(p[5]),
							parseInt(p[4]),             // 字体大小原始值
							0,                          // 保留字段
							0                           // 保留字段
						]);
					}
				}
			} catch (error) {
				console.warn('Invalid comment:', new XMLSerializer().serializeToString(comment));
			}
		});

		return comments.sort((a, b) => a[0] - b[0]);  // 按时间排序
	}

	generateASS(
		comments,
		width,
		height,
		bottomReserved,
		fontFace,
		fontSize,
		alpha,
		durationMarquee,
		durationStill,
		reduced,
		progressCallback
	) {
		console.debug(`options: width ${width}, height ${height}, bottomReserved ${bottomReserved}, fontFace ${fontFace}, fontSize ${fontSize}, alpha ${alpha}, durationMarquee ${durationMarquee}, durationStill ${durationStill}, reduced ${reduced}`)
		// 生成随机样式ID (4位十六进制)
		const styleId = `Danmaku2ASS_${Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')}`;

		// 初始化行占用记录（4种弹幕类型 x 屏幕高度）
		const rows = Array.from({ length: 4 }, () =>
			new Array(height - bottomReserved + 1).fill(null)
		);

		// 写入 ASS 头部
		this.WriteASSHead(width, height, fontFace, fontSize, alpha, styleId);

		comments.forEach((comment, idx) => {
			// 进度回调（每处理 1000 条触发）
			if (progressCallback && idx % 1000 === 0) {
				progressCallback(idx, comments.length);
			}

			const [startTime, , , text, type] = comment;

			// 处理普通弹幕
			if (typeof type === 'number') {
				const rowMax = height - bottomReserved - comment[7];
				let placed = false;

				// 尝试寻找可用行
				for (let row = 0; row <= rowMax; row++) {
					const freeRows = this.TestFreeRows(rows, comment, row, width, height,
						bottomReserved, durationMarquee, durationStill);

					if (freeRows >= comment[7]) {
						this.MarkCommentRow(rows, comment, row);
						this.WriteComment(comment, row, width, height, bottomReserved,
							fontSize, durationMarquee, durationStill, styleId);
						placed = true;
						break;
					} else {
						row += freeRows || 1;
					}
				}

				// 未找到时的降级处理
				if (!placed && !reduced) {
					const altRow = this.FindAlternativeRow(rows, comment, height, bottomReserved);
					this.MarkCommentRow(rows, comment, altRow);
					this.WriteComment(comment, altRow, width, height, bottomReserved,
						fontSize, durationMarquee, durationStill, styleId);
				}
			}
			// 处理定位弹幕
			else if (type === 'bilipos') {
				this.WriteCommentBilibiliPositioned(comment, width, height, styleId);
			} else if (type === 'acfunpos') {
				//this.WriteCommentAcfunPositioned(comment, width, height, styleId);
			} else {
				console.warn(`Invalid comment type: ${JSON.stringify(comment)}`);
			}
		});

		// 最终进度回调
		if (progressCallback) {
			progressCallback(comments.length, comments.length);
		}

		return this.contents;
	}

	WriteASSHead(width, height, fontface, fontSize, alpha, styleId) {
		const alphaHex = (255 - Math.round(alpha * 255)).toString(16).padStart(2, '0');
		const outline = Math.max(fontSize / 25, 1).toFixed(0);

		this.contents += `[Script Info]
; Script generated by Danmaku2ASS
; https://github.com/m13253/danmaku2ass
Script Updated By: Danmaku2ASS (https://github.com/m13253/danmaku2ass)
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
Aspect Ratio: ${width}:${height}
Collisions: Normal
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${styleId}, ${fontface}, ${fontSize.toFixed(0)}, &H${alphaHex}FFFFFF, &H${alphaHex}FFFFFF, &H${alphaHex}000000, &H${alphaHex}000000, 1, 0, 0, 0, 100, 100, 0.00, 0.00, 1, ${outline}, 0, 7, 0, 0, 0, 0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
	}
	TestFreeRows(rows, c, row, width, height, bottomReserved, durationMarquee, durationStill) {
		let res = 0;
		const rowmax = height - bottomReserved;
		let targetRow = null;
		const commentType = c[4];

		// 处理静态弹幕（类型 1 或 2）
		if (commentType === 1 || commentType === 2) {
			while (row < rowmax && res < c[7]) {
				const currentRow = rows[commentType][row];
				if (currentRow !== targetRow) {
					targetRow = currentRow;
					// 检查时间重叠：现有弹幕结束时间 > 新弹幕开始时间
					if (targetRow && (targetRow[0] + durationStill) > c[0]) {
						break;
					}
				}
				row++;
				res++;
			}
		}
		// 处理滚动弹幕（其他类型）
		else {
			let thresholdTime;
			try {
				// 防止分母为 0 的情况
				const denominator = c[8] + width;
				thresholdTime = c[0] - durationMarquee * (1 - width / (denominator || 1));
			} catch (e) {
				thresholdTime = c[0] - durationMarquee;
			}

			while (row < rowmax && res < c[7]) {
				const currentRow = rows[commentType][row];
				if (currentRow !== targetRow) {
					targetRow = currentRow;
					if (targetRow) {
						try {
							// 计算冲突条件
							const existingDuration = targetRow[8] * durationMarquee / (targetRow[8] + width);
							if (targetRow[0] > thresholdTime || (targetRow[0] + existingDuration) > c[0]) {
								break;
							}
						} catch (e) {
							// 忽略计算错误继续检查
						}
					}
				}
				row++;
				res++;
			}
		}
		return res;
	}

	MarkCommentRow(rows, c, row) {
		const type = c[4];
		const rowArray = rows[type];
		const rowsToMark = Math.ceil(c[7]);
		const startRow = row;
		const endRow = Math.min(row + rowsToMark, rowArray.length);

		for (let i = startRow; i < endRow; i++) {
			rowArray[i] = c;
		}
	}

	WriteComment(c, row, width, height, bottomReserved, fontSize, durationMarquee, durationStill, styleId) {
		// 文本转义（需实现 ASSEscape 函数）
		const text = ASSEscape(c[3]);
		const styles = [];
		const commentType = c[4];
		let duration;

		// 处理弹幕位置样式
		switch (commentType) {
			case 1: // 顶部居中
				styles.push(`\\an8\\pos(${width / 2},${row})`);
				duration = durationStill;
				break;
			case 2: // 底部居中
				const convertedRow = convertType2(row, height, bottomReserved); // 需实现行号转换函数
				styles.push(`\\an2\\pos(${width / 2},${convertedRow})`);
				duration = durationStill;
				break;
			case 3: // 从右向左滚动
				const negLen = -Math.ceil(c[8]);
				styles.push(`\\move(${negLen},${row},${width},${row})`);
				duration = durationMarquee;
				break;
			default: // 默认从左向右滚动
				const _negLen = -Math.ceil(c[8]);
				styles.push(`\\move(${width},${row},${_negLen},${row})`);
				duration = durationMarquee;
		}

		// 处理字体大小
		if (Math.abs(c[6] - fontSize) >= 1) {
			styles.push(`\\fs${Math.round(c[6])}`);
		}

		// 处理颜色
		if (c[5] !== 0xffffff) {
			const colorCode = convertColor(c[5]); // 需实现颜色转换函数
			styles.push(`\\c&H${colorCode}&`);
			if (c[5] === 0x000000) {
				styles.push('\\3c&HFFFFFF&');
			}
		}

		// 生成时间戳（需实现 convertTimestamp 函数）
		const startTime = convertTimestamp(c[0]);
		const endTime = convertTimestamp(c[0] + duration);

		// 拼接 ASS 事件行
		this.contents += `Dialogue: 2,${startTime},${endTime},${styleId},,0000,0000,0000,,{${styles.join('')}}${text}\n`;
	}

	FindAlternativeRow(rows, c, height, bottomReserved) {
		const type = c[4]; // 弹幕类型
		const requiredRows = Math.ceil(c[7]); // 需要占用的行数
		const maxPossibleRow = height - bottomReserved - requiredRows;
		const maxRow = Math.max(0, maxPossibleRow); // 有效行号下限保护

		let earliestRow = 0;

		// 遍历所有可能的起始行
		for (let row = 0; row <= maxRow; row++) {
			// 发现空行直接返回
			if (!rows[type][row]) {
				return row;
			}
			// 记录最早出现的弹幕所在行
			if (rows[type][row][0] < rows[type][earliestRow][0]) {
				earliestRow = row;
			}
		}

		// 没有空行时返回最早的行（可能发生重叠）
		return earliestRow;
	}

	WriteCommentBilibiliPositioned(c, width, height, styleId) {
		// 定义 Bilibili 播放器原始尺寸（2014 版）
		const biliPlayerSize = [672, 438]; // [原始宽, 原始高]
		const zoomFactor = getZoomFactor(biliPlayerSize, [width, height]);

		// 解析弹幕定位参数（示例数据格式，需根据实际数据结构调整）
		const [startX, startY, endX, endY] = parsePositionParams(c);
		const scaledStartX = Math.round(startX * zoomFactor);
		const scaledStartY = Math.round(startY * zoomFactor);
		const scaledEndX = Math.round(endX * zoomFactor);
		const scaledEndY = Math.round(endY * zoomFactor);

		// 生成 ASS 移动动画样式
		const moveStyle = `\\move(${scaledStartX},${scaledStartY},${scaledEndX},${scaledEndY})`;

		// 拼接弹幕行
		this.contents += `Dialogue: 2,${convertTimestamp(c[0])},${convertTimestamp(c[0] + 5)},${styleId},,0000,0000,0000,,{${moveStyle}}${ASSEscape(c[3])}\n`;
	}
}

export default new DanmakuConverter();

// 示例辅助函数（需自行实现）
function calculateLength(text) {
	// 实现文字长度计算逻辑（例如基于字符数或像素宽度）
	return text.length;
}

function convertColor(rgb) {
	// 将 RGB 整数转换为 BGR 十六进制（ASS 格式要求）
	const b = (rgb >> 16) & 0xff;
	const g = (rgb >> 8) & 0xff;
	const r = rgb & 0xff;
	return (
		r.toString(16).padStart(2, '0') +
		g.toString(16).padStart(2, '0') +
		b.toString(16).padStart(2, '0')
	).toUpperCase();
}

function convertTimestamp(seconds) {
	// 将秒数转换为 H:MM:SS.cc 格式
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	seconds = seconds % 60;
	const ss = Math.floor(seconds);
	const cs = Math.round((seconds - ss) * 100);
	return `${hours}:${minutes.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

function ASSEscape(str) {
	// 转义 ASS 特殊字符
	return str.replace(/\\/g, '\\\\')
		.replace(/{/g, '\\{')
		.replace(/}/g, '\\}');
}

// 计算缩放因子（保持比例不变形）
function getZoomFactor(sourceSize, targetSize) {
	const [srcW, srcH] = sourceSize;
	const [tarW, tarH] = targetSize;

	// 计算宽高比例
	const ratioW = tarW / srcW;
	const ratioH = tarH / srcH;

	// 取最小比例确保内容完全可见
	return Math.min(ratioW, ratioH);
}

// 示例弹幕位置解析（需根据实际数据结构实现）
function parsePositionParams(c) {
	// 假设弹幕参数存储于 c[5] 字段，格式如 "100,200,300,400"
	const params = c[5].split(',').map(Number);
	return params.length === 4 ? params : [0, 0, 0, 0];
}

function convertType2(row, height, bottomReserved) {
	return height - bottomReserved - row;
}

/*
import danmakuConverter from './danmaku-converter.js';

// 使用示例
const generateASS = async () => {
  try {
    const assContent = await danmakuConverter.xml2ass(
      '123456',  // cid
      1920,       // width
      1080,       // height
      100,        // protect
      'SimHei',   // font
      36,         // fontsize
      0.8,        // alpha
      8,          // duration_marquee
      5,          // duration_still
      null,
      null,
      false
    );

    console.log(assContent);
    // 保存文件或处理生成的内容...
  } catch (error) {
    console.error('生成ASS失败:', error);
  }
};

generateASS();
*/
