import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Auth } from './auth.js';
import { Client } from './psn.js';
import { findGames } from './games.js';
import { collect } from './trophies.js';
import { exportJson } from './export.js';
import { AppError } from './errors.js';
const help = `PSN Trophy Tracker (Node.js 22+)\n\nnpm run auth                    Autenticar com NPSSO oculto\nnpm run auth -- --status         Estado local da sessão\nnpm run games -- --account MrHenroca\nnpm run trophies -- --game "Resident Evil 2" [--platform PS5]\nnpm run trophies -- --title-id NPWRxxxxx_00 [--output ./exports/re2.json]\n\nOpções: --account (padrão MrHenroca), --game, --platform PS3|PS4|PS5|PSVITA,\n--title-id, --output, --help. Para resultados parciais, o código de saída é 2.`;
async function secret(): Promise<string> {
  if (!stdin.isTTY) throw new AppError('Execute npm run auth em um terminal interativo para informar o NPSSO com entrada oculta.');
  stdout.write('NPSSO (entrada oculta): '); stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const done = () => { stdin.removeListener('data', onData); stdin.setRawMode(false); stdin.pause(); stdout.write('\n'); };
    const onData = (chunk: string) => { for (const c of chunk) {
      if (c === '\u0003' || c === '\u0004') { done(); reject(new AppError('Autenticação cancelada.')); return; }
      if (c === '\r' || c === '\n') { done(); resolve(value.trim()); return; }
      if (c === '\u007f' || c === '\b') value = value.slice(0,-1); else if (c >= ' ') value += c;
    } };
    stdin.on('data', onData);
  });
}
async function main() {
  let args: ReturnType<typeof parseArgs>;
  try { args = parseArgs({ allowPositionals: true, options: { game: { type: 'string' }, platform: { type: 'string' }, 'title-id': { type: 'string' }, output: { type: 'string' }, account: { type: 'string' }, status: { type: 'boolean' }, help: { type: 'boolean' } } }); }
  catch { throw new AppError('Argumentos inválidos. Use npm run trophies -- --help.'); }
  const v = args.values;
  if (v.help) { console.log(help); return; }
  const command = args.positionals[0] ?? 'trophies';
  if (args.positionals.length > 1 || !['auth','games','trophies'].includes(command)) throw new AppError('Comando inválido. Use --help.');
  for (const value of Object.values(v)) if (typeof value === 'string' && !value.trim()) throw new AppError('Os parâmetros não podem estar vazios.');
  const auth = new Auth();
  if (command === 'auth') {
    if (Object.keys(v).some(k => k !== 'status')) throw new AppError('auth aceita apenas --status.');
    if (v.status) { const t = await auth.read(); console.log(!t ? 'Sessão não configurada.' : t.refreshExpiresAt <= Date.now() ? 'Sessão expirada. Execute npm run auth.' : t.accessExpiresAt <= Date.now() + 60_000 ? 'Token de acesso expirado; renovação automática disponível.' : 'Sessão local configurada (não verificada na PSN).'); return; }
    await auth.login(await secret()); console.log('Autenticação salva no diretório privado local.'); return;
  }
  if (v.status) throw new AppError('--status é válido apenas em auth.');
  const platform = typeof v.platform === 'string' ? v.platform.toUpperCase() : undefined;
  if (platform && !['PS3','PS4','PS5','PSVITA'].includes(platform)) throw new AppError('Plataforma inválida. Use PS3, PS4, PS5 ou PSVITA.');
  const game = typeof v.game === 'string' ? v.game : undefined;
  const titleId = typeof v['title-id'] === 'string' ? v['title-id'] : undefined;
  if (command === 'trophies' && !game && !titleId) throw new AppError('Informe --game ou --title-id. Use --help para exemplos.');
  if (titleId && !/^NPWR\d+_\d+$/i.test(titleId)) throw new AppError('Identificador inválido. Use o npCommunicationId exibido por npm run games.');
  const client = new Client(auth);
  const account = await client.account(typeof v.account === 'string' ? v.account : 'MrHenroca');
  const games = await client.games(account.accountId);
  const matches = findGames(games.items, { ...(game ? { game } : {}), ...(titleId ? { titleId } : {}), ...(platform ? { platform } : {}) });
  const label = (g: (typeof matches)[number]) => `${g.trophyTitleName} | ${g.trophyTitlePlatform} | ${g.npCommunicationId}`;
  if (command === 'games') { console.log(matches.map(label).join('\n') || 'Nenhum jogo encontrado.'); if (!games.complete) { console.log('Atenção: lista parcial.'); process.exitCode = 2; } return; }
  if (!matches.length) throw new AppError(`Jogo não encontrado${games.complete ? '' : ' na lista parcial'}. Use npm run games; tente "Resident Evil 2" sem "Remake". Confira sincronização e privacidade do perfil.`);
  let selected = matches[0]!;
  if (matches.length > 1) {
    console.log(matches.map((g,i) => `${i+1}. ${label(g)}`).join('\n'));
    if (!stdin.isTTY || !stdout.isTTY) throw new AppError('Múltiplos jogos encontrados. Informe --title-id e/ou --platform.');
    const rl = createInterface({ input: stdin, output: stdout });
    try { const answer = await rl.question('Escolha o número do jogo: '); const n = Number(answer); if (!Number.isInteger(n) || n < 1 || n > matches.length) throw new AppError('Seleção inválida.'); selected = matches[n-1]!; } finally { rl.close(); }
  }
  const result = await collect(client, account, selected, games.complete);
  const output = typeof v.output === 'string' ? v.output : `exports/${account.onlineId.replace(/[^a-zA-Z0-9_-]/g, '_')}-${selected.npCommunicationId}-${selected.npServiceName}.json`;
  const file = await exportJson(result, output);
  const s = result.summary;
  console.log(`${selected.trophyTitleName} (${selected.trophyTitlePlatform})\n${s.earned}/${s.total} conquistados; ${s.remaining} pendentes; ${s.unknown} desconhecidos.\nConclusão por quantidade: ${s.completionPercentage === null ? 'indisponível' : s.completionPercentage + '%'}; platina: ${s.platinumEarned === true ? 'conquistada' : s.platinumEarned === false ? 'pendente' : 'indisponível'}.\nConsulta ${result.query.complete ? 'completa' : 'parcial'}. JSON: ${file}`);
  if (!result.query.complete) { console.log(result.query.warnings.join('\n')); process.exitCode = 2; }
}
main().catch((e: unknown) => { console.error(e instanceof AppError ? e.message : 'Erro inesperado ao executar a operação. Confira as permissões dos arquivos e a configuração local.'); process.exitCode = 1; });
