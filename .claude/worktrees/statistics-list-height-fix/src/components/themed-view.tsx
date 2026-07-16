import { View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
};

export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();

  return <View style={[{ backgroundColor: theme[type ?? 'background'] }, style]} {...otherProps} />;
}

// 为什么可以作用到children？

// JSX 标签中间包的内容（<ThemedView>...</ThemedView> 之间的东西），
// 会被 React 自动作为一个叫 children 的 prop 传进来，即使你没有在任何地方显式写 children={...}。
// 这是 React 的内置规则，不是这段代码自己写的逻辑。

// 打个比方，如果你调用组件时这样写：

// <ThemedView type="backgroundElement" style={styles.stepContainer} onLayout={fn}>
//   <Text>hello</Text>
// </ThemedView>

// JSX 编译后，实际上是这样调用函数的（简化理解）：

// ThemedView({
//   type: 'backgroundElement',
//   style: styles.stepContainer,
//   onLayout: fn,
//   children: <Text>hello</Text>,   // ← 注意这个！
// })