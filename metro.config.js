const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// react-native-sherpa-onnx 的 audio 模块会 require('buffer')，这是 Node 内置模块，RN 运行时没有。
// Metro 遇到这种 Node 核心模块名会直接拒绝解析（哪怕 node_modules 里装了同名包也不会自动生效），
// 必须显式告诉它用哪个包顶替。
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  buffer: require.resolve('buffer'),
};

// 把 .pte（ExecuTorch 模型文件）当成打包资源（而不是当源码去解析），
// 这样 src/hooks/use-expense-extractor.ts 里 require('.../qwen3-1.7b-ft-8da4w.pte')
// 才能被 Metro 认出来，让模型跟着 App 一起打包，不需要运行时联网下载
config.resolver.assetExts.push('pte');

// expo-sqlite 在 web 平台用 wasm 版的 sqlite（wa-sqlite.wasm），Metro 默认的 assetExts
// 不包含 wasm，不加这行 web 端打包会直接报 "Unable to resolve module ... wa-sqlite.wasm"
config.resolver.assetExts.push('wasm');

// 项目根目录下有个手动 git clone 下来的 whisper.cpp/（用来量化模型用的，跟 App 本身的
// 打包/运行没关系）。Metro 的文件监听器会递归监听项目根目录下所有文件，这个仓库体积很大、
// git 内部文件churn 又很频繁，监听器在 Windows 上曾经因为读到 git 操作过程中一闪而过的
// 临时文件（.git 目录里类似 tlhT3xn 这种）而直接崩溃报 EACCES。
//
// optimum-executorch/.venv/ 是同样的问题：这个 Python venv 是在 WSL/Linux 下创建的，
// 里面的 lib64 是指向 lib 的符号链接——Windows 原生跑的 Metro 用 fs.lstat 读不了这种
// WSL 建的符号链接，直接 EACCES 把整个文件监听器崩掉（跟这条要解决的是同一类问题：
// 项目里有非 JS 用途的大目录，不该被 Metro 扫到）。
// 加进 blockList 让 Metro 完全无视这两个目录。
config.resolver.blockList = [
  ...config.resolver.blockList,
  /whisper\.cpp[\\/].*/,
  /optimum-executorch[\\/].*/,
];

module.exports = config;
