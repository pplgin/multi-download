const http = require('http');
const https = require('https');
const url = require('url');
const { ERROR_RESPONSE_DOWNLOAD_FILE, ERROR_RESPONSE_DOWNLOAD_FILE_CONTENT_LENGTH } = require('./constants').errors;

const uuid = () =>
	Math.random()
		.toString(36)
		.substr(2, 9);
/**
 * 请求文件，并写入指定 writable stream
 * @param {Object} params 请求选项
 * @param {WriteStream} fileWriteStream 写入流
 * @param {Function} progressEventEmitter 进度发射器
 */
exports.fetchFile = function({ fileUrl, stream, currentSize, progress, timeout }, requestList = {}) {
	return new Promise((resolve, reject) => {
		const options = url.parse(fileUrl);
		if (currentSize !== 0) {
			options.headers = {
				range: `bytes=${currentSize}-`
			};
		}
		const protocol = options.protocol === 'https:' ? https : http;
		const reqId = uuid();
		const req = protocol
			.get(options)
			.on('response', res => {
				if (res.statusCode < 200 || res.statusCode >= 300) {
					return reject(new Error(ERROR_RESPONSE_DOWNLOAD_FILE));
				}
				res.pipe(stream);
				res.on('data', chunk => {
					if (progress && typeof progress === 'function') {
						progress(chunk.length);
					}
				});
				// 校验文件完整性
				stream.on('close', () => {
					if (res.complete) {
						resolve();
					}
				});
				res.on('error', reject);
			})
			.on('error', reject);
		// 设置请求超时时间
		req.setTimeout(timeout);
		req.on('timeout', () => {
			reject(new Error('DONWLOAD_TIME_OUT'));
		});
		requestList[reqId] = req;
	});
};

/**
 * 请求文件大小
 * @param {Object} params 请求选项
 */
exports.fetchFileSize = function(fileUri, requestList = {}) {
	const { protocol } = url.parse(fileUri);
	return new Promise((resolve, reject) => {
		const _protocol = protocol === 'https:' ? https : http;
		const reqId = uuid();
		const req = _protocol
			.get(fileUri)
			.on('response', res => {
				if (res.statusCode < 200 || res.statusCode >= 300) {
					reject(new Error(`Response ${fileUri} Error: ${res.statusCode}`));
					return;
				}
				const contentLength = parseInt(res.headers['content-length'], 10);
				const contentMd5 = res.headers['content-md5'];
				resolve({
					contentLength,
					contentMd5
				});
				req.abort();
				delete requestList[reqId];
			})
			.on('error', reject);
		requestList[reqId] = req;
	});
};
