// @fugood/react-native-audio-pcm-stream 自带的 index.d.ts 里模块名写的是老包名
// "react-native-live-audio-stream"，跟实际 import 路径对不上，tsc 找不到类型声明。
// 这里按它 index.js 的真实实现重新声明一份：
// - init() 在 native 端接了一个 Promise 参数，真的是异步的（原来的声明写成了 void，
//   这是它的 bug；我们的代码就是因为没人 await 这个 promise，才在 AudioRecord 初始化失败时
//   完全看不到报错——init 失败了但没人知道）。
declare module '@fugood/react-native-audio-pcm-stream' {
  export interface AudioRecordOptions {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource?: number;
    bufferSize?: number;
  }

  export interface AudioRecordSubscription {
    remove: () => void;
  }

  interface AudioRecordModule {
    init: (options: AudioRecordOptions) => Promise<void>;
    start: () => void;
    stop: () => Promise<string>;
    on: (event: 'data', callback: (base64Data: string) => void) => AudioRecordSubscription;
  }

  const AudioRecord: AudioRecordModule;
  export default AudioRecord;
}
