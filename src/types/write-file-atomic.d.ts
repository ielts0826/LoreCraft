declare module "write-file-atomic" {
  interface WriteFileAtomicOptions {
    encoding?: BufferEncoding;
  }

  export default function writeFileAtomic(
    filePath: string,
    data: string | Uint8Array,
    options?: WriteFileAtomicOptions,
  ): Promise<void>;
}
