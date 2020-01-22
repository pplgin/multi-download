const fs = require('fs');
const crypt = require('crypto');
const AdmZip = require('adm-zip');

const { ERROR_DECOMPRESS_FAIL } = require('./constants').errors;

/**
 * 函数节流
 * @param {function} fn 待处理函数
 * @param {number} wait  延迟时间
 */
function throttle(func, wait) {
	let timeout, context, args;
	let previous = 0;
	let later = function() {
		previous = new Date().getTime();
		timeout = null;
		func.apply(context, args);
		if (!timeout) context = args = null;
	};

	return function() {
		let now = new Date().getTime();
		if (!previous) previous = now;
		let remaining = wait - (now - previous);
		context = this;
		args = arguments;
		if (remaining <= 0 || remaining > wait) {
			if (timeout) {
				clearTimeout(timeout);
				timeout = null;
			}
			previous = now;
			func.apply(context, args);
			if (!timeout) context = args = null;
		} else if (!timeout) {
			timeout = setTimeout(later, remaining);
		}
	};
}

/**
 * @param {String} path 路径
 */
function getFilesize(path) {
	if (!fs.existsSync(path)) {
		throw new Error('路径不存在');
	}
	const stat = fs.statSync(path);
	return stat.size;
}

/**
 * @param {String} path 路径
 */
function existsPromise(path) {
	return new Promise(resolve => {
		fs.access(path, err => {
			if (!err) {
				resolve(true);
			}
			resolve(false);
		});
	});
}

/**
 * @param {String} path 路径
 */
const statPromise = function(path) {
	return new Promise(resolve => {
		fs.stat(path, (err, stats) => {
			if (err) {
				return resolve(0);
			}
			resolve(stats.size);
		});
	});
};

/**
 * @param {String} filePath 要解压的文件的完整路径
 * @param {String} targetPath 文件解压到该目录
 */
function decompress(filePath, targetPath) {
	if (!fs.existsSync(filePath)) {
		throw new Error(`解压文件失败，文件不存在,${filePath}`);
	}

	// 这里由于不知道解压时候会报啥错误，所以自己catch自己抛
	try {
		const zip = new AdmZip(filePath);
		zip.extractAllTo(targetPath);
	} catch (error) {
		throw new Error(ERROR_DECOMPRESS_FAIL);
	}
}

/**
 * 获取文件md5 hash
 * @param {文件流} file
 */
function getMD5HashFromFile(file) {
	return crypt
		.createHash('md5')
		.update(file)
		.digest('base64');
}

/**
 * 计算速度
 * @param {string} bytes
 * @param {number} decimals
 */
function bytesToSize(bytes, decimals = 2) {
	if (bytes == 0) return '0 Bytes';
	let k = 1000,
		sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
		i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * 删除文件
 * @param {String} filePath
 */
function deleteFile(filePath) {
	const isExists = fs.existsSync(filePath);
	if (!isExists) return;
	if (fs.lstatSync(filePath).isDirectory()) {
		fs.readdirSync(filePath).forEach(file => {
			let curPath = `${filePath}/${file}`;
			if (fs.lstatSync(curPath).isDirectory()) {
				return deleteFile(curPath);
			}
			fs.unlinkSync(curPath);
		});
		fs.rmdirSync(filePath);
		return;
	}
	fs.unlinkSync(filePath);
}

module.exports = {
	deleteFile,
	getFilesize,
	decompress,
	existsPromise,
	statPromise,
	getMD5HashFromFile,
	bytesToSize,
	throttle
};
