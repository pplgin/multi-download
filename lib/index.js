const path = require('path');
const mkdirP = require('mkdirp');
const { getMD5HashFromFile, bytesToSize, throttle, deleteFile, statPromise, decompress } = require('./utils/tools');
const DOWNLOAD_LOADING = 'DOWNLOAD_LOADING';
const DOWNLOAD_SUCCESS = 'DOWNLOAD_SUCCESS';
const ERROR_FILE_IS_BROKEN = 'FILE_IS_BROKEN'

const fs = require('fs');
const { fetchFileSize, fetchFile } = require('./utils/request');

// 计算下载速度
const receivedBytes = [0];

class DownloadManager {
	constructor(opts) {
		this.options = Object.assign(
			{
				timeout: 4000, // 下载文件超时时长
				maxLimit: 5,
				trackEvent: (file, type) => null
			},
			opts
		);
		// 下载总大小
		this.fileTotalSize = 0;
		// 已下载大小
		this.fileDownloadedSize = 0;
		// 下载速度
		this.speedValue = 0;
		// 延迟计算
		this.__throttleCalcSpeed = throttle(this.__handleCalcSpeed.bind(this), 1000);

		// 下载队列
		this.fileDownloadQueue = [];

		// 待解压队列
		this.decompressionQueue = [];

		// 请求队列
		this.requestQueue = {};

		// 下载进度回调
		this.__progressCb = null;
	}
	/**
	 *
	 * @param {Array} files 下载文件队列
	 */
	start(files, progressCb) {
		if (!Array.isArray(files)) {
			throw new Error('files must be Array!');
		}
		// record download progress callback
		if (progressCb && typeof progressCb === 'function') {
			this.__progressCb = progressCb;
		}

		// pre handle donwload list
		this.fileDownloadQueue = files.map(file => {
			if (file.decompression) {
				this.decompressionQueue.push(file);
			}
			return file;
		});

		// 获取所有文件的总大小
		return this.__getFilesRemoteSize()
			.then(this.__getFilesLocleSize.bind(this))
			.then(fileDownloadedSize => {
				this.fileDownloadedSize = fileDownloadedSize;
				if (this.fileDownloadQueue.length) {
					return this.__downloadFiles();
				}
				// 已经下载完成了
				this.__handleDownloadProgress(0, true);
			})
			.then(this.__handleDecompression.bind(this))
			.then(this.__clearAllQueue.bind(this))
			.catch(err => {
				// 清空所有状态
				this.__clearAllQueue();
				throw err;
			});
	}

	/**
	 * 停止下载清理
	 */
	stop() {
		this.__clearAllQueue();
	}

	/**
	 * 获取文件本地大小
	 */
	async __getFilesLocleSize() {
		try {
			const waitingQueryQueue = this.fileDownloadQueue.map(file => {
				// 获取所有下载路径后去重，提前创建目录
				const { downloadPath, filename } = file;
				if (!fs.existsSync(downloadPath)) {
					mkdirP.sync(downloadPath);
				}
				return statPromise(path.resolve(downloadPath, filename)).then(size => {
					file.currentSize = size;
					return file;
				});
			});
			let fileDownloadedSize = 0;
			const files = await Promise.all(waitingQueryQueue);
			files.forEach(file => {
				const { downloadPath, filename, currentSize, totalSize, contentMd5 } = file;
				// 文件大小相等
				if (currentSize < totalSize) {
					fileDownloadedSize += currentSize;
					return;
				}
				// 校验文件
				const filePath = path.resolve(downloadPath, filename);
				if (contentMd5 && this.checkIsBroken({ filePath, contentMd5 })) {
					deleteFile(filePath);
					file.currentSize = 0;
					return;
				}
				// 已下载大小 从下载队列中移除
				let idx = this.fileDownloadQueue.findIndex(v => v.filename === filename);
				this.fileDownloadQueue.splice(idx, 1);
				fileDownloadedSize += currentSize;
			});
			return fileDownloadedSize;
		} catch (error) {
			throw error;
		}
	}

	/**
	 * 获取文件的总大小
	 */
	async __getFilesRemoteSize() {
		try {
			const waitingQueryQueue = this.fileDownloadQueue.map(file =>
				fetchFileSize(file.fileUrl, this.requestQueue).then(res => {
					file.contentMd5 = res.contentMd5;
					file.totalSize = res.contentLength;
					return res.contentLength;
				})
			);
			const sizes = await Promise.all(waitingQueryQueue);
			this.fileTotalSize = sizes.reduce((total, size) => total + size, 0);
			return this.fileTotalSize;
		} catch (error) {
			throw error;
		}
	}

