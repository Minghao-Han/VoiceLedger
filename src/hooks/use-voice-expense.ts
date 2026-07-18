import { useCallback } from 'react';

import { useExpenseExtractor } from './use-expense-extractor';
import { useFunasrTranscription } from './use-funasr-transcription';
import { useWhisperTranscription } from './use-voice-transcription';

// 语音识别引擎切换开关：想换回 whisper.rn 就把这行改成 'whisper'。
// 两套实现是完全独立的（use-voice-transcription.ts / use-funasr-transcription.ts），
// 谁都不依赖谁，改这一行就能整体切换，不用动业务代码。
const VOICE_ENGINE: 'whisper' | 'funasr' = 'funasr';

// 用哪个引擎在模块加载时就定下来、之后不会再变，所以把"选哪个 hook"提到组件外面、
// 只留一次 hook 调用给 React——这样才不会一会儿调用两个 hook、一会儿调用一个，
// 违反 hooks 的调用规则（同时也避免两个引擎的模型都被加载进内存）
const useSpeechToText =
  VOICE_ENGINE === 'funasr' ? useFunasrTranscription : useWhisperTranscription;

// STT（语音转文字）和 LLM（文字转结构化记账信息）是两个完全独立、互不知道对方存在的 module
// （见 use-voice-transcription.ts / use-funasr-transcription.ts 和 use-expense-extractor.ts）。
// 这个文件是唯一知道"转写完的文字要接着丢给 LLM 提取"这件事的地方，负责把两者串起来。
// 用法：
//   const { startListening, stopListening } = useVoiceExpense();
//   <Pressable onPressIn={startListening} onPressOut={stopListening} />
export function useVoiceExpense() {
  const { extractExpense, isReady: isExtractorReady } = useExpenseExtractor();

  const handleTranscribed = useCallback(
    (text: string) => {
      // LLM 模型可能还在下载/加载，这时候 sendMessage() 底层的原生模块根本没初始化好，
      // 硬调会直接抛 "Cannot read property 'getVisualTokenCount' of undefined"
      if (!isExtractorReady) {
        console.log('[LLM] 模型还没准备好，跳过本次提取');
        return;
      }
      extractExpense(text).catch((error) => {
        console.log('[LLM] 提取出错:', error);
      });
    },
    [extractExpense, isExtractorReady],
  );

  return useSpeechToText(handleTranscribed);
}
