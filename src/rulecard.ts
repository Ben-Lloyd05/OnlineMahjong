/**
 * American Mahjong rulecard and hand pattern definitions
 */

import { HandPattern, HandCategory, RuleCard, Tile, Meld } from './types';
import { getTileSuit, getTileValue, getMatchingDragon, getOppositeDragons } from './tiles';
import { load2024RuleCard, getHandsByCategory, findHandByName } from './rulecard-parser';
import { validateSuitConstraints, couldMatchPattern } from './suit-validator';

/**
 * Creates the 2024 American Mahjong rulecard from JSON data
 */
export function create2024AmericanRuleCard(): RuleCard {
  return load2024RuleCard();
}

/**
 * Gets all hands for a specific category
 */
export { getHandsByCategory, findHandByName };

/**
 * Validates if a complete hand matches a specific pattern using new suit constraint system
 */
export function validateHandPattern(hand: Tile[], melds: Meld[], pattern: HandPattern): {
  valid: boolean;
  error?: string;
  jokerCount?: number;
} {
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  const jokerCount = allTiles.filter(t => t === 'J').length;
  
  if (pattern.specialRules?.noJokers && jokerCount > 0) {
    return { valid: false, error: 'This hand pattern does not allow jokers' };
  }
  
  if (jokerCount > pattern.allowedJokers) {
    return { 
      valid: false, 
      error: `Too many jokers: ${jokerCount}, max allowed: ${pattern.allowedJokers}` 
    };
  }

  if (allTiles.length !== 14) {
    return { valid: false, error: 'Hand must contain exactly 14 tiles' };
  }

  // Use new suit constraint validation
  const suitResult = validateSuitConstraints(hand, melds, pattern);
  if (!suitResult.valid) {
    return { 
      valid: false, 
      error: `Suit constraint violation: ${suitResult.errors.join(', ')}` 
    };
  }
  
  return { 
    valid: true, 
    jokerCount 
  };
}

/**
 * Gets all possible hands that a player could be working towards
 */
export function getPossibleHands(hand: Tile[], melds: Meld[], ruleCard: RuleCard): HandPattern[] {
  return ruleCard.patterns.filter(pattern => {
    return couldMatchPattern(hand, melds, pattern);
  });
}

/**
 * Calculates the score for a winning hand
 */
export function calculateHandScore(pattern: HandPattern, jokerCount: number): number {
  let score = pattern.points;
  
  // Bonus for fewer jokers used (difficulty bonus)
  const unusedJokers = pattern.allowedJokers - jokerCount;
  score += unusedJokers * 2;
  
  return Math.max(score, 25); // Minimum 25 points
}