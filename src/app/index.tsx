import { useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';

// 在这个项目里，@ 是路径别名，不是必须写法。tsconfig.json 里把 @/* 映射到了 ./src/*，所以：
import ConfirmationModal from '@/components/confirmation';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { getWhisperContext } from '@/lib/whisper';
import { encodeWav } from '@/lib/wav';
import { initPcmRecorder, startPcmRecording, stopPcmRecording } from '@/lib/audioRecorder';

// 说话超过这个时长会被强制打断，兜底用户忘记松手/一直按着的情况
const MAX_RECORDING_MS = 15000;

// 这三个参数既是录音参数，也是拼 WAV 头要用的参数，两边必须完全一致，
// 不然算出来的头跟实际数据对不上
const AUDIO_CONFIG = { sampleRate: 16000, channels: 1, bitsPerSample: 16 };

export default function HomeScreen() {
  const [modalVisible, setModalVisible] = useState(false);
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
      const { promise } = whisperContext.transcribe(file.uri, { language: 'zh' });
      const transcribeResult = await promise;
      console.log(
        `[Whisper] 转写完成，耗时 ${Date.now() - startedAt}ms，完整结果:`,
        JSON.stringify(transcribeResult),
      );
      console.log('语音识别结果:', transcribeResult.result);
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={safeAreaStyles.safeArea}>
        <ThemedView style={styles.heroSection}>
          {/* <AnimatedIcon /> */}
          <ThemedText type="title" style={styles.title}>
            说说花了多少钱
          </ThemedText>
        </ThemedView>
        <Pressable
          style={({ pressed }) => [styles.talkButton, pressed && styles.talkButtonPressed]}
          onPressIn={startListening}
          onPressOut={() => {
            stopListening();
            setModalVisible(true);
          }}
        >
          <ThemedText type="title">🎙️</ThemedText>
        </Pressable>
        <ConfirmationModal visible={modalVisible} onClose={() => setModalVisible(false)} />


        {Platform.OS === 'web' && <WebBadge />}
      </SafeAreaView>
    </ThemedView>
  );
}

export const safeAreaStyles = StyleSheet.create({
    safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },

  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  code: {
    textTransform: 'uppercase',
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  talkButton: {
    width: 96,
    height: 96,
    // 边框圆角
    borderRadius: 48,
    backgroundColor: '#ff7300',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6, // Android
  },
  talkButtonPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.85,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // 半透明黑色蒙层
  },
  modalCard: {
    width: '70%',      // 占屏幕宽度 70%，"中等大小"可以从这个比例调
    maxWidth: 360,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    gap: Spacing.three,
  },
});
