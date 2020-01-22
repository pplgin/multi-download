# `multi-donwload`

> Nodejs 多文件下载

## Usage

```
const DownloadManager = require('@pplgin/multi-download');

const downloader = new DownloadManager({
	timeout: 4000, // 下载文件超时时长
	maxLimit: 20 // 同时下载文件数
})


const fileUrls = [
	{
		filename: 'd24f617a-d02b-4dfb-81ae-c027d7454564.zip',
		fileUrl: 'https://img.pplgin.xyz/20200122162542/5ee6cc8499085.zip',
		decompression: true,
		decompDest: './test/t',
		downloadPath: './test'
	}
];

downloader.start(fileUrls, data => {
	console.log('progress', data.progress);
})
	.then(res => {
		console.log('success!', res);
	})
	.catch(err => {
		console.log('error!', err);
	});

```
