// 来自 expo-router 这个包（Expo 生态里做路由/导航的库）
// NativeTabs 的作用：它是 expo-router 提供的一种"底部标签栏（Tab Bar）"组件，
// 特点是用原生系统组件渲染标签栏（比如 iOS 用系统自带的 UITabBar，而不是用 JS/React 画出来的模拟版），
// 所以看起来、用起来都更接近原生 App 的体验。
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
        {/* 在 expo-router 里，路由是靠文件名决定的，name="index" 就是告诉 NativeTabs："点击这个标签时，跳转/显示到 index.tsx 这个页面 */}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>记账</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          // require('@/assets/images/tabIcons/home.png')：这是 React Native/Metro 打包器提供的语法，用来引入本地静态资源（图片）。跟 ES Module 的 import 不同，这是 CommonJS 的写法，Metro 打包器专门处理它，把图片路径转成一个可以被 <Image> 或这里的 Icon 组件使用的资源引用。
          src={require('@/assets/images/tabIcons/send-money.png')}
          // renderingMode="template"：这是 iOS 原生图标渲染的一个概念，叫 模板模式（template rendering）。
            // - 意思是：这张图片会被当作"轮廓/蒙版"来用，图标本身的颜色会被忽略，实际显示颜色由系统或父组件的 tintColor 决定（比如选中态变蓝、未选中态变灰）。
            // - 类比：像剪影/蒙版贴纸，你贴上去之后颜色是由"底色"决定的，不是贴纸自身的颜色。
            // - 对应的还有个 "original" 模式，就是完全按图片原本的颜色显示，不会被系统重新染色。
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>统计</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/money-bag.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
