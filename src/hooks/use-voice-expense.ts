import { useCallback, useRef, useState } from 'react';

import type { Expense } from '@/lib/expenseExtraction';
import { useExpenseExtractor } from './use-expense-extractor';
import { useFunasrTranscription } from './use-funasr-transcription';

// 转写有可能因为没识别到人声、STT/LLM 还没加载好等原因，永远不会调用 onTranscribed——
// 这种情况下没有这个兜底的话，isAnalyzing 会一直停在 true，弹窗转圈转到天荒地老。
const ANALYSIS_WATCHDOG_MS = 15000;

// STT（语音转文字）和 LLM（文字转结构化记账信息）是两个完全独立、互不知道对方存在的 module
// （见 use-funasr-transcription.ts 和 use-expense-extractor.ts）。
// 这个文件是唯一知道"转写完的文字要接着丢给 LLM 提取"这件事的地方，负责把两者串起来。
// 用法：
//   const { startListening, stopListening, expense, isAnalyzing } = useVoiceExpense();
//   <Pressable onPressIn={startListening} onPressOut={stopListening} />
export function useVoiceExpense() {
  const { extractExpense, isReady: isExtractorReady } = useExpenseExtractor();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const finishAnalyzing = useCallback(() => {
    clearWatchdog();
    setIsAnalyzing(false);
  }, [clearWatchdog]);

  const handleTranscribed = useCallback(
    (text: string) => {
      // LLM 模型可能还在下载/加载，这时候 sendMessage() 底层的原生模块根本没初始化好，
      // 硬调会直接抛 "Cannot read property 'getVisualTokenCount' of undefined"
      if (!isExtractorReady) {
        console.log('[LLM] 模型还没准备好，跳过本次提取');
        finishAnalyzing();
        return;
      }
      extractExpense(text)
        .then((result) => {
          setExpense(result);
        })
        .catch((err) => {
          console.log('[LLM] 提取出错:', err);
          setError(err instanceof Error ? err : new Error(String(err)));
        })
        .finally(() => {
          finishAnalyzing();
        });
    },
    [extractExpense, isExtractorReady, finishAnalyzing],
  );

  const { startListening, stopListening } = useFunasrTranscription(handleTranscribed);

  // 从按下麦克风开始，到"松手转写 + 模型提取"整条链路跑完，都算在"分析中"，
  // 好让确认弹窗从打开的第一帧起就转圈，而不是转写还没做完就先闪一下空表单。
  const wrappedStartListening = useCallback(async () => {
    clearWatchdog();
    setExpense(null);
    setError(null);
    await startListening();
  }, [startListening, clearWatchdog]);

  const wrappedStopListening = useCallback(async () => {
    setIsAnalyzing(true);
    clearWatchdog();
    watchdogRef.current = setTimeout(finishAnalyzing, ANALYSIS_WATCHDOG_MS);
    await stopListening();
  }, [stopListening, clearWatchdog, finishAnalyzing]);

  return {
    startListening: wrappedStartListening,
    stopListening: wrappedStopListening,
    expense,
    isAnalyzing,
    error,
  };
}
