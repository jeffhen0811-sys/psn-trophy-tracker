# PSN Trophy Tracker

CLI local em Node.js/TypeScript para exportar as definições e o progresso real dos troféus de um perfil PSN. Conta padrão: **MrHenroca**. Não exige senha PSN, frontend, banco de dados ou Docker.

## Instalação

Requer Node.js **22 ou superior**, npm e acesso à internet.

```bash
npm ci
npm run typecheck
npm test
npm run build
```

O código está em `src/`; o build gera `dist/`. Também é possível executar o build com `npm start -- --game "Resident Evil 2"`.

## Autenticação segura

1. Acesse [PlayStation](https://www.playstation.com/) no seu navegador e entre na conta que autoriza as consultas.
2. No mesmo navegador, abra [o endpoint NPSSO da Sony](https://ca.account.sony.com/api/v1/ssocookie). A resposta deve conter `npsso`. Se aparecer erro, confira o login ou tente outro navegador.
3. Execute no terminal local:

   ```bash
   npm run auth
   ```

4. Cole **apenas o valor** do NPSSO no prompt oculto e pressione Enter. O programa não exibe os caracteres digitados. Não cole o token neste chat.

O NPSSO é trocado por access e refresh tokens e não é persistido. A CLI não recebe senha nem aceita tokens em argumentos, evitando sua inclusão no histórico de comandos. Os tokens necessários ficam em `~/.config/psn-trophy-tracker/tokens.json`, fora do projeto, com diretório `0700` e arquivo `0600` em sistemas POSIX. Não são criptografados: proteja a conta do sistema e os backups. Opcionalmente defina `PSN_AUTH_DIR` como variável de ambiente para usar outro diretório privado. `.env.example` documenta essa variável; arquivos `.env` não são carregados automaticamente.

A validade informada pela API é armazenada. O access token é renovado com antecedência de um minuto; uma rejeição de autenticação durante uma consulta também provoca uma tentativa de renovação. Refresh token expirado ou revogado exige novo NPSSO e `npm run auth`. Nunca compartilhe NPSSO, tokens, cookies ou o arquivo local de autenticação com o ChatGPT. Para apagar a sessão, remova o arquivo local de tokens.

```bash
npm run auth -- --status
```

Esse comando verifica somente o estado local e não valida a sessão na Sony. A CLI nunca imprime mensagens brutas de erros externos, que podem conter dados sensíveis.

## Primeira consulta: Resident Evil 2 Remake

Depois de autenticar:

```bash
npm run trophies -- --game "Resident Evil 2" --account MrHenroca
```

Use o nome parcial `Resident Evil 2`, pois o nome registrado pela PSN pode não conter “Remake”. Se houver várias listas, escolha o número no terminal interativo. Para fixar a versão:

```bash
npm run trophies -- --game "Resident Evil 2" --platform PS5 --output ./exports/re2.json
npm run trophies -- --game "Resident Evil 2" --platform PS4
```

A plataforma deve corresponder à **lista de troféus**: um jogo PS4 executado no PS5 continua podendo ter uma lista PS4.

## Listar e selecionar jogos

```bash
npm run games
npm run games -- --game "resident" --platform PS5
npm run games -- --account OutroOnlineId
npm run trophies -- --title-id NPWR12345_00 --platform PS5
npm run trophies -- --help
```

O identificador acima é ilustrativo: use um `npCommunicationId` real exibido por `npm run games`. A busca é parcial, ignora maiúsculas/minúsculas e aplica nome, ID e plataforma em conjunto. Plataformas: PS3, PS4, PS5 e PSVITA. Conjuntos compartilhados podem informar várias plataformas.

Sem terminal interativo, múltiplas correspondências produzem erro com os candidatos, para que você refine `--title-id` e/ou `--platform`. Apenas jogos com listas de troféus associadas e sincronizadas ao perfil podem ser encontrados. A conta que autentica precisa ter permissão para ver o perfil consultado. Use `--account` em cada comando para trocar a conta; isso não altera a conta autenticada.

## Arquivo JSON

Sem `--output`, o caminho é `exports/<onlineId>-<npCommunicationId>-<service>.json`. A repetição substitui atomicamente o arquivo anterior após finalizar a consulta. Para guardar histórico, escolha outro nome com `--output` em cada execução. Não use o caminho do arquivo de tokens como saída.

Contrato `schemaVersion: "1.0"`:

| Campo | Conteúdo |
| --- | --- |
| `generatedAt` | Data UTC da geração |
| `account.onlineId` | Identificador público do jogador |
| `game` | Nome, plataforma, `trophyTitleId`, serviço e versão do conjunto |
| `query` | `complete`, avisos, total esperado e retornado |
| `summary` | Total retornado, conquistados, pendentes confirmados, desconhecidos, conclusão por quantidade e situação da platina |
| `summary.psnProgressPercentage` | Percentual informado pela PSN, que pode usar pesos e diferir da proporção por quantidade |
| `groups` | ID, nome, categoria base/adicional e resumo de cada grupo |
| `trophies` | Todos os troféus retornados pela definição, conquistados ou pendentes |

Cada troféu contém `id`, `name`, `description`, `type` (`bronze`, `silver`, `gold`, `platinum`), `hidden`, `earned`, `earnedAt`, `groupId`, `group` e `rarity`. IDs são preservados; compare pelo conjunto (`service` + `trophyTitleId`) e `id` do troféu em futuras exportações. Troféus são ordenados pelo ID e grupos pelo ID. Com os mesmos dados e data de geração, a serialização é determinística; `generatedAt` muda em cada consulta.

Dados não disponíveis são `null`. `earned: null` significa que o progresso está ausente, e **não** que o troféu está pendente. `remaining` conta apenas `earned: false`; `unknown` conta os estados desconhecidos. `total` conta os troféus retornados, enquanto `query.expectedTotal` registra o total declarado pela API. `completionPercentage` é conquistados/total × 100, com duas casas; fica `null` em consulta parcial ou lista vazia.

`platinumEarned` é `true` quando há platina conquistada, `false` quando a consulta completa confirma uma platina pendente, ou `null` quando indisponível. `platinumAvailable` distingue jogos sem platina quando a consulta está completa. A conclusão total inclui grupos adicionais e pode não ser necessária para platinar.

O grupo `default` é identificado como `base`; os demais como `additional`. Eles frequentemente correspondem a DLCs, mas a API não garante essa classificação comercial. `rarity.category` preserva os códigos da API: 0 ultrarraro, 1 muito raro, 2 raro, 3 comum. `rarity.earnedPercentage` é a porcentagem global de jogadores que conquistaram o troféu, quando fornecida. Nomes e descrições ocultos só são exportados se retornados pela API; nada é inferido ou revelado por fontes externas.

O JSON contém somente campos selecionados e não inclui credenciais nem a resposta bruta da PSN. Contém progresso e identificador público: compartilhe apenas se desejar.

## Atualizar o progresso

Sincronize os troféus no console e repita o mesmo comando. Os tokens serão renovados quando necessário. Envie ao ChatGPT somente o JSON de `exports/`. Para comparar duas datas, preserve o arquivo anterior usando nomes distintos.

## Respostas incompletas e erros

A integração pagina títulos e, para cada grupo, definições e progresso separadamente. Detecta páginas repetidas, ausência de progresso, mudanças de versão, totais divergentes e IDs duplicados entre grupos. Grupos são consultados individualmente para preservar a associação mesmo quando a API não inclui `trophyGroupId` em cada troféu.

Uma resposta incompleta é exportada com `query.complete: false`, avisos e estados desconhecidos. Erros de requisição interrompem a consulta sem substituir uma exportação anterior. A consulta não é uma transação: conquistas feitas durante a execução podem aparecer só na consulta seguinte. A lista de jogos e o percentual resumido também podem ter atraso de sincronização.

| Situação | Ação |
| --- | --- |
| Autenticação ausente ou expirada | Execute `npm run auth` com um NPSSO novo |
| Jogo não encontrado | Liste jogos, use parte do nome e confira conta, sincronização e privacidade |
| Várias versões encontradas | Use a seleção interativa, `--platform` ou `--title-id` |
| Falha na consulta | Confira conexão, permissões do perfil e disponibilidade PSN |
| Limite de requisições | A CLI aguarda e tenta novamente até três vezes, com pausas crescentes; se persistir, aguarde antes de repetir |
| Dados parciais | Leia `query.warnings`, sincronize e repita depois |
| Falha ao ler/gravar arquivos | Verifique permissões e o diretório configurado |

Códigos de saída: `0` sucesso, `1` erro, `2` resultado parcial. Respostas sem identificação clara de limitação de requisições podem aparecer como falha genérica: a biblioteca não preserva todos os status HTTP ou cabeçalhos, portanto não é possível garantir uso de `Retry-After`.

## Organização e testes

- `auth`: armazenamento local e renovação.
- `psn`: cliente, paginação e novas tentativas.
- `games`: busca e filtro de versões.
- `trophies` e `types`: cruzamento, normalização e resumos.
- `export`: gravação atômica e serialização.
- `cli`: argumentos, seleção e mensagens.

```bash
npm test
npm run typecheck
npm run build
```

Os testes usam **respostas simuladas**, sem autenticação real ou chamadas PSN. Cobrem busca, cruzamento de IDs, paginação, respostas incompletas, grupos, exportação determinística, ausência de credenciais no JSON, sessão local, renovação após rejeição e limites de requisições. A integração autenticada real não foi validada no desenvolvimento; depende de você configurar a sessão local.

## Biblioteca e limitações

Implementado com `psn-api` **2.18.1**, fixada no projeto, com tipos verificados contra a dependência instalada. Documentação consultada em 04/11/2026:

- [Repositório oficial da biblioteca](https://github.com/achievements-app/psn-api)
- [Autenticação manual](https://psn-api.achievements.app/authentication/authenticating-manually)
- [Renovação de tokens](https://psn-api.achievements.app/authentication/using-your-refresh-token)
- [Definições e grupos de troféus](https://psn-api.achievements.app/api-docs/title-trophies)
- [Títulos e progresso do usuário](https://psn-api.achievements.app/api-docs/user-trophies)
- [Perfis](https://psn-api.achievements.app/api-docs/users)

Métodos usados: `exchangeNpssoForAccessCode`, `exchangeAccessCodeForAuthTokens`, `exchangeRefreshTokenForAuthTokens`, `getProfileFromUserName`, `getUserTitles`, `getTitleTrophyGroups`, `getTitleTrophies` e `getUserTrophiesEarnedForTitle`.

A biblioteca usa interfaces PSN não públicas, sem garantia de estabilidade pela Sony. Alterações da PSN, privacidade, jogos sem suporte e indisponibilidade podem impedir consultas. O serviço é `trophy` para listas antigas e `trophy2` para PS5, conforme o título retornado pela API. Não há garantia de visibilidade de todo jogo ou troféu de qualquer conta.
