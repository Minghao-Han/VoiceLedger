import { useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 在这个项目里，@ 是路径别名，不是必须写法。tsconfig.json 里把 @/* 映射到了 ./src/*，所以：
import ConfirmationModal from '@/components/confirmation';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useVoiceExpense } from '@/hooks/use-voice-expense';

export default function HomeScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const { startListening, stopListening } = useVoiceExpense();

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
