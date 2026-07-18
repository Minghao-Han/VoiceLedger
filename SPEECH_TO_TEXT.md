# 语音转文字（Speech-to-Text）实现记录

记录"说说花了多少钱"这个语音输入功能是怎么一步步做通的，以及踩过的坑，方便以后回顾或者交给别人接手。

## 现在有两套引擎，随时可切换

`src/app/index.tsx` 顶部有个开关：

```ts
const VOICE_ENGINE: 'whisper' | 'funasr' = 'funasr';
```

- `'whisper'` —— `src/hooks/use-voice-transcription.ts`，本地 whisper.rn（当前模型 `ggml-base-zh.bin`，打包进 App）。
- `'funasr'` —— `src/hooks/use-funasr-transcription.ts`，阿里 FunASR 的 SenseVoice 模型，经 sherpa-onnx 在本地跑（模型运行时下载，不打包进 App）。

两套实现完全独立，互不依赖，改这一行就能整体切换对比效果，不用动其他代码。下面先记录 whisper.rn 这条路线的历史，FunASR 那条路线在最后单独一节。

## whisper.rn 路线：实现方式

**思路：按住说话 → 录成一个完整的 wav 文件 → 松手后整段丢给本地 Whisper 模型转写一次。**

不是"边说边流式识别"（那是另一种做法，见下面"走过的弯路"），是彻底录完再转写，简单很多、也稳定很多。

### 涉及的文件

- `src/lib/whisper.ts` —— 加载 Whisper 模型（当前是 `ggml-base-zh.bin`，中文微调过的 base 档位，打包进 App，不联网下载；换过好几个模型档位，见下面"怎么提升识别准确率"）。
- `src/lib/audioRecorder.ts` —— 封装麦克风录音：`initPcmRecorder()` / `startPcmRecording()` / `stopPcmRecording()`，直接对接 `@fugood/react-native-audio-pcm-stream`，拿到原始 PCM 音频数据。
- `src/lib/wav.ts` —— `encodeWav()`，把录到的一段段 PCM 数据拼成一个标准 wav 文件（44 字节头 + 原始数据），因为 whisper.rn 的转写接口只认 wav 文件。
- `src/app/index.tsx` —— 页面逻辑：按下麦克风按钮开始录音，松手后调用上面几个函数完成"存文件 → 转写 → 打日志"。
- `scripts/download-whisper-model.js` —— 本地一次性下载模型文件到 `assets/models/`（不提交进 git，模型 75MB 太大）。
- `metro.config.js` —— 几处打包器配置，都是为了让 whisper.rn 和模型文件能被正确打包（见下面细节）。

### 大致流程

1. App 启动时，`getWhisperContext()` 把打包进 App 的模型文件加载进内存（只做一次）。
2. 按下麦克风按钮：
   - 申请录音权限（Android 需要，iOS 系统自动弹窗）。
   - `initPcmRecorder()` 初始化一次原生录音模块（**每次按下都要重新初始化**，原因见下面"踩过的坑"）。
   - `startPcmRecording()` 开始录音，收到的 PCM 数据攒进一个数组里。
3. 松手：
   - `stopPcmRecording()` 停止录音。
   - 把攒到的 PCM 数据用 `encodeWav()` 拼成一个 wav 文件，写到缓存目录。
   - 调用 `whisperContext.transcribe(文件路径, { language: 'zh' })`，等结果。
   - 打印识别出来的文字，删掉临时 wav 文件。

## 走过的弯路（为什么不是别的做法）

1. **一开始用 whisper.rn 的 `RealtimeTranscriber`（边录边转写）**：一直踩到各种并发问题——松手太快时 `start()`/`stop()` 抢跑导致报错、`nextSlice()` 和 `stop()` 之间有时序 bug 会导致结果丢失。修了好几轮之后决定换成"先录完再转写"，问题的根源直接消失了（不需要处理流式转写的时序）。
2. **短暂尝试过 `expo-speech-recognition`**（调用系统自带的语音识别，不是本地 Whisper 模型）：优点是代码量小很多，缺点是在真机上遇到 Android 通用的 `client` 错误（很可能是国产 ROM 对设备端识别的限制），且不是纯离线方案。最后按你的要求换回了 whisper.rn 纯本地方案。
3. **模型本来是运行时联网下载**，后来改成打包进 App（`require()` 静态引用 + `scripts/download-whisper-model.js` 本地预下载），这样发布出去的 App 首次使用就是离线的，不用等下载。

## 录音这边踩过的两个"隐藏坑"

这两个都是第三方库本身的 bug，症状很像但原因完全不同，都是靠加日志才排查出来的：

