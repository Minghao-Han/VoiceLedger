// tsc（moduleResolution: bundler）解析这几个 whisper.rn 子路径时，会走它 package.json 里的
// `exports` 字段做通配符匹配，而这套通配符映射本身对深层 src 路径处理不对（对应不上真实文件）。
// 但我们在 metro.config.js 里已经关掉了 Metro 的 exports 解析，运行时是直接按物理路径找文件的，
// 不受这个影响。这里声明成无类型模块，只是让 tsc 别在这几个路径上报错。
declare module 'whisper.rn';
