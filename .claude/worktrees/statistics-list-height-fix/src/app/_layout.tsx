import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { initializeDb } from '@/db/schema';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    // <SQLiteProvider> 是 React 的 Context Provider 模式（这是你之前没接触过的新概念，
    // 简单说：它把"数据库连接"这个东西放到一个"全局共享的篮子"里，篮子包裹住的所有子组件，
    // 不管嵌套多深，都能通过 useSQLiteContext() 直接拿到这个连接，不需要一层一层手动传 props）。
    <SQLiteProvider databaseName="budget.db" onInit={initializeDb}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {/* 自闭合标签 /> 表示这个组件没有子内容，类似 HTML 里的 <img /> */}
        <AnimatedSplashOverlay />
        <AppTabs />
      </ThemeProvider>
    </SQLiteProvider>
  );
}
