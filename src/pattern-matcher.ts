// path: mahjong-ts/src/pattern-matcher.ts
import { Tile, HandPattern, Exposure } from './types';

/**
 * Parse a hand pattern string into tile requirements
 * e.g., "222" -> three 2s of the same suit
 * e.g., "FFFF" -> four flowers
 * e.g., "NNNN" -> four North winds
 */
export interface ParsedSection {
  pattern: string; // Original pattern string
  tiles: TileRequirement[];
  minTiles: number;
  maxTiles: number;
}

export interface TileRequirement {
  value: string; // '2', 'F', 'N', 'D' (dragon), etc.
  isWind: boolean;
  isFlower: boolean;
  isDragon: boolean;
  isNumber: boolean;
  requiresSuit: boolean; // True if this must be part of a suited group
}

/**
 * Parse a pattern section string
 */
export function parsePatternSection(section: string): ParsedSection {
  const tiles: TileRequirement[] = [];
  
  for (const char of section.trim()) {
    const req: TileRequirement = {
      value: char,
      isWind: ['N', 'E', 'S', 'W'].includes(char),
      isFlower: char === 'F',
      isDragon: char === 'D',
      isNumber: /[0-9]/.test(char),
      requiresSuit: false
    };
    
    // Numbers require suits
    if (req.isNumber) {
      req.requiresSuit = true;
    }
    
    tiles.push(req);
  }
  
  return {
    pattern: section,
    tiles,
    minTiles: tiles.length,
    maxTiles: tiles.length
  };
}

/**
 * Check if a tile matches a requirement
 */
export function tileMatchesRequirement(tile: Tile, req: TileRequirement, suit?: 'C' | 'B' | 'D'): boolean {
  // Joker matches anything (handled separately)
  if (tile === 'J') return true;
  
  // Flowers
  if (req.isFlower) {
    return tile.startsWith('F');
  }
  
  // Winds
  if (req.isWind) {
    return tile === req.value;
  }
  
  // Dragons - need to handle suit-specific dragons
  if (req.isDragon) {
    // Check for any dragon
    return tile === 'RD' || tile === 'GD' || tile === 'WD';
  }
  
  // Numbers with suit
  if (req.isNumber && suit) {
    return tile === `${req.value}${suit}`;
  }
  
  return false;
}

/**
 * Extract suit from a tile
 */
export function getTileSuit(tile: Tile): 'C' | 'B' | 'D' | null {
  if (tile.endsWith('C')) return 'C';
  if (tile.endsWith('B')) return 'B';
  if (tile.endsWith('D')) return 'D';
  return null;
}

/**
 * Check if tiles can form a valid section of a pattern
 */
