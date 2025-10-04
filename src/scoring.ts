/**
 * Scoring engine for mahjong hands.
 * Handles pattern matching and score calculation.
 */

import { RuleCard, HandPattern, Tile, Meld, GameState, PlayerId } from './types';
import { validateHandPattern } from './rulecard';

export type ScoringResult = {
  valid: boolean;
  pattern?: HandPattern;
  score?: number;
  breakdown?: {
    basePoints: number;
    patternPoints: number;
    flowerBonus: number;
    selfDrawBonus: number;
    kongBonus: number;
    penalties: number;
  };
  errors?: string[];
};

/**
 * Analyze a set of tiles and melds to identify matching patterns.
 */
function findMatchingPatterns(
  tiles: Tile[],
  melds: Meld[],
  patterns: HandPattern[]
): { pattern: HandPattern; errors?: string[] }[] {
  return patterns
    .map(pattern => {
      const validation = validateHandPattern(tiles, melds, pattern);
      return {
        pattern,
        errors: validation.valid ? [] : [validation.error || 'Pattern validation failed']
      };
    })
    .filter(result => !result.errors || result.errors.length === 0);
}

/**
 * Calculate bonuses for a winning hand.
 */
function calculateBonuses(
  tiles: Tile[],
  melds: Meld[],
  scoring: RuleCard['scoring'],
  selfDraw: boolean
): { flowerBonus: number; selfDrawBonus: number; kongBonus: number } {
  const flowerCount = tiles.filter(t => t.startsWith('F')).length;
  const kongCount = melds.filter(m => m.type === 'kong').length;

  return {
    flowerBonus: flowerCount * scoring.flowerPoints,
    selfDrawBonus: selfDraw ? scoring.selfDrawPoints : 0,
    kongBonus: kongCount * scoring.kongPoints
  };
}

/**
 * Calculate penalties for a winning hand.
 */
function calculatePenalties(
  state: GameState,
  player: PlayerId,
  scoring: RuleCard['scoring']
): number {
  // Check if last move was a claim
  const lastMove = state.logs[state.logs.length - 1];
  const wasClaim = lastMove?.type === 'claim' && lastMove.player === player;
  
  return wasClaim ? scoring.claimPenalty : 0;
}

/**
 * Score a mahjong hand against a rule card.
 */
export function scoreHand(
  state: GameState,
  player: PlayerId,
  ruleCard: RuleCard
): ScoringResult {
  const playerState = state.players[player];
  if (!playerState) {
    return { valid: false, errors: ['Player not found'] };
  }

  const { hand, melds } = playerState;

  // Find matching patterns
  const matches = findMatchingPatterns(hand, melds, ruleCard.patterns);
  if (matches.length === 0) {
    return {
      valid: false,
      errors: ['No matching patterns found']
    };
  }

  // Get highest scoring pattern
  const bestMatch = matches.reduce((best, current) => {
    return (current.pattern.points > best.pattern.points) ? current : best;
  });

  // Check minimum points requirement
  if (bestMatch.pattern.points < ruleCard.rules.minimumPoints) {
    return {
      valid: false,
      errors: [`Score ${bestMatch.pattern.points} below minimum ${ruleCard.rules.minimumPoints}`]
    };
  }

  // Calculate bonuses
  const lastMove = state.logs[state.logs.length - 1];
  const selfDraw = lastMove?.type === 'draw' && lastMove.player === player;
  const bonuses = calculateBonuses(hand, melds, ruleCard.scoring, selfDraw);
  const penalties = calculatePenalties(state, player, ruleCard.scoring);

  // Calculate total score
  const breakdown = {
    basePoints: ruleCard.scoring.basicPoints,
    patternPoints: bestMatch.pattern.points,
    ...bonuses,
    penalties
  };

  const totalScore = (
    breakdown.basePoints +
    breakdown.patternPoints +
    breakdown.flowerBonus +
    breakdown.selfDrawBonus +
    breakdown.kongBonus -
    breakdown.penalties
  );

  return {
    valid: true,
    pattern: bestMatch.pattern,
    score: totalScore,
    breakdown
  };
}

/**
 * Verify if a hand meets the minimum requirements for declaring mahjong.
 */
export function canDeclareMahjong(
  state: GameState,
  player: PlayerId,
  ruleCard: RuleCard
): { valid: boolean; errors?: string[] } {
  const result = scoreHand(state, player, ruleCard);
  
  if (!result.valid) {
    return {
      valid: false,
      errors: result.errors
    };
  }

  // Check if score meets minimum requirement
  if (result.score! < ruleCard.rules.minimumPoints) {
    return {
      valid: false,
      errors: [`Score ${result.score} below minimum ${ruleCard.rules.minimumPoints}`]
    };
  }

  return { valid: true };
}