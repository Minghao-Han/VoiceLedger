import { useEffect, useRef } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

import { initPcmRecorder, startPcmRecording, stopPcmRecording } from '@/lib/audioRecorder';
import { getSttEngine } from '@/lib/funasr';

// 说话超过这个时长会被强制打断，兜底用户忘记松手/一直按着的情况
const MAX_RECORDING_MS = 15000;

const AUDIO_CONFIG = { sampleRate: 16000, channels: 1, bitsPerSample: 16 };

// sherpa-onnx 的 transcribeSamples() 直接吃 [-1, 1] 区间的浮点采样，不像 whisper.rn
// 那条路线需要先拼一个 wav 文件——省掉了写文件/删文件这一步
function pcmChunksToFloatSamples(chunks: Uint8Array[]): number[] {
  const samples: number[] = [];
  for (const chunk of chunks) {
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    for (let i = 0; i + 1 < chunk.length; i += 2) {
      samples.push(view.getInt16(i, true) / 32768);
    }
  }
  return samples;
}

// 按住录音、松手用 FunASR（SenseVoice，经 sherpa-onnx 跑在本地）转写成文字，
// 跟 use-voice-transcription.ts（whisper.rn 方案）是两套独立实现，方便对比效果、随时切换。用法：
//   const { startListening, stopListening } = useFunasrTranscription();
//   <Pressable onPressIn={startListening} onPressOut={stopListening} />
export function useFunasrTranscription() {
  // sttEngine 加载好之前先存到这个 ref 里，不放进 state 是因为它不参与渲染，
  // 用 ref 避免加载完成时触发一次不必要的重渲染
  const sttEngineRef = useRef<Awaited<ReturnType<typeof getSttEngine>> | null>(null);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 这次录音收集到的 PCM 片段，松手时转成浮点采样数组喂给 sherpa-onnx
  const chunksRef = useRef<Uint8Array[]>([]);
  // 逻辑上"这次按压期间应不应该在录音"：按下时设 true，松手时设 false。
  // 用来防止重复触发 start，也用来判断松手时到底要不要真的停
  const isRecordingRef = useRef(false);
  // 原生录音是否已经真正启动，配合 isRecordingRef 让 start/stop 谁后完成谁负责真正收尾
  // （详细原因见 use-voice-transcription.ts 里的同名 ref 注释，这里逻辑完全一样）
  const nativeReadyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    getSttEngine((percent) => {
      console.log(`[FunASR] 模型下载中: ${percent}%`);
    })
      .then((sttEngine) => {
        if (cancelled) return;
        sttEngineRef.current = sttEngine;
        console.log('FunASR 模型已就绪');
      })
      .catch((error) => {
        console.log('[FunASR] 模型加载失败:', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stopListening = async () => {
    if (autoStopTimer.current) {
      clearTimeout(autoStopTimer.current);
      autoStopTimer.current = null;
    }
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;

    if (!nativeReadyRef.current) return;

    await finishRecording();
  };

  const finishRecording = async () => {
    nativeReadyRef.current = false;
    await stopPcmRecording();

    const pcmChunks = chunksRef.current;
    chunksRef.current = [];
    const totalBytes = pcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    console.log(`[FunASR] 录音结束，共 ${pcmChunks.length} 个 PCM chunk，共 ${totalBytes} 字节`);
    if (pcmChunks.length === 0) {
      console.log('[FunASR] 一个 chunk 都没收到，跳过转写（检查麦克风权限/录音是否真的启动了）');
      return;
    }

    const sttEngine = sttEngineRef.current;
    if (!sttEngine) {
      console.log('[FunASR] 模型还没准备好，跳过转写');
      return;
    }

    try {
      const samples = pcmChunksToFloatSamples(pcmChunks);
      console.log('[FunASR] 开始转写...');
      const startedAt = Date.now();
      const result = await sttEngine.transcribeSamples(samples, AUDIO_CONFIG.sampleRate);
      console.log(
        `[FunASR] 转写完成，耗时 ${Date.now() - startedAt}ms`
      );
      console.log('语音识别结果:', result.text);
    } catch (error) {
      console.log('[FunASR] 识别出错:', error);
    }
  };

  const startListening = async () => {
    // 避免松手前又按了一次导致重复 start
    if (isRecordingRef.current) return;

    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        console.log('[FunASR] 麦克风权限被拒绝');
        return;
      }
    }

    console.log('[FunASR] 按下麦克风，开始录音...');
    chunksRef.current = [];
    isRecordingRef.current = true;

    // 每次录音都要重新 init，原因见 use-voice-transcription.ts 里同一段逻辑的注释：
    // 底层原生模块每次 stop() 之后会把 recorder 置空，不重新 init 就收不到数据
    try {
      await initPcmRecorder(AUDIO_CONFIG);
    } catch (error) {
      console.log('[FunASR] 录音设备初始化失败:', error);
      isRecordingRef.current = false;
      return;
    }

    startPcmRecording((chunk) => {
      chunksRef.current.push(chunk);
    });
    nativeReadyRef.current = true;
    console.log('[FunASR] 已调用原生 start()');

    // 这段 await 期间用户已经松手了：那次 stopListening 调用当时发现 nativeReadyRef
    // 还是 false，什么都没做，真正的收尾工作补在这里做
    if (!isRecordingRef.current) {
      await finishRecording();
      return;
    }

    autoStopTimer.current = setTimeout(stopListening, MAX_RECORDING_MS);
  };

  return { startListening, stopListening };
}
