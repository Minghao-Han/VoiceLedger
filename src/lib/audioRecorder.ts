import AudioRecord from '@fugood/react-native-audio-pcm-stream';
import { Buffer } from 'buffer';

export type PcmAudioConfig = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
};

// Android 的 MediaRecorder.AudioSource 常量。默认的 6 (VOICE_RECOGNITION) 在部分国产
// 定制 ROM（实测 vivo OriginOS）上会被系统拒绝给第三方 App 用，AudioRecord 初始化直接失败——
// 但 @fugood/react-native-audio-pcm-stream 和 whisper.rn 的 AudioPcmStreamAdapter 都没把
// 这个失败往外传，表现就是“看起来全流程正常，但一个字节数据都收不到”。1 (MIC) 是最基础、
// 兼容性最好的音源，不需要任何特殊授权。
const ANDROID_MIC_AUDIO_SOURCE = 1;

let dataSubscription: { remove: () => void } | null = null;

// 之前直接用 whisper.rn 自带的 AudioPcmStreamAdapter，踩了两个坑：
// 1. 它的 initialize() 不会 await 原生 init() 的 promise，原生初始化失败时完全不会报错。
// 2. 它的 initialize() 如果发现自己已经 init 过会先调用 release()，而 release() 会把
//    onData/onError 回调清空且不恢复，导致第二次录音开始就再也收不到数据了。
// 这里直接对接底层库，自己控制 init 只做一次、真正 await 它、失败了就让错误正常往外抛。
export async function initPcmRecorder(config: PcmAudioConfig): Promise<void> {
  await AudioRecord.init({
    sampleRate: config.sampleRate,
    channels: config.channels,
    bitsPerSample: config.bitsPerSample,
    audioSource: ANDROID_MIC_AUDIO_SOURCE,
  });
}

export function startPcmRecording(onChunk: (chunk: Uint8Array) => void): void {
  // 原生 data 事件给的是 base64 字符串，不是 Uint8Array，这里手动解码
  dataSubscription?.remove();
  dataSubscription = AudioRecord.on('data', (base64Data: string) => {
    onChunk(new Uint8Array(Buffer.from(base64Data, 'base64')));
  });
  AudioRecord.start();
}

export async function stopPcmRecording(): Promise<void> {
  await AudioRecord.stop();
  dataSubscription?.remove();
  dataSubscription = null;
}
