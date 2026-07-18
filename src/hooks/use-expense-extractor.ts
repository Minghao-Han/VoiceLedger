import { useCallback, useEffect } from 'react';
import {
  fixAndValidateStructuredOutput,
  getStructuredOutputPrompt,
  models,
  useLLM
} from 'react-native-executorch';

import { ExpenseSchema, type Expense } from '@/lib/expenseExtraction';

// Qwen3 0.6B：react-native-executorch 里参数量最小的 Qwen 系列模型。选它而不是
// 英文场景更常见的 SmolLM/Llama，是因为 Qwen 系列本身是阿里训练的，中文能力明显更强；
// 这个 App 只做"从中文一句话里抠出金额/分类/备注"这种窄任务，不需要更大的模型。
// 不传参数默认拿量化版（modelRegistry.js 里 `opts.quant !== false`），体积和速度都更友好。
const EXTRACTION_MODEL = models.llm.qwen3_1_7b();
const SYSTEM_PROMPT_PREFIX =
  '你是一个记账助手。用户会给你一句包含消费信息的中文语音转写文本，你需要从里面提取结构化信息。' +
  '不要回复用户，只需要把解析结果按下面的格式输出。';

// Qwen3 默认会先输出一段 <think>...</think> 推理过程再给答案，这里用不上、还会拖慢速度、
// 甚至可能干扰后面从文本里摘 JSON 的逻辑（万一推理过程里也出现了花括号）。
// /no_think 是 Qwen3 官方文档给的关闭思考模式的方式。
const SYSTEM_PROMPT_SUFFIX = '/no_think';

// 从语音识别出来的一句话里抽取 { amount, type, note } 结构化记账信息。用法：
//   const { extractExpense, isReady } = useExpenseExtractor();
//   const expense = await extractExpense('今天在超市花了35块5买菜');
export function useExpenseExtractor() {
  const llm = useLLM({ model: EXTRACTION_MODEL });

  useEffect(() => {
    if (llm.isReady) console.log('[LLM] 记账信息提取模型已就绪');
  }, [llm.isReady]);

  useEffect(() => {
    if (llm.error) console.log('[LLM] 模型加载失败:', llm.error);
  }, [llm.error]);

  const extractExpense = useCallback(
    async (sttText: string): Promise<Expense> => {
      const formattingInstructions = getStructuredOutputPrompt(ExpenseSchema);
      const systemPrompt = `${SYSTEM_PROMPT_PREFIX}\n${formattingInstructions}\n${SYSTEM_PROMPT_SUFFIX}`;

      console.log('[LLM] 开始提取记账信息...');
      const startedAt = Date.now();
      // 用 generate() 而不是 sendMessage()：官方文档写得很明确，generate() "doesn't
      // manage conversation context"——每次调用都是完全独立的一次性生成，不会有
      // messageHistory 需要操心。sendMessage() 是给多轮聊天设计的，会往 messageHistory
      // 里累加，我们这种"每句话都是独立记账事件"的场景本来就不需要那套状态管理，
      // 用 generate() 从源头上就没有"要不要重置上下文"这个问题。
      const raw = await llm.generate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: sttText },
      ]);
      console.log('[LLM] 原始输出:', raw);
      const expense = fixAndValidateStructuredOutput(raw, ExpenseSchema);
      console.log(`[LLM] 提取完成，耗时 ${Date.now() - startedAt}ms:`, expense);
      return expense;
    },
    [llm],
  );

  return {
    extractExpense,
    isReady: llm.isReady,
    isGenerating: llm.isGenerating,
    downloadProgress: llm.downloadProgress,
    error: llm.error,
  };
}
