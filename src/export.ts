import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
export async function exportJson(value: unknown, output: string): Promise<string> {
  const file = resolve(output); await mkdir(dirname(file), { recursive: true });
  const tmp = join(dirname(file), `.${randomUUID()}.tmp`);
  try { await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); await rename(tmp, file); }
  finally { await rm(tmp, { force: true }); }
  return file;
}
