import { ensureModelByCategory, ModelCategory, refreshModelsByCategory } from 'react-native-sherpa-onnx/download';
import { createSTT, type SttEngine } from 'react-native-sherpa-onnx/stt';

// sherpa-onnx 官方转换的 SenseVoice 多语言 int8 量化模型（阿里 FunASR 出品，支持中/英/日/韩/粤）。
// 跟 whisper.rn 那条路线不一样：这个模型不打包进 App 安装包，而是首次启动时联网下载一次
// （压缩包约 160MB，下载后解压存在 App 自己的 Documents 目录里），之后就是离线的了。
// 之所以不用打包方案：这个库的 "asset" 类型模型要求把文件手动放进原生 android/app/src/main/assets
// 目录，而这个目录是 Expo prebuild 每次都会重新生成的，手动放的文件会被清掉，不适合托管工作流。
const MODEL_ID = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09';

let sttEnginePromise: Promise<SttEngine> | null = null;

export function getSttEngine(onProgress?: (percent: number) => void): Promise<SttEngine> {
  if (sttEnginePromise) return sttEnginePromise;

  // ensureModelByCategory() 只会在本地磁盘缓存的模型目录里查 id，从来不会自己联网拉取；
  // 这个缓存得先显式调用 refreshModelsByCategory() 去 GitHub Release 上抓一次真实的
  // asset 列表才会有内容。不刷新的话，随便传什么 id 都会报 "Unknown model id"。
  const created = refreshModelsByCategory(ModelCategory.Stt)
    .then(() =>
      ensureModelByCategory(ModelCategory.Stt, MODEL_ID, {
        onProgress: onProgress ? (progress) => onProgress(progress.percent) : undefined,
      }),
    )
    .then(({ localPath }) =>
      createSTT({
        modelPath: { type: 'file', path: localPath },
        modelType: 'sense_voice',
        preferInt8: true,
        modelOptions: {
          senseVoice: {
            language: 'zh',
            // 把"三十五"这种口语数字自动转成"35"——记账场景里金额基本靠这个转成数字
            useItn: true,
          },
        },
      }),
    );

  sttEnginePromise = created;
  return created;
}