1. **whisper.rn 自带的 `AudioPcmStreamAdapter`**：如果调用两次 `initialize()`，第二次会内部调用 `release()`，把数据回调清空且不恢复——表现是第一次录音正常，第二次开始收不到任何数据。后来干脆绕开这个适配器，直接对接底层的 `@fugood/react-native-audio-pcm-stream`。
2. **`@fugood/react-native-audio-pcm-stream` 原生模块本身**：每次 `stop()` 之后，它内部的录音线程会把 `AudioRecord` 对象置空（一次性用品），如果不在下一次录音前重新 `init()`，`start()` 会直接静默不做任何事——表现同样是"第一次录音正常，之后再也收不到数据"。解决办法是每次按麦克风都重新 `initPcmRecorder()`。
3. **真机（vivo OriginOS）上完全录不到声音**：默认的录音音源是 `VOICE_RECOGNITION`，这个音源在一些国产定制 ROM 上会被系统拒绝给第三方 App 用，而且失败得无声无息（库本身没把这个错误传出来）。换成更通用的 `MIC` 音源解决。

## 怎么提升识别准确率

这条路线上换过几次模型：`ggml-tiny.bin`（最小最快，准确率最低）→ `ggml-base-q5_1.bin`（官方量化 base，57MB）→ 当前的 `ggml-base-zh.bin`（社区中文微调，未量化，142MB，见 `wabisabisocial/whisper-base-mandarin-ggml`）。如果还想继续在 whisper.rn 这条路线上提升准确率，大概是这些方向：

### 1. 换更大/更专的模型

- **官方档位**：`ggml-base.bin` → `ggml-small.bin`（~460MB），越大准确率越好，但 App 体积和转写耗时也跟着涨。有量化版本（文件名带 `q5_0`/`q8_0` 后缀）可以折中体积。
- **中文微调**：查过 `BELLE-2/Belle-whisper-large-v3-turbo-zh-ggml`，中文准确率数据很好（比官方 Whisper 提升 24-65%），但底座是 large-v3-turbo，未量化约 1.5GB，量化后估计也要 500-800MB，且仓库里没有现成量化文件，得自己编译 whisper.cpp 的 `quantize` 工具——体积代价太大，没有采用。

### 2. 调整 `transcribe()` 的参数

现在只传了 `{ language: 'zh' }`，`whisper.rn` 还支持不少能直接影响准确率的选项（见 `node_modules/whisper.rn/src/NativeRNWhisper.ts` 里的 `TranscribeOptions`）：

- **`prompt`**：初始提示词。因为这个 App 场景很窄（记账、说金额和分类），可以给一个类似 `"记账语音，内容通常是金额和消费分类，比如餐饮、交通、购物"` 的提示，引导模型往这个方向识别，对专有名词/数字的识别会有帮助。
- **`beamSize`**：搜索候选路径数，调大（比如 5）通常能提升准确率，代价是转写变慢。
- **`temperature` / `temperatureInc`**：控制解码时的随机性，默认策略遇到低置信度结果会重试，一般不用手动调。
- **`maxLen`**：限制单段文本长度，这个场景一般用不上（一句话很短）。

### 3. 录音质量

- **环境噪音**：现在用的是 `MIC` 音源（原始麦克风信号，没有降噪/回声消除），如果环境比较吵，识别效果会打折扣。可以在 UI 上提示用户"在安静环境说话"，或者尝试 `VOICE_COMMUNICATION` 音源（自带回声消除和降噪，但同样可能被部分定制 ROM 限制，需要在目标机型上实测）。
- **录音时长**：按钮松开前那一小段声音，原生模块会主动丢弃前两个数据块（用来消除"咔哒"声），正常说话不受影响，但如果讲得特别短（半秒以内）可能会被完全吃掉，可以考虑提示用户"至少说 1 秒"。

### 4. 后处理（纠错/兜底）

对于"记账语音"这种结构化程度高的场景，与其死磕语音识别准确率，不如在识别结果之上加一层规则纠错，性价比更高：
- 用正则从识别文本里提取数字（金额），容忍"三十五块""35元""叁拾伍"等不同说法。
- 把识别出的文字和预设分类列表（餐饮/交通/购物/其他）做模糊匹配，而不是要求逐字匹配。

这条路不需要改动 Whisper 本身，性价比通常比无脑换大模型更高，建议优先做。

## FunASR 路线：为什么试、怎么接的

Whisper 不是专门为中文做的模型，中文场景下天然不如国产 ASR 模型（阿里 FunASR 出的 SenseVoice、Paraformer 等）。想直接把这些模型塞进 whisper.rn 是不行的——**架构完全不兼容**：whisper.rn/whisper.cpp 只认 GGML 格式的 Whisper 模型，SenseVoice/Paraformer 是不同的模型结构，底层推理代码、分词器都不一样。

所以走的是另一条完全独立的技术栈：

