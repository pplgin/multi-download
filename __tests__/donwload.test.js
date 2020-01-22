'use strict';

const DownloadManager = require('../lib/index');

const fileUrls = [
	{
		filename: '02d312ddd7dfd.zip',
		fileUrl: 'https://img.pplgin.xyz/20200122165005/02d312ddd7dfd.zip',
		decompression: true,
		decompDest: './test/t',
		downloadPath: './test'
	}, {
		filename: 'test.mp3',
		fileUrl: 'https://img.pplgin.xyz/20200122164853/cce5e867494c1.mp3',
		decompDest: './test/t',
		downloadPath: './test'
	}
];

const s = new DownloadManager();

s.start(fileUrls, data => {
	console.log('data', data.progress);
})
	.then(res => {
		console.log('res', res);
	})
	.catch(err => {
		console.log('err', err);
	});
