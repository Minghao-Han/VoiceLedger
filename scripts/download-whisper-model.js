#!/usr/bin/env node

// 把 Whisper 模型打进 App 里（Metro 用 require() 静态引用打包资源）需要这个文件在
// build 之前就物理存在于 assets/ 目录下。模型本身有几十上百 MB，不提交进 git（见 .gitignore），
// 所以每台开发机 / 每次 clone 仓库后都要跑一次这个脚本把它下载下来。
// 已经下载过就跳过，可以放心重复执行（比如挂在 postinstall 里）。

const fs = require('fs');
const https = require('https');
const path = require('path');

// wabisabisocial/whisper-base-mandarin-ggml：社区用中文数据微调过的 base 模型，
// 体积跟官方 base 档位相近，试一下中文场景下比官方通用 base 模型准不准。
// 没有基准测试数据，效果好不好得靠实测（见 SPEECH_TO_TEXT.md 里的取舍记录）。
const modelFileName = 'ggml-base-zh.bin';
const modelDir = path.join(__dirname, '..', 'assets', 'models');
const modelPath = path.join(modelDir, modelFileName);
const modelUrl = `https://huggingface.co/wabisabisocial/whisper-base-mandarin-ggml/resolve/main/${modelFileName}`;

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const tmpPath = `${destPath}.download`;
    const file = fs.createWriteStream(tmpPath);

    https
      .get(url, (res) => {
        // huggingface.co 用 302 跳到实际的 CDN 地址，Node 的 https.get 不会自动跟
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          fs.unlinkSync(tmpPath);
          download(res.headers.location, destPath).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(tmpPath);
          reject(new Error(`下载失败，状态码 ${res.statusCode}: ${url}`));
          return;
        }

        const total = Number(res.headers['content-length']) || 0;
        let downloaded = 0;
        let lastLoggedPercent = -1;

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const percent = Math.floor((downloaded / total) * 100);
            if (percent !== lastLoggedPercent && percent % 10 === 0) {
              lastLoggedPercent = percent;
              console.log(`下载 Whisper 模型: ${percent}%`);
            }
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            fs.renameSync(tmpPath, destPath);
            resolve();
          });
        });
      })
      .on('error', (error) => {
        file.close();
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        reject(error);
      });
  });
}

async function main() {
  if (fs.existsSync(modelPath)) {
    console.log(`Whisper 模型已存在，跳过下载: ${modelPath}`);
    return;
  }

  fs.mkdirSync(modelDir, { recursive: true });
  console.log(`开始下载 Whisper 模型到 ${modelPath} ...`);
  await download(modelUrl, modelPath);
  console.log('Whisper 模型下载完成');
}

main().catch((error) => {
  console.error('下载 Whisper 模型失败:', error);
  process.exit(1);
});
