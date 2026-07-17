export type WavEncodeOptions = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
};

// 把录音过程中收集到的一段段原始 PCM chunk 拼成一个完整的 WAV 文件：44 字节的标准头 +
// 原始 PCM 数据本身。whisper.rn 的 transcribe() 只认 wav 文件，所以写文件前必须补上这个头，
// 不然文件内容虽然是对的 PCM 数据，但没有头信息，会被当成无效音频文件。
export function encodeWav(chunks: Uint8Array[], options: WavEncodeOptions): Uint8Array {
  const dataSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const header = createWavHeader(dataSize, options);

  const wav = new Uint8Array(header.length + dataSize);
  wav.set(header, 0);

  let offset = header.length;
  for (const chunk of chunks) {
    wav.set(chunk, offset);
    offset += chunk.length;
  }

  return wav;
}

function createWavHeader(
  dataSize: number,
  { sampleRate, channels, bitsPerSample }: WavEncodeOptions,
): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  writeAsciiString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAsciiString(view, 8, 'WAVE');

  writeAsciiString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM 格式的 fmt chunk 固定 16 字节
  view.setUint16(20, 1, true); // 1 = 未压缩的 PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  writeAsciiString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  return new Uint8Array(header);
}

function writeAsciiString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
