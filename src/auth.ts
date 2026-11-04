import { mkdir, readFile, chmod, rename, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import * as psn from 'psn-api';
import { AppError } from './errors.js';
export interface StoredTokens { accessToken: string; refreshToken: string; accessExpiresAt: number; refreshExpiresAt: number }
export class Auth {
  private readonly dir = process.env.PSN_AUTH_DIR || join(homedir(), '.config', 'psn-trophy-tracker');
  private get file() { return join(this.dir, 'tokens.json'); }
  async read(): Promise<StoredTokens | null> {
    try {
      const value: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      if (!value || typeof value !== 'object') throw new Error();
      const t = value as Partial<StoredTokens>;
      if (typeof t.accessToken !== 'string' || typeof t.refreshToken !== 'string' || !Number.isFinite(t.accessExpiresAt) || !Number.isFinite(t.refreshExpiresAt)) throw new Error();
      return t as StoredTokens;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new AppError('Não foi possível ler os tokens locais. Execute npm run auth para reautenticar.');
    }
  }
  private async save(t: psn.AuthTokensResponse) {
    const now = Date.now();
    const stored: StoredTokens = { accessToken: t.accessToken, refreshToken: t.refreshToken, accessExpiresAt: now + t.expiresIn * 1000, refreshExpiresAt: now + t.refreshTokenExpiresIn * 1000 };
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await chmod(this.dir, 0o700);
    const tmp = join(this.dir, `.${randomUUID()}.tmp`);
    try { await writeFile(tmp, JSON.stringify(stored), { mode: 0o600, flag: 'wx' }); await rename(tmp, this.file); }
    finally { await rm(tmp, { force: true }); }
    return { accessToken: stored.accessToken };
  }
  async login(npsso: string) {
    if (!/^[a-zA-Z0-9]{64}$/.test(npsso)) throw new AppError('NPSSO inválido: esperado token de 64 caracteres alfanuméricos.');
    try { const code = await psn.exchangeNpssoForAccessCode(npsso); await this.save(await psn.exchangeAccessCodeForAuthTokens(code)); }
    catch { throw new AppError('Falha na autenticação. Obtenha um novo NPSSO e execute npm run auth novamente.'); }
  }
  async authorization(force = false): Promise<psn.AuthorizationPayload> {
    const t = await this.read();
    if (!t) throw new AppError('Autenticação ausente. Execute npm run auth.');
    if (!force && t.accessExpiresAt > Date.now() + 60_000) return { accessToken: t.accessToken };
    if (t.refreshExpiresAt <= Date.now() + 60_000) throw new AppError('Refresh token expirado. Execute npm run auth com um novo NPSSO.');
    try { return await this.save(await psn.exchangeRefreshTokenForAuthTokens(t.refreshToken)); }
    catch { throw new AppError('Não foi possível renovar a sessão. Tente novamente ou execute npm run auth.'); }
  }
}
