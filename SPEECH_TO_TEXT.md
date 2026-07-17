# 语音转文字（Speech-to-Text）实现记录

记录"说说花了多少钱"这个语音输入功能是怎么一步步做通的，以及踩过的坑，方便以后回顾或者交给别人接手。

## 现在的实现方式

**思路：按住说话 → 录成一个完整的 wav 文件 → 松手后整段丢给本地 Whisper 模型转写一次。**

不是"边说边流式识别"（那是另一种做法，见下面"走过的弯路"），是彻底录完再转写，简单很多、也稳定很多。

### 涉及的文件

- `src/lib/whisper.ts` —— 加载 Whisper 模型（`ggml-tiny.bin`，打包进 App，不联网下载）。
- `src/lib/audioRecorder.ts` —— 封装麦克风录音：`initPcmRecorder()` / `startPcmRecording()` / `stopPcmRecording()`，直接对接 `@fugood/react-native-audio-pcm-stream`，拿到原始 PCM 音频数据。
- `src/lib/wav.ts` —— `encodeWav()`，把录到的一段段 PCM 数据拼成一个标准 wav 文件（44 字节头 + 原始数据），因为 whisper.rn 的转写接口只认 wav 文件。
- `src/app/index.tsx` —— 页面逻辑：按下麦克风按钮开始录音，松手后调用上面几个函数完成"存文件 → 转写 → 打日志"。
- `scripts/download-whisper-model.js` —— 本地一次性下载模型文件到 `assets/models/`（不提交进 git，模型 75MB 太大）。
- `metro.config.js` —— 几处打包器配置，都是为了让 whisper.rn 和模型文件能被正确打包（见下面细节）。

### 大致流程

1. App 启动时，`getWhisperContext()` 把打包进 App 的 `ggml-tiny.bin` 模型加载进内存（只做一次）。
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

当前用的是 **`ggml-tiny.bin`**（Whisper 官方多语言模型里最小的一档），追求的是包体积小、加载快，代价是准确率是所有档位里最低的。如果准确率不够用，从性价比高到低大概是这些方向：

### 1. 换更大的模型（最直接，效果最明显）

`ggml-tiny.bin` → `ggml-base.bin`（~140MB）或 `ggml-small.bin`（~460MB），中文识别准确率会有明显提升。改法：
- 把 `scripts/download-whisper-model.js` 和 `src/lib/whisper.ts` 里的 `modelFileName` 改成对应文件名。
- 权衡：App 体积变大、模型加载和转写耗时都会变长（tiny 现在是几百毫秒级别，base/small 会慢不少，具体多少取决于机型）。
- 也可以用官方提供的**量化版本**（文件名里带 `q5_0`、`q8_0` 之类后缀），体积比同档位原版小很多，准确率损失不大，是个不错的折中——比如 `ggml-base-q5_1.bin` 比 `ggml-base.bin` 小一半左右。

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