	/**
	 * 批量下载
	 */
	__downloadFiles() {
		let maxJobs = Math.min(this.options.maxLimit, this.fileDownloadQueue.length);
		return new Promise((resolve, reject) => {
			while (maxJobs) {
				this.__handleDownloadFile(resolve, reject);
				maxJobs--;
			}
		});
	}

	/**
	 * 文件下载
	 * @param {Object}} fileInfo
	 */
	__handleDownloadFile(_resolve, _reject) {
		// 判断是否还有未处理的操作
		const nextJob = this.fileDownloadQueue.find(v => v.status !== DOWNLOAD_LOADING);
		if (!nextJob) return;
		const { fileUrl, downloadPath, filename, contentMd5, currentSize } = nextJob;
		const filePath = path.resolve(downloadPath, filename);
		const stream = fs.createWriteStream(filePath, { flags: 'a' });

		// 待下载对象上打
		nextJob.status = DOWNLOAD_LOADING;
		fetchFile(
			{
				timeout: this.options.timeout,
				fileUrl,
				filePath,
				currentSize,
				stream,
				progress: this.__handleDownloadProgress.bind(this)
			},
			this.requestQueue
		)
			.then(() => {
				// 下载完成校验文件完整性
				if (contentMd5 && this.checkIsBroken({ filePath, contentMd5 })) {
					// 删除文件
					deleteFile(filePath);
					throw new Error(ERROR_FILE_IS_BROKEN);
				}
				// 打点相关
				this.options.trackEvent(
					{
						...nextJob,
						status: DOWNLOAD_SUCCESS
					},
					'download'
				);
				const idx = this.fileDownloadQueue.findIndex(v => v.filename === nextJob.filename);
				if (idx >= 0) {
					this.fileDownloadQueue.splice(idx, 1);
				}
				if (!this.fileDownloadQueue.length) {
					return _resolve();
				}
				this.__handleDownloadFile(_resolve, _reject);
			})
			.catch(err => {
				_reject(err);
			});
	}

	/**
	 * 下载进度
	 * @param {当前下载大小}} chunkSize
	 */
	__handleDownloadProgress(chunkSize, immediate = false) {
		this.fileDownloadedSize += chunkSize;
		if (!immediate) {
			this.__throttleCalcSpeed(this.fileDownloadedSize);
		}
		if (this.__progressCb) {
			this.__progressCb({
				speed: bytesToSize(this.speedValue) + '/sec',
				chunkSize: this.fileDownloadedSize,
				totalSize: this.fileTotalSize,
				progress: ((100.0 * this.fileDownloadedSize) / this.fileTotalSize).toFixed(2)
			});
		}
	}

	/**
	 * 计算每秒的下载大小
	 * @param {当前大小}} bytes
	 */
	__handleCalcSpeed(bytes) {
		receivedBytes.push(bytes);
		if (receivedBytes.length >= 2) {
			this.previousReceivedBytes = receivedBytes.shift();
			this.speedValue = Math.abs(this.previousReceivedBytes - receivedBytes[0]);
		}
	}

	/**
	 * 清空下载队列
	 */
	__clearAllQueue() {
		// stop all request
		if (Object.keys(this.requestQueue).length) {
			Object.values(this.requestQueue).forEach(req => req.abort());
		}
		this.fileDownloadQueue = [];
		this.decompressionQueue = [];
		this.speedValue = 0;
		this.fileTotalSize = 0;
		this.fileDownloadedSize = 0;
		this.requestQueue = {};
	}

	/**
	 * 文件解压
	 *
	 */
	__handleDecompression() {
		return new Promise((resolve, reject) => {
			try {
				while (this.decompressionQueue.length) {
					const watingForDecompressFile = this.decompressionQueue.pop();
					const { decompDest, downloadPath, filename } = watingForDecompressFile;
					const filePath = path.resolve(downloadPath, filename);
					decompress(filePath, decompDest);
					// 打点相关
					this.options.trackEvent(watingForDecompressFile, 'decompress');
				}
				resolve();
			} catch (err) {
				reject(err);
			}
		});
	}

	/**
	 *
	 * @param {string} filePath
	 * @param {string} contentMd5 文件Md5
	 */
	checkIsBroken({ filePath, contentMd5 }) {
		if (!contentMd5 && !filePath) return true;
		try {
			return getMD5HashFromFile(fs.readFileSync(filePath)) !== contentMd5;
		} catch (error) {
			return false;
		}
	}
}

module.exports = DownloadManager;
