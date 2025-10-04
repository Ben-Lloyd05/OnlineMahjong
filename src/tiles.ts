/**
 * American Mahjong tile utilities
 */

import { Tile, TileNumber, Dragon, Wind, Flower } from './types';

/**
 * Creates the complete set of 152 American Mahjong tiles
 */
export function createAmericanMahjongTileSet(): Tile[] {
  const tiles: Tile[] = [];

  // Craks (Characters) 1-9, four each = 36 tiles
  for (let num: TileNumber = 1; num <= 9; num++) {
    for (let i = 0; i < 4; i++) {
      tiles.push(`${num}C`);
    }
  }

  // Bams (Bamboos) 1-9, four each = 36 tiles
  for (let num: TileNumber = 1; num <= 9; num++) {
    for (let i = 0; i < 4; i++) {
      tiles.push(`${num}B`);
    }
  }

  // Dots 1-9, four each = 36 tiles
  for (let num: TileNumber = 1; num <= 9; num++) {
    for (let i = 0; i < 4; i++) {
      tiles.push(`${num}D`);
    }
  }

  // Dragons - four each = 12 tiles
  const dragons: Dragon[] = ['RD', 'GD', 'WD'];
  for (const dragon of dragons) {
    for (let i = 0; i < 4; i++) {
      tiles.push(dragon);
    }
  }

  // Winds - four each = 16 tiles
  const winds: Wind[] = ['N', 'E', 'S', 'W'];
  for (const wind of winds) {
    for (let i = 0; i < 4; i++) {
      tiles.push(wind);
    }
  }

  // Flowers - eight total = 8 tiles
  const flowers: Flower[] = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
  for (const flower of flowers) {
    tiles.push(flower);
  }

  // Jokers - eight total = 8 tiles
  for (let i = 0; i < 8; i++) {
    tiles.push('J');
  }

  return tiles; // Total: 36 + 36 + 36 + 12 + 16 + 8 + 8 = 152 tiles
}

/**
 * Gets the suit of a tile
 */
export function getTileSuit(tile: Tile): 'craks' | 'bams' | 'dots' | 'dragons' | 'winds' | 'flowers' | 'jokers' | null {
  if (tile === 'J') return 'jokers';
  if (tile.startsWith('F')) return 'flowers';
  if (['N', 'E', 'S', 'W'].includes(tile)) return 'winds';
  if (['RD', 'GD', 'WD'].includes(tile)) return 'dragons';
  if (tile.endsWith('C')) return 'craks';
  if (tile.endsWith('B')) return 'bams';
  if (tile.endsWith('D')) return 'dots';
  return null; // Unknown tile
}

/**
 * Gets the specific suit for dragons (which dragon corresponds to which numbered suit)
 */
export function getDragonSuit(dragon: 'RD' | 'GD' | 'WD'): 'craks' | 'bams' | 'dots' {
  switch (dragon) {
    case 'RD': return 'craks'; // Red Dragon = Craks suit
    case 'GD': return 'bams';  // Green Dragon = Bams suit  
    case 'WD': return 'dots';  // White Dragon = Dots suit
  }
}

/**
 * Groups tiles by their suit for validation
 */
export function groupTilesBySuit(tiles: Tile[]): Record<string, Tile[]> {
  const groups: Record<string, Tile[]> = {};
  
  for (const tile of tiles) {
    const suit = getTileSuit(tile);
    if (!suit) continue;
    
    if (!groups[suit]) groups[suit] = [];
    groups[suit].push(tile);
  }
  
  return groups;
}

/**
 * Checks if a tile can have a suit (i.e., not flowers or winds)
 */
export function tileHasSuit(tile: Tile): boolean {
  const suit = getTileSuit(tile);
  return suit !== null && !['flowers', 'winds', 'jokers'].includes(suit);
}

/**
 * Parses a pattern string from JSON to individual tiles
 * E.g., "222" -> ["2", "2", "2"], "FFFF" -> ["F", "F", "F", "F"]
 */
