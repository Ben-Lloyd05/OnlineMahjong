/**
 * Suit Constraint Validator for American Mahjong
 * Validates that hand sections follow suit rules: same suit within section, different suits between sections
 */

import { HandPattern, HandSection, SuitConstraint, Tile, Meld } from './types';
import { getTileSuit, getDragonSuit, tileHasSuit, groupTilesBySuit } from './tiles';

export interface SuitValidationResult {
  valid: boolean;
  errors: string[];
  suitAssignments?: Record<number, string>; // section index -> suit
}

/**
 * Gets the effective suit of a tile (handles dragons)
 */
function getEffectiveSuit(tile: Tile): string | null {
  const baseSuit = getTileSuit(tile);
  
  if (baseSuit === 'dragons') {
    // Dragons have specific suit associations
    return getDragonSuit(tile as 'RD' | 'GD' | 'WD');
  }
  
  if (baseSuit === 'flowers' || baseSuit === 'winds' || baseSuit === 'jokers') {
    return null; // These don't participate in suit constraints
  }
  
  return baseSuit;
}

/**
 * Validates that all tiles in a section are the same suit
 */
function validateSectionSuit(tiles: Tile[], section: HandSection): { valid: boolean; suit: string | null; error?: string } {
  const suitedTiles = tiles.filter(tile => {
    const suit = getEffectiveSuit(tile);
    return suit !== null;
  });
  
  if (suitedTiles.length === 0) {
    return { valid: true, suit: null }; // No suited tiles, no constraint
  }
  
  const firstSuit = getEffectiveSuit(suitedTiles[0]);
  
  for (let i = 1; i < suitedTiles.length; i++) {
    const tileSuit = getEffectiveSuit(suitedTiles[i]);
    if (tileSuit !== firstSuit) {
      return {
        valid: false,
        suit: null,
        error: `Section "${section.pattern}" contains mixed suits: ${firstSuit} and ${tileSuit}`
      };
    }
  }
  
  return { valid: true, suit: firstSuit };
}

/**
 * Groups hand tiles by section based on the pattern
 */
function groupTilesBySection(hand: Tile[], melds: Meld[], pattern: HandPattern): Tile[][] {
  // Combine all tiles from hand and melds
  const allTiles = [...hand];
  for (const meld of melds) {
    allTiles.push(...meld.tiles);
  }
  
  // For now, use a simple approach: distribute tiles evenly across sections
  // This is a simplification - a real implementation would need more sophisticated matching
  const sections: Tile[][] = pattern.sections.map(() => []);
  
  let tileIndex = 0;
  for (let sectionIndex = 0; sectionIndex < pattern.sections.length; sectionIndex++) {
    const section = pattern.sections[sectionIndex];
    const expectedTileCount = section.tiles.length;
    
    for (let i = 0; i < expectedTileCount && tileIndex < allTiles.length; i++) {
      sections[sectionIndex].push(allTiles[tileIndex]);
      tileIndex++;
    }
  }
  
  return sections;
}

/**
 * Validates suit constraints for a complete hand pattern
 */
export function validateSuitConstraints(
  hand: Tile[], 
  melds: Meld[], 
  pattern: HandPattern
): SuitValidationResult {
  const errors: string[] = [];
  const suitAssignments: Record<number, string> = {};
  
  // Group tiles by section
  const sectionTiles = groupTilesBySection(hand, melds, pattern);
  
  // Validate each section internally
  for (let i = 0; i < pattern.sections.length; i++) {
    const section = pattern.sections[i];
    const tiles = sectionTiles[i];
    
    if (!tiles || tiles.length === 0) {
      errors.push(`Section ${i} ("${section.pattern}") has no tiles`);
      continue;
    }
    
    const sectionResult = validateSectionSuit(tiles, section);
    if (!sectionResult.valid) {
      errors.push(sectionResult.error!);
      continue;
    }
    
    if (sectionResult.suit) {
      suitAssignments[i] = sectionResult.suit;
    }
  }
  
  // Validate constraints between sections
  for (const constraint of pattern.suitConstraints) {
    const [section1Index, section2Index] = constraint.sections;
    
    const suit1 = suitAssignments[section1Index];
    const suit2 = suitAssignments[section2Index];
    
    // Skip if either section has no suit (flowers/winds only)
    if (!suit1 || !suit2) continue;
    
    if (constraint.type === 'same') {
      if (suit1 !== suit2) {
        errors.push(`Sections ${section1Index} and ${section2Index} must be the same suit, but got ${suit1} and ${suit2}`);
      }
    } else if (constraint.type === 'different') {
      if (suit1 === suit2) {
        errors.push(`Sections ${section1Index} and ${section2Index} must be different suits, but both are ${suit1}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    suitAssignments: errors.length === 0 ? suitAssignments : undefined
  };
}

/**
 * Checks if a hand could potentially match a pattern (loose validation)
 */
export function couldMatchPattern(hand: Tile[], melds: Meld[], pattern: HandPattern): boolean {
  // Count total tiles
  const totalTiles = hand.length + melds.reduce((sum, meld) => sum + meld.tiles.length, 0);
  const expectedTiles = pattern.sections.reduce((sum, section) => sum + section.tiles.length, 0);
  
  if (totalTiles !== expectedTiles) {
    return false;
  }
  
  // Check joker count
  const jokerCount = [...hand, ...melds.flatMap(m => m.tiles)].filter(t => t === 'J').length;
  if (jokerCount > pattern.allowedJokers) {
    return false;
  }
  
  // Check special rules
  if (pattern.specialRules?.noJokers && jokerCount > 0) {
    return false;
  }
  
  return true;
}

/**
 * Gets all possible suit assignments for a pattern
 */
export function getPossibleSuitAssignments(pattern: HandPattern): Record<number, string[]> {
  const assignments: Record<number, string[]> = {};
  
  const availableSuits = ['craks', 'bams', 'dots'];
  
  // For each section that requires a suit
  for (let i = 0; i < pattern.sections.length; i++) {
    const section = pattern.sections[i];
    
    if (section.allowsFlowers && !section.allowsDragons) {
      // Flowers only - no suit needed
      assignments[i] = [];
    } else if (section.allowsWinds && !section.allowsDragons) {
      // Winds only - no suit needed  
      assignments[i] = [];
    } else {
      // Requires a suit
      assignments[i] = [...availableSuits];
    }
  }
  
  // Apply constraints to narrow down possibilities
  for (const constraint of pattern.suitConstraints) {
    const [section1Index, section2Index] = constraint.sections;
    
    if (constraint.type === 'same') {
      // Sections must be same suit - intersect their possibilities
      const common = assignments[section1Index]?.filter(suit => 
        assignments[section2Index]?.includes(suit)
      ) || [];
      assignments[section1Index] = common;
      assignments[section2Index] = common;
    }
    // For 'different' constraints, we'd need more complex logic to handle all combinations
  }
  
  return assignments;
}