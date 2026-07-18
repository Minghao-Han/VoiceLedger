import * as z from 'zod/v4';

import { categories } from '@/components/confirmation';

// LLM 从语音转写文字里抽取出来的结构化记账信息。amount 单位是"元"（不是分），
// 跟语音里说的数字直觉一致（"三十五块五" -> 35.5）；写数据库前调用方要自己 *100 转成分
// （db/transactions.ts 的 insertTransaction 要的是 amountCents）。
export const ExpenseSchema = z.object({
  amount: z
    .number()
    .meta({ description: '金额，"块=元" = 整数部分,"角"或"毛" = 小数点后第1位,"分" = 小数点后第2位'}),
  type: z
    .enum(categories as [string, ...string[]])
    .meta({ description: '消费分类，必须是给定分类列表里的一个，不能自己发明新分类' }),
  note: z
    .string()
    .meta({ description: '简短备注，比如买了什么、在哪消费的；没有更多信息就用空字符串' }),
});

export type Expense = z.infer<typeof ExpenseSchema>;
