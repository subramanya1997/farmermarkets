// heic-decode ships no types. Only the parts photoConvert.ts uses.
declare module 'heic-decode' {
  interface DecodedImage {
    width: number;
    height: number;
    /** RGBA, 4 bytes per pixel. */
    data: Uint8ClampedArray;
  }

  interface ImageHandle {
    width: number;
    height: number;
    decode(): Promise<DecodedImage>;
  }

  function decode(input: { buffer: Uint8Array | ArrayBuffer }): Promise<DecodedImage>;
  namespace decode {
    function all(input: { buffer: Uint8Array | ArrayBuffer }): Promise<ImageHandle[] & { dispose(): void }>;
  }

  export = decode;
}
