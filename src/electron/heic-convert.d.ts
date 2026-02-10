declare module 'heic-convert' {
  interface HeicConvertOptions {
    buffer: Buffer;
    format: 'PNG' | 'JPEG';
    quality?: number; // 0 to 1
  }

  function heicConvert(options: HeicConvertOptions): Promise<Buffer>;
  export = heicConvert;
}
