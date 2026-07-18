import { File, Paths } from 'expo-file-system';
import { useEffect, useRef } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

import { initPcmRecorder, startPcmRecording, stopPcmRecording } from '@/lib/audioRecorder';
import { encodeWav } from '@/lib/wav';
import { getWhisperContext } from '@/lib/whisper';

// 说话超过这个时长会被强制打断，兜底用户忘记松手/一直按着的情况
const MAX_RECORDING_MS = 15000;

// 这三个参数既是录音参数，也是拼 WAV 头要用的参数，两边必须完全一致，
// 不然算出来的头跟实际数据对不上
const AUDIO_CONFIG = { sampleRate: 16000, channels: 1, bitsPerSample: 16 };

// whisper.rn 的 TranscribeOptions.prompt：用来给模型一个初始提示，引导它往这个场景的
// 词汇去识别（金额、消费分类），而不是当成没有上下文的通用一句话去转写。
// 分类列表直接从 confirmation.tsx 导入，避免这里的提示词跟 UI 上真实的分类列表脱节；
// 后面这串词是常见的记账场景词汇，进一步降低识别偏到无关内容的概率。
const TRANSCRIBE_PROMPT ="以下是包含消费金额的中文语音记录,数字统一使用阿拉伯数字。";

// 按住录音、松手用本地 whisper.rn 转写成文字（对比方案见 use-funasr-transcription.ts）。
// 只负责"录音 -> 文字"，不知道、也不关心转写完的文字之后要拿去做什么——
// 想在转写完成后做点什么（比如丢给 LLM 提取结构化信息），通过 onTranscribed 回调拿结果，
// 不要在这个文件里直接扎进别的 module（保持 STT 和 LLM 两个 module 各自独立，见 use-voice-expense.ts）。用法：
//   const { startListening, stopListening } = useWhisperTranscription(onTranscribed);
//   <Pressable onPressIn={startListening} onPressOut={stopListening} />
export function useWhisperTranscription(onTranscribed?: (text: string) => void) {
  // whisperContext 加载好之前先存到这个 ref 里，不放进 state 是因为它不参与渲染，
  // 用 ref 避免加载完成时触发一次不必要的重渲染
  const whisperContextRef = useRef<Awaited<ReturnType<typeof getWhisperContext>> | null>(null);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 这次录音收集到的 PCM 片段，松手时拼成一个完整 wav 文件
  const chunksRef = useRef<Uint8Array[]>([]);
  // 逻辑上"这次按压期间应不应该在录音"：按下时设 true，松手时设 false。
  // 用来防止重复触发 start，也用来判断松手时到底要不要真的停
  const isRecordingRef = useRef(false);
  // 原生录音是否已经真正启动。initPcmRecorder()/startPcmRecording() 之间要 await 原生桥，
  // 如果用户松手发生在这段时间内，此时调用 stop() 会打在还没真正开始录音的原生模块上。
  // 用这个 ref 记录"这次 start 真正落地了没"，配合 isRecordingRef 让 start/stop 谁后完成谁负责真正收尾
  const nativeReadyRef = useRef(false);

  useEffect(() => {
    // 模型已经跟着 App 打包了（见 src/lib/whisper.ts），这里只是把它加载进内存，
    // 仍然是异步的；如果组件在这期间被卸载（比如快速切页面），
    // 不能再把结果写进已经不再使用的 ref，否则会造成内存泄漏 / 状态错乱
    let cancelled = false;

    getWhisperContext().then((whisperContext) => {
      if (cancelled) return;
      whisperContextRef.current = whisperContext;
      console.log('Whisper 模型已就绪');
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

    // start() 还没真正跑完：这里不做任何事，等 startListening 里的 await 落地后，
    // 它自己会发现 isRecordingRef 已经变 false，转去调用 finishRecording()
    if (!nativeReadyRef.current) return;

    await finishRecording();
  };

  const finishRecording = async () => {
    nativeReadyRef.current = false;
    await stopPcmRecording();

    const pcmChunks = chunksRef.current;
    chunksRef.current = [];
    const totalBytes = pcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    console.log(`[Whisper] 录音结束，共 ${pcmChunks.length} 个 PCM chunk，共 ${totalBytes} 字节`);
    // 松手太快、什么都没录到的话没什么好转写的
    if (pcmChunks.length === 0) {
      console.log('[Whisper] 一个 chunk 都没收到，跳过转写（检查麦克风权限/录音是否真的启动了）');
      return;
    }

    const whisperContext = whisperContextRef.current;
    if (!whisperContext) {
      console.log('[Whisper] 模型还没准备好，跳过转写');
      return;
    }

    const wavBytes = encodeWav(pcmChunks, AUDIO_CONFIG);
    const file = new File(Paths.cache, `recording-${Date.now()}.wav`);
    try {
      file.create();
      file.write(wavBytes);
      console.log(`[Whisper] wav 文件已写入: ${file.uri}，大小 ${wavBytes.length} 字节`);

      console.log('[Whisper] 开始转写...');
      const startedAt = Date.now();
      const { promise } = whisperContext.transcribe(file.uri, {
        language: 'zh',
        prompt: TRANSCRIBE_PROMPT,
      });
      const transcribeResult = await promise;
      console.log(
        `[Whisper] 转写完成，耗时 ${Date.now() - startedAt}ms，完整结果:`,
        JSON.stringify(transcribeResult),
      );
      console.log('语音识别结果:', transcribeResult.result);

      if (transcribeResult.result.trim()) {
        onTranscribed?.(transcribeResult.result);
      }
    } catch (error) {
      console.log('[Whisper] 识别出错:', error);
    } finally {
      // 只是转写用的中间文件，识别完就没用了
      if (file.exists) file.delete();
    }
  };

  const startListening = async () => {
    // 避免松手前又按了一次导致重复 start
    if (isRecordingRef.current) return;

    if (Platform.OS === 'android') {
      // iOS 端的麦克风权限弹窗由系统在首次录音时自动触发（依赖 app.json 里配置的
      // NSMicrophoneUsageDescription），不需要我们手动请求；Android 则必须显式申请运行时权限。
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        console.log('[Whisper] 麦克风权限被拒绝');
        return;
      }
    }

    console.log('[Whisper] 按下麦克风，开始录音...');
    chunksRef.current = [];
    isRecordingRef.current = true;

    // 每次录音都要重新 init：底层 @fugood/react-native-audio-pcm-stream 原生模块，
    // 每次 stop() 之后，录音线程会在自己的 finally 块里把 recorder 置为 null（一次性用品），
    // 不重新 init 的话下一次 start() 会因为 recorder == null 直接静默不做任何事——
    // 表现就是第一次录音正常，从第二次开始永远收不到数据。
    // （这跟 whisper.rn 自带适配器那个"重复 init 会清空回调"的坑不是同一个问题：
    // 我们自己的 startPcmRecording 每次都会重新订阅数据回调，不存在回调被清空不恢复的情况）
    try {
      await initPcmRecorder(AUDIO_CONFIG);
    } catch (error) {
      console.log('[Whisper] 录音设备初始化失败:', error);
      isRecordingRef.current = false;
      return;
    }

    startPcmRecording((chunk) => {
      chunksRef.current.push(chunk);
    });
    nativeReadyRef.current = true;
    console.log('[Whisper] 已调用原生 start()');

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
