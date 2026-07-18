import { initWhisper } from 'whisper.rn';

type WhisperContext = Awaited<ReturnType<typeof initWhisper>>;

// 模型文件跟着 App 一起打包（Metro 把 require() 的 .bin 当资源处理，见 metro.config.js），
// 不再是运行时下载的：物理文件由 scripts/download-whisper-model.js 提前拉到本地，
// 那个脚本没跑过的话这里 require 会直接报“找不到模块”，提示很明确
const modelAsset = require('../../assets/models/ggml-base-zh.bin');

// 用一个模块级变量存 promise（而不是每次都新建）：
// initWhisper 会把模型加载进内存，是有内存/CPU 开销的操作，
// 整个 App 生命周期内应该只做一次；后续调用方（比如 index.tsx 里的组件重新挂载）
// 拿到的都是同一个已完成或进行中的 promise，不会重复加载模型。
let whisperContextPromise: Promise<WhisperContext> | null = null;

export function getWhisperContext(): Promise<WhisperContext> {
  if (whisperContextPromise) return whisperContextPromise;
  const created = initWhisper({ filePath: modelAsset });
  whisperContextPromise = created;
  return created;
}
