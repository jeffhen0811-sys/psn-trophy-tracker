import * as psn from 'psn-api';
import type { Auth } from './auth.js';
import { AppError, errorKind } from './errors.js';
import { setTimeout as delay } from 'node:timers/promises';
export type Api = Pick<typeof psn, 'getProfileFromUserName' | 'getUserTitles' | 'getTitleTrophyGroups' | 'getTitleTrophies' | 'getUserTrophiesEarnedForTitle'>;
export interface Page<T> { items: T[]; total: number; next?: number }
export async function paginate<T>(fetch: (offset: number) => Promise<Page<T>>, key: (item: T) => string): Promise<{ items: T[]; complete: boolean }> {
  const items = new Map<string, T>(); let offset = 0; let expected: number | undefined;
  for (let page = 0; page < 1000; page++) {
    const p = await fetch(offset);
    if (!Array.isArray(p.items) || !Number.isInteger(p.total) || p.total < 0) throw new AppError('Resposta inválida da PSN.');
    const stable = expected === undefined || expected === p.total;
    expected ??= p.total;
    const before = items.size;
    for (const item of p.items) items.set(key(item), item);
    if (!stable) return { items: [...items.values()], complete: false };
    if (items.size >= p.total) return { items: [...items.values()], complete: items.size === p.total };
    if (!p.items.length || before === items.size) break;
    const next = p.next ?? offset + p.items.length;
    if (next <= offset || !Number.isInteger(next)) break;
    offset = next;
  }
  return { items: [...items.values()], complete: false };
}
export class Client {
  constructor(private auth: Pick<Auth, 'authorization'>, readonly api: Api = psn, private sleep = delay) {}
  async call<T>(fn: (a: psn.AuthorizationPayload) => Promise<T>): Promise<T> {
    let a = await this.auth.authorization(); let refreshed = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      try { return await fn(a); }
      catch (e) {
        const kind = errorKind(e);
        if (kind === 'auth' && !refreshed) { a = await this.auth.authorization(true); refreshed = true; continue; }
        if (kind === 'rate' && attempt < 3) { await this.sleep(1000 * 2 ** attempt); continue; }
        throw new AppError(kind === 'auth' ? 'Sessão recusada. Execute npm run auth.' : kind === 'rate' ? 'Limite de consultas da PSN atingido. Aguarde e tente novamente.' : 'Falha na consulta PSN. Verifique conexão, privacidade do perfil, identificador e disponibilidade do serviço.');
      }
    }
    throw new AppError('PSN indisponível após novas tentativas. Tente novamente mais tarde.');
  }
  async account(onlineId: string) {
    const { profile } = await this.call(a => this.api.getProfileFromUserName(a, onlineId));
    if (!profile?.accountId || profile.onlineId.toLowerCase() !== onlineId.toLowerCase()) throw new AppError('Perfil PSN não encontrado.');
    return { onlineId: profile.onlineId, accountId: profile.accountId };
  }
  async games(accountId: string) {
    return paginate(async offset => {
      const p = await this.call(a => this.api.getUserTitles(a, accountId, { offset, limit: 800 }));
      return { items: p.trophyTitles, total: p.totalItemCount, ...(p.nextOffset === undefined ? {} : { next: p.nextOffset }) };
    }, g => `${g.npServiceName}:${g.npCommunicationId}`);
  }
}
