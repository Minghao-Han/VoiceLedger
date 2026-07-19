import { useCallback } from 'react';

import { useExpenseExtractor } from './use-expense-extractor';
import { useFunasrTranscription } from './use-funasr-transcription';

// STT（语音转文字）和 LLM（文字转结构化记账信息）是两个完全独立、互不知道对方存在的 module
// （见 use-funasr-transcription.ts 和 use-expense-extractor.ts）。
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

  return useFunasrTranscription(handleTranscribed);
}
