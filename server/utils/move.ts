import { rename, unlink, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Move src → dst, creating parent directories as needed.
 * Falls back to copy-then-delete when src and dst are on different filesystems
 * (EXDEV), mirroring Python's shutil.move semantics.
 */
export async function safeMove(src: string, dst: string): Promise<void> {
  await mkdir(path.dirname(dst), { recursive: true });
  try {
    await rename(src, dst);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    await Bun.write(dst, Bun.file(src));
    await unlink(src);
  }
}
