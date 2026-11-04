import type { TrophyType } from 'psn-api';
export interface NormalizedTrophy {
  id: number; name: string | null; description: string | null; type: TrophyType;
  hidden: boolean | null; earned: boolean | null; earnedAt: string | null;
  groupId: string | null; group: 'base' | 'additional' | null;
  rarity: { category: number | null; earnedPercentage: number | null };
}
