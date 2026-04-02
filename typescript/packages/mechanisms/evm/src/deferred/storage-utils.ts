import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Writes JSON to `filePath` atomically (temp file in the same directory, then rename).
 * Creates parent directories as needed.
 *
 * @param filePath - Destination file path; parent dirs are created if missing.
 * @param value - JSON-serializable value to persist.
 */
export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(tmp, body, "utf8");
  try {
    await rename(tmp, filePath);
  } catch {
    await unlink(filePath).catch(() => {});
    await rename(tmp, filePath);
  }
}
