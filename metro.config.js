const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// whisper.rn 的 package.json "exports" 字段只有一条 "./*" 通配符映射，没有给包根路径
// （"."）单独定义 export，按 Node "exports" 规范严格解析的话，连 `import { initWhisper }
// from 'whisper.rn'` 这种最基础的写法都解析不出来。
// 不能像以前那样直接全局关掉 Metro 的 package exports 解析——react-native-sherpa-onnx
// 的 exports 字段是规范写的（"./stt"、"./download" 这些子路径都没有物理文件兜底，
// 全靠 exports 映射），全局关掉会直接解析不出来。所以只针对 whisper.rn 这一个包单独
// 关掉 exports 解析（用它 package.json "react-native" 字段指向的物理路径），
// 其他包（包括 react-native-sherpa-onnx）走 Metro 默认的 exports 解析。
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'whisper.rn') {
    return context.resolveRequest(
      { ...context, unstable_enablePackageExports: false },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

// whisper.rn 依赖的 safe-buffer 会 require('buffer')，这是 Node 内置模块，RN 运行时没有。
// Metro 遇到这种 Node 核心模块名会直接拒绝解析（哪怕 node_modules 里装了同名包也不会自动生效），
// 必须显式告诉它用哪个包顶替。
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  buffer: require.resolve('buffer'),
};

// 把 Whisper 的 .bin 模型文件当成打包资源（而不是当源码去解析），
// 这样 src/lib/whisper.ts 里的 require('.../ggml-tiny.bin') 才能被 Metro 认出来，
// 让模型跟着 App 一起打包，不需要运行时联网下载
config.resolver.assetExts.push('bin');

// expo-sqlite 在 web 平台用 wasm 版的 sqlite（wa-sqlite.wasm），Metro 默认的 assetExts
// 不包含 wasm，不加这行 web 端打包会直接报 "Unable to resolve module ... wa-sqlite.wasm"
config.resolver.assetExts.push('wasm');

// 项目根目录下有个手动 git clone 下来的 whisper.cpp/（用来量化模型用的，跟 App 本身的
// 打包/运行没关系）。Metro 的文件监听器会递归监听项目根目录下所有文件，这个仓库体积很大、
// git 内部文件churn 又很频繁，监听器在 Windows 上曾经因为读到 git 操作过程中一闪而过的
// 临时文件（.git 目录里类似 tlhT3xn 这种）而直接崩溃报 EACCES。
// 加进 blockList 让 Metro 完全无视这个目录。
config.resolver.blockList = [
  ...config.resolver.blockList,
  /whisper\.cpp[\\/].*/,
];

module.exports = config;
