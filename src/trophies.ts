import type { TitleThinTrophy, UserThinTrophy, TrophyTitle } from 'psn-api';
import type { NormalizedTrophy } from './types.js';
import { Client, paginate } from './psn.js';
export function normalize(definitions: TitleThinTrophy[], progress: UserThinTrophy[], groupId?: string): NormalizedTrophy[] {
  const byId = new Map(progress.map(t => [t.trophyId, t]));
  return definitions.map(t => {
    const p = byId.get(t.trophyId); const group = groupId ?? t.trophyGroupId ?? null;
    const rate = p?.trophyEarnedRate;
    return { id: t.trophyId, name: t.trophyName ?? null, description: t.trophyDetail ?? null, type: t.trophyType, hidden: t.trophyHidden ?? null,
      earned: typeof p?.earned === 'boolean' ? p.earned : null, earnedAt: p?.earned === true ? p.earnedDateTime ?? null : null,
      groupId: group, group: group === 'default' ? 'base' as const : group ? 'additional' as const : null,
      rarity: { category: p?.trophyRare ?? null, earnedPercentage: rate !== undefined && rate.trim() !== '' && Number.isFinite(Number(rate)) ? Number(rate) : null } };
  }).sort((a,b) => a.id-b.id);
}
export function summarize(trophies: NormalizedTrophy[], complete: boolean) {
  const earned = trophies.filter(t => t.earned === true).length;
  const remaining = trophies.filter(t => t.earned === false).length;
  const platinum = trophies.filter(t => t.type === 'platinum');
  return { total: trophies.length, earned, remaining, unknown: trophies.length - earned - remaining,
    completionPercentage: complete && trophies.length > 0 ? Math.round(earned / trophies.length * 10000) / 100 : null,
    platinumEarned: platinum.some(t => t.earned === true) ? true : complete && platinum.length > 0 && platinum.every(t => t.earned === false) ? false : null,
    platinumAvailable: platinum.length > 0 ? true : complete ? false : null };
}
export async function collect(client: Client, account: { onlineId: string; accountId: string }, game: TrophyTitle, gamesComplete: boolean, now = new Date()) {
  const options = { npServiceName: game.npServiceName };
  const groups = await client.call(a => client.api.getTitleTrophyGroups(a, game.npCommunicationId, options));
  const warnings: string[] = [];
  let complete = gamesComplete;
  if (!gamesComplete) warnings.push('A lista de jogos retornada está incompleta.');
  const trophies: NormalizedTrophy[] = [];
  for (const group of groups.trophyGroups) {
    const id = group.trophyGroupId;
    const definitions = await paginate(async offset => {
      const p = await client.call(a => client.api.getTitleTrophies(a, game.npCommunicationId, id, { ...options, offset, limit: 100 }));
      if (p.trophySetVersion !== groups.trophySetVersion) { complete = false; warnings.push('A versão do conjunto mudou durante a consulta.'); }
      return { items: p.trophies, total: p.totalItemCount, ...(p.nextOffset === undefined ? {} : { next: p.nextOffset }) };
    }, t => String(t.trophyId));
    const progress = await paginate(async offset => {
      const p = await client.call(a => client.api.getUserTrophiesEarnedForTitle(a, account.accountId, game.npCommunicationId, id, { ...options, offset, limit: 100 }));
      if (p.trophySetVersion !== groups.trophySetVersion) { complete = false; warnings.push('Definição e progresso têm versões diferentes.'); }
      return { items: p.trophies, total: p.totalItemCount, ...(p.nextOffset === undefined ? {} : { next: p.nextOffset }) };
    }, t => String(t.trophyId));
    const normalized = normalize(definitions.items, progress.items, id);
    const expected = Object.values(group.definedTrophies).reduce((a,b) => a+b, 0);
    const ids = new Set(definitions.items.map(t => t.trophyId));
    if (!definitions.complete || !progress.complete || normalized.some(t => t.earned === null) || normalized.length !== expected || progress.items.some(t => !ids.has(t.trophyId))) {
      complete = false; warnings.push(`Dados incompletos ou divergentes no grupo ${id}.`);
    }
    trophies.push(...normalized);
  }
  trophies.sort((a,b) => a.id-b.id);
  const expectedTotal = Object.values(groups.definedTrophies).reduce((a,b) => a+b, 0);
  if (!groups.trophyGroups.length || trophies.length !== expectedTotal || new Set(trophies.map(t => t.id)).size !== trophies.length) { complete = false; warnings.push('Contagem total de troféus inconsistente.'); }
  return { schemaVersion: '1.0', generatedAt: now.toISOString(), account: { onlineId: account.onlineId },
    game: { name: game.trophyTitleName, platform: game.trophyTitlePlatform, trophyTitleId: game.npCommunicationId, service: game.npServiceName, trophySetVersion: groups.trophySetVersion },
    query: { complete, warnings: [...new Set(warnings)].sort(), expectedTotal, returnedTotal: trophies.length },
    summary: { ...summarize(trophies, complete), psnProgressPercentage: game.progress ?? null },
    groups: groups.trophyGroups.map(g => ({ id: g.trophyGroupId, name: g.trophyGroupName ?? null, kind: g.trophyGroupId === 'default' ? 'base' : 'additional', ...summarize(trophies.filter(t => t.groupId === g.trophyGroupId), complete) })).sort((a,b) => a.id.localeCompare(b.id, 'en')),
    trophies };
}
