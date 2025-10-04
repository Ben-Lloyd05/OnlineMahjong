// path: mahjong-ts/src/nmjl_loader.ts
/**
 * NMJL rule-card loader.
 * Converts nmjl_mahjong_hands_filled.json into a usable RuleCard for a given year.
 * NOTE: The NMJL card text is highly expressive. For now, we convert each line
 * into a generic pattern placeholder that requires a valid mahjong structure
 * and assigns category-aware names and baseline points. Detailed tile-layout
 * validation is deferred to specialized validators.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { RuleCard } from './types';
import { load2024RuleCard } from './rulecard-parser';

// Simple baseline points per category to give some variety across hands
const CATEGORY_BASE_POINTS: Record<string, number> = {
  '2024': 25,
  '2025': 25,
  'Quints': 50,
  'Winds-Dragons': 30,
  '2468': 25,
  'Consecutive Run': 25,
  '369': 25,
  'Any Like Numbers': 30,
  '13579': 25,
  'Addition Hands': 30,
  'Singles & Pairs': 40
};

function loadRawCard(): any {
  const jsonPath = resolve(__dirname, '../nmjl_mahjong_hands_filled.json');
  const raw = readFileSync(jsonPath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Create a RuleCard for a given year using the JSON card data.
 * The resulting RuleCard uses generic meld patterns (PPPPD) to allow play,
 * while preserving hand names for UI and scoring variety per category.
 */
export function getRuleCardForYear(year: 2024 | 2025): RuleCard {
  const data = loadRawCard();
  const yearKey = String(year);
  const yearData = data[yearKey];
  if (!yearData) {
    throw new Error(`No NMJL data for year ${year}`);
  }

  const patterns: RuleCard['patterns'] = [] as any;

  for (const category of Object.keys(yearData)) {
    const hands: string[] = yearData[category];
    if (!Array.isArray(hands)) continue;
    const basePoints = CATEGORY_BASE_POINTS[category] ?? 25;
    hands.forEach((handText, idx) => {
      // Use a generic 4 melds + 1 pair template so current engine can validate structure
      // The name retains category and original text for visibility.
      // Map to our richer HandPattern schema with placeholders
      (patterns as any).push({
        name: `${category} ${idx + 1}: ${handText}`,
        category: (category.toLowerCase().replace(/\s+/g, '-') as any) || 'consecutive',
        points: basePoints,
        isOpen: true,
        pattern: 'PPPPD',
        sections: [
          { pattern: 'PPP', tiles: [], allowsFlowers: true, allowsDragons: true, allowsWinds: true, mustBeSameSuit: false },
          { pattern: 'PPP', tiles: [], allowsFlowers: true, allowsDragons: true, allowsWinds: true, mustBeSameSuit: false },
          { pattern: 'PPP', tiles: [], allowsFlowers: true, allowsDragons: true, allowsWinds: true, mustBeSameSuit: false },
          { pattern: 'PPP', tiles: [], allowsFlowers: true, allowsDragons: true, allowsWinds: true, mustBeSameSuit: false },
          { pattern: 'DD',  tiles: [], allowsFlowers: true, allowsDragons: true, allowsWinds: true, mustBeSameSuit: false }
        ],
        suitConstraints: [],
        allowedJokers: 8,
        specialRules: {}
      });
    });
  }

  return {
    name: `NMJL ${year}`,
    year,
    patterns: patterns as any,
    rules: {
      charlestonPasses: 3,
      allowKongDrawAfter: true,
      allowRobbingKong: true,
      maxJokersPerHand: 8,
      jokerReplacements: true,
      allowChowClaim: false,
      allowKongClaim: true,
      selfDrawBonus: 10,
      flowerBonus: 4,
      minimumPoints: 0
    },
    scoring: {
      basicPoints: 25,
      flowerPoints: 4,
      selfDrawPoints: 10,
      kongPoints: 2,
      claimPenalty: 10
    }
  };
}


