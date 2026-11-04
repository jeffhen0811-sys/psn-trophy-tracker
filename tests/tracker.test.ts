import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TrophyTitle, TitleThinTrophy, UserThinTrophy } from 'psn-api';
import { normalize, summarize, collect } from '../src/trophies.js';
import { findGames } from '../src/games.js';
import { Client, paginate, type Api } from '../src/psn.js';
import { exportJson } from '../src/export.js';
import { Auth } from '../src/auth.js';
const counts = { bronze: 1, silver: 0, gold: 0, platinum: 1 as const };
const title: TrophyTitle = { npServiceName: 'trophy2', npCommunicationId: 'NPWR12345_00', trophySetVersion: '1', trophyTitleName: 'Resident Evil 2', trophyTitlePlatform: 'PS5', trophyTitleIconUrl: '', hasTrophyGroups: false, definedTrophies: counts, progress: 50, earnedTrophies: { ...counts, platinum: 0 }, hiddenFlag: false, lastUpdatedDateTime: '' };
const definitions: TitleThinTrophy[] = [{ trophyId: 0, trophyType: 'platinum', trophyHidden: true }, { trophyId: 1, trophyType: 'bronze', trophyHidden: false, trophyName: 'Example', trophyDetail: 'Description' }];
const progress: UserThinTrophy[] = [{ trophyId: 0, trophyType: 'platinum', trophyHidden: true, earned: false }, { trophyId: 1, trophyType: 'bronze', trophyHidden: false, earned: true, earnedDateTime: '2026-11-04T00:00:00Z', trophyRare: 2, trophyEarnedRate: '10.5' }];
function api(partial = false): Api {
  return {
    getProfileFromUserName: async () => ({ profile: { onlineId: 'MrHenroca', accountId: '123' } } as Awaited<ReturnType<Api['getProfileFromUserName']>>),
    getUserTitles: async () => ({ trophyTitles: [title], totalItemCount: 1 }),
    getTitleTrophyGroups: async () => ({ trophySetVersion: '1', trophyTitleName: title.trophyTitleName, trophyTitleIconUrl: '', trophyTitlePlatform: 'PS5', definedTrophies: counts, trophyGroups: [{ trophyGroupId: 'default', trophyGroupName: 'Base', trophyGroupIconUrl: '', definedTrophies: counts }] }),
    getTitleTrophies: async (_a, _id, _group, opts) => ({ trophySetVersion: '1', hasTrophyGroups: false, trophies: definitions.slice(opts?.offset ?? 0, (opts?.offset ?? 0)+1), totalItemCount: 2 }),
    getUserTrophiesEarnedForTitle: async () => ({ trophySetVersion: '1', hasTrophyGroups: false, lastUpdatedDateTime: '', trophies: partial ? [progress[1]!] : progress, totalItemCount: 2 })
  };
}
const authorization = { authorization: async () => ({ accessToken: 'DO-NOT-EXPORT' }) };
test('busca parcial ignora caixa e distingue plataformas e IDs', () => {
  const ps4 = { ...title, npServiceName: 'trophy' as const, trophyTitlePlatform: 'PS4', npCommunicationId: 'NPWR99999_00' };
  assert.equal(findGames([title, ps4], { game: 'evil' }).length, 2);
  assert.deepEqual(findGames([title, ps4], { game: 'RESIDENT', platform: 'ps4' }), [ps4]);
  assert.deepEqual(findGames([title, ps4], { titleId: 'npwr12345_00' }), [title]);
  assert.deepEqual(findGames([title], { game: 'unknown' }), []);
});
test('normalização cruza IDs sem confundir definição com conquista', () => {
  const rows = normalize(definitions, [progress[1]!], 'default');
  assert.equal(rows[0]!.earned, null); assert.equal(rows[0]!.name, null);
  assert.equal(rows[1]!.earned, true); assert.equal(rows[1]!.group, 'base');
  assert.equal(rows[1]!.rarity.earnedPercentage, 10.5);
  assert.equal(summarize(rows, false).completionPercentage, null);
  assert.equal(summarize(rows, false).remaining, 0);
  assert.equal(summarize(rows, false).unknown, 1);
});
test('coleta usa definição paginada e progresso real; exportação sem credenciais', async () => {
  const client = new Client(authorization, api());
  const result = await collect(client, { onlineId: 'MrHenroca', accountId: '123' }, title, true, new Date('2026-11-04T00:00:00Z'));
  assert.equal(result.query.complete, true); assert.equal(result.summary.earned, 1); assert.equal(result.summary.remaining, 1);
  assert.equal(result.summary.platinumEarned, false); assert.equal(result.summary.completionPercentage, 50);
  assert.equal(result.trophies[0]!.groupId, 'default');
  const dir = await mkdtemp(join(tmpdir(), 'psn-export-'));
  try {
    const file = await exportJson(result, join(dir, 'nested', 'result.json'));
    const raw = await readFile(file, 'utf8'); assert.deepEqual(JSON.parse(raw), result);
    assert.doesNotMatch(raw, /DO-NOT-EXPORT|accessToken|refreshToken|npsso|accountId/);
    await exportJson(result, file); assert.equal(await readFile(file, 'utf8'), raw);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('resposta incompleta preserva estado desconhecido', async () => {
  const result = await collect(new Client(authorization, api(true)), { onlineId: 'MrHenroca', accountId: '123' }, title, true);
  assert.equal(result.query.complete, false); assert.equal(result.summary.unknown, 1);
  assert.equal(result.summary.platinumEarned, null); assert.equal(result.summary.completionPercentage, null);
});
test('paginação interrompe páginas repetidas e totais mutáveis', async () => {
  const repeated = await paginate(async () => ({ items: [1], total: 3 }), String);
  assert.deepEqual(repeated, { items: [1], complete: false });
  const changing = await paginate(async offset => ({ items: [offset], total: offset ? 4 : 3 }), String);
  assert.equal(changing.complete, false);
  const empty = await paginate(async () => ({ items: [], total: 0 }), String);
  assert.equal(empty.complete, true);
});
test('401 renova sessão uma vez; 429 tem tentativas limitadas', async () => {
  const forced: boolean[] = []; let calls = 0;
  const client = new Client({ authorization: async (force = false) => { forced.push(force); return { accessToken: 'secret' }; } }, api(), async () => {});
  assert.equal(await client.call(async () => { if (++calls === 1) throw new Error('401'); return 42; }), 42);
  assert.deepEqual(forced, [false, true]);
  calls = 0;
  await assert.rejects(client.call(async () => { calls++; throw new Error('429 secret'); }), /Limite de consultas/);
  assert.equal(calls, 4);
  await assert.rejects(client.call(async () => { throw new Error('secret-response'); }), e => e instanceof Error && !e.message.includes('secret-response'));
});
test('grupos adicionais preservam identificação sem afirmar que são DLC', () => {
  assert.equal(normalize(definitions, progress, '001')[0]!.group, 'additional');
  assert.equal(summarize(normalize([definitions[1]!], [progress[1]!]), true).platinumAvailable, false);
});
test('auth lê sessão privada e recusa refresh expirado sem chamar PSN', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'psn-auth-'));
  const previous = process.env.PSN_AUTH_DIR; process.env.PSN_AUTH_DIR = dir;
  try {
    const auth = new Auth(); assert.equal(await auth.read(), null);
    await assert.rejects(auth.authorization(), /ausente/);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(join(dir, 'tokens.json'), JSON.stringify({ accessToken: 'local', refreshToken: 'private', accessExpiresAt: Date.now()+300_000, refreshExpiresAt: Date.now()+600_000 }), { mode: 0o600 });
    assert.deepEqual(await auth.authorization(), { accessToken: 'local' });
    assert.equal((await stat(join(dir, 'tokens.json'))).mode & 0o777, 0o600);
    await writeFile(join(dir, 'tokens.json'), JSON.stringify({ accessToken: 'local', refreshToken: 'private', accessExpiresAt: 0, refreshExpiresAt: 0 }));
    await assert.rejects(auth.authorization(), /expirado/);
    await assert.rejects(auth.login('invalid'), /NPSSO inválido/);
  } finally { if (previous === undefined) delete process.env.PSN_AUTH_DIR; else process.env.PSN_AUTH_DIR = previous; await rm(dir, { recursive: true, force: true }); }
});