- **[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)**（k2-fsa 出品）：一个通用的本地语音处理运行时，用 ONNX Runtime 跑各种模型（SenseVoice、Paraformer、Whisper 等），纯离线。
- **[react-native-sherpa-onnx](https://github.com/XDcobra/react-native-sherpa-onnx)**：社区维护的 React Native 绑定（有个更早、已废弃的 `react-native-sherpa-onnx-stt`，README 里明确说了让换成这个）。

用的模型是 sherpa-onnx 官方转换的 **SenseVoice 多语言 int8 量化版**（`sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09`，支持中/英/日/韩/粤，SenseVoice 是阿里 FunASR 项目里的模型），压缩包约 160MB。

### 涉及的文件

- `src/lib/funasr.ts` —— `getSttEngine()`，用库自带的 `ensureModelByCategory()` 下载/解压模型（存在 App 自己的 Documents 目录），再 `createSTT()` 初始化识别引擎。
- `src/hooks/use-funasr-transcription.ts` —— 跟 whisper.rn 那套是平行实现，同样按住录音松手转写，**复用了同一套 `src/lib/audioRecorder.ts` 录音逻辑**（录音这部分两条路线是共享的，不用重复踩坑）。唯一的区别是这个库的 `transcribeSamples()` 直接吃 `[-1, 1]` 浮点采样数组，不需要像 whisper.rn 那样先拼 wav 文件。

### 为什么不打包进 App（跟 whisper.rn 不一样）

whisper.rn 那条路线模型是打包进 App 安装包的（`require()` 静态引用）。FunASR 这条路线做不到同样的事：这个库支持把模型当"asset"打包，但要求把文件手动放进原生 `android/app/src/main/assets` 目录——这个目录是 Expo 每次 `prebuild` 都会重新生成的，手动放的文件会被清掉，在 Expo 的 managed/prebuild 工作流下不好维护。所以改成运行时下载（`ensureModelByCategory()`，跟 whisper.rn 最早的实现思路一样），下载完缓存在 App 自己的目录里，之后就是离线的。

### 踩的一个坑：Metro 的 exports 解析冲突

`metro.config.js` 里之前为了让 whisper.rn 能正常 import（它的 `package.json` "exports" 字段没写全，缺根路径映射），把 Metro 的 package exports 解析**整个关掉**了。而 `react-native-sherpa-onnx` 的 exports 字段是规范写的（`./stt`、`./download` 这些子路径全靠 exports 映射，没有物理文件兜底），整个关掉会导致这个库的子路径 import 直接解析不出来。

解决办法：不再全局关闭，改成用 `config.resolver.resolveRequest` 自定义解析器，只针对 `whisper.rn` 这一个包单独关闭 exports 解析，其他包（包括 react-native-sherpa-onnx）走 Metro 默认的 exports 解析。

### 踩的两个坑：库本身的 API 问题

1. **`ensureModel` 这个函数名根本不存在**：官方文档站（mintlify）写的是 `ensureModel(category, id, opts)`，但实际装的 0.4.3 版本里导出的是 `ensureModelByCategory`——文档站显然比发布到 npm 的版本新，不能照抄文档，得去 `node_modules` 里翻真实的 `.js`/`.d.ts` 核对。
2. **`ensureModelByCategory()` 报 `Unknown model id`**：这个函数只会在本地磁盘缓存的模型目录列表里查 id，从来不会自己联网去拉取。这个缓存必须先显式调用一次 `refreshModelsByCategory(category)`（会真的去 GitHub Release 上抓一次 asset 列表存本地）才会有内容，不然不管传什么 id 都查不到。已经在 `src/lib/funasr.ts` 里补上这一步。

### 效果怎么样：真机实测更快更准

真机测下来 FunASR（SenseVoice）明显比 whisper.rn（`ggml-base-zh.bin`）又快又准。原因大概是这几条叠加：

- **架构**：SenseVoice 是非自回归模型，一次并行预测整段输出；Whisper 是自回归的，解码器要一个 token 一个 token 顺序生成，在 CPU 上天然慢很多——这是速度差距的最大头。
- **量化不对等**：现在用的 SenseVoice 是 int8 量化版，但 whisper 这边选的 `ggml-base-zh.bin` 是未量化的（当时没找到这个中文微调的量化版本）。int8 在 ARM CPU 上通常比 fp16/fp32 快 2-4 倍，所以这部分对比本身不完全公平。
- **whisper 这边多付了 prompt 的解码成本**：自回归解码下，`prompt` 里的每个 token 都要先顺序处理一遍才能开始真正转写；SenseVoice 没有对应的 prompt 机制，不用付这个成本。
- **训练数据的语言分布**：Whisper 的训练数据里英语占大头（约 65%），中文只是剩余部分里很小的一片；SenseVoice 是阿里专门用大量中文语料训练的，中文场景本来就是它的主场。
- **`useItn: true` 是模型级别的硬保证**：SenseVoice 解码时直接把"三十五"转成"35"；whisper 这边只能靠 `prompt` 软性引导它多写数字，模型可以选择不听。
- **`ggml-base-zh.bin` 本身没有质量背书**：选它的时候就写过"没有公开的基准测试数据，效果好不好得靠实测"，现在实测结果是这个社区微调本身也不一定是个好选择，不只是 Whisper 架构的问题。

目前 `VOICE_ENGINE` 已经定在 `'funasr'`。whisper.rn 那套代码原样保留，真要切回去改 `src/app/index.tsx` 那一行就行。