export function parsePatternToTiles(pattern: string): string[] {
  const tiles: string[] = [];
  let i = 0;
  
  while (i < pattern.length) {
    const char = pattern[i];
    
    if (/\d/.test(char)) {
      // Number tile - could be multi-digit
      let numStr = char;
      while (i + 1 < pattern.length && /\d/.test(pattern[i + 1])) {
        i++;
        numStr += pattern[i];
      }
      tiles.push(numStr);
    } else if (['F', 'D', 'N', 'E', 'W', 'S'].includes(char)) {
      // Special tile
      tiles.push(char);
    } else if (char === ' ') {
      // Skip spaces
    } else if (char === 'x' || char === '=') {
      // Skip mathematical symbols
    } else {
      // Unknown character, skip
    }
    
    i++;
  }
  
  return tiles;
}

/**
 * Gets the numeric value of a tile (for number tiles)
 */
export function getTileValue(tile: Tile): number | null {
  const match = tile.match(/^(\d+)[CBD]$/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Checks if a tile is a joker
 */
export function isJoker(tile: Tile): boolean {
  return tile === 'J';
}

/**
 * Checks if a tile is a flower
 */
export function isFlower(tile: Tile): boolean {
  return tile.startsWith('F');
}

/**
 * Checks if tiles are consecutive in the same suit
 */
export function areConsecutive(tiles: Tile[]): boolean {
  if (tiles.length < 2) return false;
  
  const suit = getTileSuit(tiles[0]);
  if (!suit || !['craks', 'bams', 'dots'].includes(suit)) return false;
  
  const values = tiles.map(getTileValue).filter(v => v !== null) as number[];
  if (values.length !== tiles.length) return false; // All must be number tiles
  
  values.sort((a, b) => a - b);
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== values[i-1] + 1) return false;
  }
  
  return true;
}

/**
 * Gets matching dragon for a suit (used in some hand patterns)
 */
export function getMatchingDragon(suit: string): Dragon {
  switch (suit) {
    case 'craks': return 'RD'; // Red Dragon matches Craks
    case 'bams': return 'GD';  // Green Dragon matches Bams  
    case 'dots': return 'WD';  // White Dragon matches Dots
    default: throw new Error(`No matching dragon for suit: ${suit}`);
  }
}

/**
 * Gets opposite dragons for a suit (used in some hand patterns)
 */
export function getOppositeDragons(suit: string): Dragon[] {
  switch (suit) {
    case 'craks': return ['GD', 'WD']; // Green and White opposite to Red
    case 'bams': return ['RD', 'WD'];  // Red and White opposite to Green
    case 'dots': return ['RD', 'GD'];  // Red and Green opposite to White
    default: throw new Error(`No opposite dragons for suit: ${suit}`);
  }
}

/**
 * Validates that tiles form a valid meld
 */
export function isValidMeld(tiles: Tile[], meldType: 'pong' | 'kong' | 'chow' | 'pair' | 'quint'): boolean {
  if (tiles.length === 0) return false;
  
  const jokerCount = tiles.filter(isJoker).length;
  const realTiles = tiles.filter(t => !isJoker(t));
  
  switch (meldType) {
    case 'pair':
      // Pairs cannot use jokers in American Mahjong
      if (jokerCount > 0) return false;
      if (tiles.length !== 2) return false;
      return realTiles.every(t => t === realTiles[0]);
      
    case 'pong':
      if (tiles.length !== 3) return false;
      if (jokerCount === 3) return false; // Cannot be all jokers
      return realTiles.every(t => t === realTiles[0]);
      
    case 'kong':
      if (tiles.length !== 4) return false;
      if (jokerCount === 4) return false; // Cannot be all jokers
      return realTiles.every(t => t === realTiles[0]);
      
    case 'quint':
      if (tiles.length !== 5) return false;
      if (jokerCount === 0 && !realTiles.every(isFlower)) {
        // Quints require jokers unless all flowers
        return false;
      }
      if (jokerCount === 5) return false; // Cannot be all jokers
      return realTiles.every(t => t === realTiles[0]);
      
    case 'chow':
      if (tiles.length !== 3) return false;
      return areConsecutive(tiles);
      
    default:
      return false;
  }
}