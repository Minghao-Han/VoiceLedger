import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useSQLiteContext } from 'expo-sqlite';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { insertTransaction } from '@/db/transactions';
import type { Expense } from '@/lib/expenseExtraction';
import { Picker } from '@react-native-picker/picker';
import { useEffect, useState } from 'react';

type ConfirmationModalProps = {
  visible: boolean;
  onClose: () => void;
  expense?: Expense | null;
  isAnalyzing?: boolean;
};

export const categories = ['餐饮', '交通', '购物', '杂货', '娱乐', '医疗', '旅游', '其他'];

function formatCentsToDollars(cents: string): string {
    const num = Number(cents);
    if (isNaN(num)) return "0.00";
    return (num / 100).toFixed(2);
}

export default function ConfirmationModal({
    visible,
    onClose,
    expense,
    isAnalyzing = false,
}: ConfirmationModalProps) {
    const phase = isAnalyzing ? 'loading' : 'form';
    const db = useSQLiteContext();
    const [amountCents, setAmountCents] = useState('');
    const [currency, setCurrency] = useState<'USD' | 'RMB'>('USD');
    const [category, setCategory] = useState<string | null>(null);
    const [note, setNote] = useState('');

    // 弹窗每次重新打开都是一次全新的记账，先清掉上一轮留下的字段
    useEffect(() => {
        if (!visible) return;
        setAmountCents('');
        setCategory(null);
        setNote('');
    }, [visible]);

    // 模型分析完成后，用解析出的金额/分类/备注回填表单
    useEffect(() => {
        if (!visible || !expense) return;
        setAmountCents(String(Math.round(expense.amount * 100)));
        setCategory(expense.type);
        setNote(expense.note);
    }, [visible, expense]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalBackdrop}>
                <ThemedView style={styles.modalCard}>
                    <ThemedView style={styles.modalCard}>
                        {phase === 'loading' ? (<ActivityIndicator size="large" />):(
                            <>
                            <TextInput
                                value={formatCentsToDollars(amountCents)}
                                onChangeText={(text) => setAmountCents(text.replace(/[^0-9]/g, ''))}
                                keyboardType="number-pad"
                                placeholder="金额（分）"
                                // style={styles.input}
                            />
                            <Picker
                                selectedValue={category}
                                onValueChange={(value) => setCategory(value)}
                                style={styles.picker}
                            >
                                <Picker.Item label="选择分类" value={null} enabled={false} />
                                {categories.map((c) => (
                                    <Picker.Item key={c} label={c} value={c} />
                                ))}
                            </Picker>
                            <TextInput
                                value={note}
                                onChangeText={setNote}
                                placeholder="备注（可选）"
                                // style={styles.input}
                            />
                            
                            <Pressable
                                disabled={!amountCents.trim() || !category}
                                onPress={async () => {
                                    if (!amountCents.trim() || !category) return;
                                    // Save data to db
                                    await insertTransaction(db, {
                                        amountCents: Number(amountCents),
                                        currency,
                                        category,
                                        note: note.trim() || undefined,
                                    });
                                    console.log({
                                        amountCents: Number(amountCents),
                                        currency,
                                        category,
                                        note: note.trim() || undefined,
                                    });
                                    console.log('Transaction saved to db');
                                    // clean up state
                                    setAmountCents('');
                                    setCategory(null);
                                    setNote('');
                                    onClose();
                                }}
                            >
                                <ThemedText
                                    type="code"
                                    style={(!amountCents.trim() || !category) && styles.disabledText}
                                >
                                    保存
                                </ThemedText>
                            </Pressable>

                            </>
                        )}
                    </ThemedView>

                <Pressable onPress={onClose}>
                    <ThemedText type="code">关闭</ThemedText>
                </Pressable>
                </ThemedView>
            </View>
        </Modal>
    );
}

    const styles = StyleSheet.create({
    modalBackdrop: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    modalCard: {
        width: '70%',
        maxWidth: 360,
        paddingVertical: Spacing.four,
        paddingHorizontal: Spacing.three,
        borderRadius: Spacing.three,
        alignItems: 'center',
        gap: Spacing.three,
    },
    picker: {
        width: '100%',
    },
    disabledText: {
        color: '#999',
    },
});