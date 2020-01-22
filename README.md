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
		filename: '',
		fileUrl: '',
		decompression: true,
		decompDest: './test/t',
		downloadPath: './test'
	}
];

downloader.start(fileUrls, data => {
	console.log('progress', data.progress);
})
.then(res => { console.log('success!', res); })
.catch(err => {
	console.log('error!', err);
});
```
