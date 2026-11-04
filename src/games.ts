import type { TrophyTitle } from 'psn-api';
export function findGames(games: TrophyTitle[], query: { game?: string; titleId?: string; platform?: string }): TrophyTitle[] {
  return games.filter(g => (!query.titleId || g.npCommunicationId.toLowerCase() === query.titleId.toLowerCase()) && (!query.game || g.trophyTitleName.toLowerCase().includes(query.game.toLowerCase())) && (!query.platform || g.trophyTitlePlatform.split(',').some(p => p.trim().toLowerCase() === query.platform!.toLowerCase()))).sort((a,b) => a.trophyTitleName.localeCompare(b.trophyTitleName, 'en') || a.trophyTitlePlatform.localeCompare(b.trophyTitlePlatform, 'en') || a.npCommunicationId.localeCompare(b.npCommunicationId, 'en'));
}