export function matchSectionToTiles(
  tiles: Tile[],
  section: ParsedSection,
  allowedSuit?: 'C' | 'B' | 'D'
): { matches: boolean; usedTiles: Tile[]; suit?: 'C' | 'B' | 'D' } {
  // Must have exact number of tiles
  if (tiles.length !== section.tiles.length) {
    return { matches: false, usedTiles: [] };
  }
  
  // Try to match tiles to requirements
  const usedTiles: Tile[] = [];
  const requirements = [...section.tiles];
  const availableTiles = [...tiles];
  
  // Determine suit from first non-joker, non-special tile
  let sectionSuit = allowedSuit;
  if (!sectionSuit) {
    for (const tile of availableTiles) {
      if (tile !== 'J') {
        const tileSuit = getTileSuit(tile);
        if (tileSuit) {
          sectionSuit = tileSuit;
          break;
        }
      }
    }
  }
  
  // Match each requirement
  for (const req of requirements) {
    let matched = false;
    
    for (let i = 0; i < availableTiles.length; i++) {
      const tile = availableTiles[i];
      
      if (tileMatchesRequirement(tile, req, sectionSuit)) {
        usedTiles.push(tile);
        availableTiles.splice(i, 1);
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      return { matches: false, usedTiles: [] };
    }
  }
  
  return { matches: true, usedTiles, suit: sectionSuit };
}

/**
 * Parse the full hand pattern from JSON format
 * Handles patterns like ["222", "000", "2222 4444"]
 */
export function parseHandPattern(patternArray: string[]): ParsedSection[][] {
  const groups: ParsedSection[][] = [];
  
  for (const group of patternArray) {
    const sections = group.split(/\s+/).filter(s => s.length > 0);
    const parsedSections = sections.map(s => parsePatternSection(s));
    groups.push(parsedSections);
  }
  
  return groups;
}

/**
 * Check if a hand matches a pattern
 * This is the main matching algorithm
 */
export function matchesHandPattern(
  hand: Tile[],
  exposures: Exposure[],
  patternGroups: ParsedSection[][]
): boolean {
  // Collect all tiles
  const allTiles = [...hand];
  for (const exposure of exposures) {
    allTiles.push(...exposure.tiles);
  }
  
  // Must have exactly 14 tiles
  if (allTiles.length !== 14) return false;
  
  // Flatten pattern groups into sections
  const allSections = patternGroups.flat();
  
  // Count total tiles required by pattern
  const requiredTiles = allSections.reduce((sum, section) => sum + section.minTiles, 0);
  
  if (requiredTiles !== 14) {
    console.warn('Pattern does not require 14 tiles:', requiredTiles);
    return false;
  }
  
  // Separate sections by whether they need suits
  const suitedSections: ParsedSection[] = [];
  const unsuitedSections: ParsedSection[] = [];
  
  for (const section of allSections) {
    if (section.tiles.some(t => t.requiresSuit)) {
      suitedSections.push(section);
    } else {
      unsuitedSections.push(section);
    }
  }
  
  // Try to match
  return tryMatchRecursive(
    allTiles,
    suitedSections,
    unsuitedSections,
    [],
    0
  );
}

/**
 * Recursive backtracking algorithm for pattern matching
 */
function tryMatchRecursive(
  remainingTiles: Tile[],
  suitedSections: ParsedSection[],
  unsuitedSections: ParsedSection[],
  suitAssignments: Array<'C' | 'B' | 'D' | null>,
  sectionIndex: number
): boolean {
  // Base case: all sections matched
  if (sectionIndex >= suitedSections.length + unsuitedSections.length) {
    return remainingTiles.length === 0;
  }
  
  // Determine current section
  const isUnsuited = sectionIndex >= suitedSections.length;
  const section = isUnsuited 
    ? unsuitedSections[sectionIndex - suitedSections.length]
    : suitedSections[sectionIndex];
  
  if (isUnsuited) {
    // Try to match unsuited section (winds, flowers, dragons)
    const matchResult = tryMatchSection(remainingTiles, section, null);
    if (matchResult) {
      const newRemaining = remainingTiles.filter(t => !matchResult.usedTiles.includes(t));
      if (tryMatchRecursive(newRemaining, suitedSections, unsuitedSections, suitAssignments, sectionIndex + 1)) {
        return true;
      }
    }
    return false;
  } else {
    // Try each suit for this suited section
    const suits: ('C' | 'B' | 'D')[] = ['C', 'B', 'D'];
    
    for (const suit of suits) {
      // Check if this suit is already used by another section in the same group
      // For simplicity, we'll allow reuse unless explicitly constrained
      
      const matchResult = tryMatchSection(remainingTiles, section, suit);
      if (matchResult) {
        const newRemaining = remainingTiles.filter(t => !matchResult.usedTiles.includes(t));
        const newAssignments = [...suitAssignments, suit];
        
        if (tryMatchRecursive(newRemaining, suitedSections, unsuitedSections, newAssignments, sectionIndex + 1)) {
          return true;
        }
      }
    }
    return false;
  }
}

/**
 * Try to match tiles to a section with a specific suit
 */
function tryMatchSection(
  tiles: Tile[],
  section: ParsedSection,
  suit: 'C' | 'B' | 'D' | null
): { usedTiles: Tile[] } | null {
  const requirements = [...section.tiles];
  const usedTiles: Tile[] = [];
  const availableTiles = [...tiles];
  
  // Try to match each requirement
  for (const req of requirements) {
    let matched = false;
    
    // First pass: try to match with exact tiles
    for (let i = 0; i < availableTiles.length; i++) {
      const tile = availableTiles[i];
      
      if (tile !== 'J' && tileMatchesRequirement(tile, req, suit || undefined)) {
        usedTiles.push(tile);
        availableTiles.splice(i, 1);
        matched = true;
        break;
      }
    }
    
    // Second pass: use joker if available
    if (!matched) {
      const jokerIndex = availableTiles.indexOf('J');
      if (jokerIndex !== -1) {
        usedTiles.push('J');
        availableTiles.splice(jokerIndex, 1);
        matched = true;
      }
    }
    
    if (!matched) {
      return null;
    }
  }
  
  // Validate joker usage: if jokers present, section must have 3+ tiles
  const jokerCount = usedTiles.filter(t => t === 'J').length;
  if (jokerCount > 0 && usedTiles.length < 3) {
    return null;
  }
  
  return { usedTiles };
}

/**
 * Simplified win check for testing
 * Just checks tile count for now
 */
export function simpleWinCheck(
  hand: Tile[],
  exposures: Exposure[]
): boolean {
  const allTiles = [...hand];
  for (const exposure of exposures) {
    allTiles.push(...exposure.tiles);
  }
  
  return allTiles.length === 14;
}
