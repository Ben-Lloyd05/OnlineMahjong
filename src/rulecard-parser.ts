/**
 * JSON Rule Card Parser for American Mahjong
 * Converts 2024 Hands.json into HandPattern objects with suit constraints
 */

import { HandPattern, HandSection, SuitConstraint, HandCategory, RuleCard } from './types';
import { parsePatternToTiles } from './tiles';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Determines if a pattern string contains flowers
 */
function containsFlowers(pattern: string): boolean {
  return pattern.includes('F');
}

/**
 * Determines if a pattern string contains dragons
 */
function containsDragons(pattern: string): boolean {
  return pattern.includes('D');
}

/**
 * Determines if a pattern string contains winds
 */
function containsWinds(pattern: string): boolean {
  return /[NEWS]/.test(pattern);
}

/**
 * Parses a single section from the JSON pattern
 */
function parseSection(sectionPattern: string): HandSection {
  const tiles = parsePatternToTiles(sectionPattern);
  
  return {
    pattern: sectionPattern,
    tiles,
    allowsFlowers: containsFlowers(sectionPattern),
    allowsDragons: containsDragons(sectionPattern),
    allowsWinds: containsWinds(sectionPattern),
    mustBeSameSuit: true // Default: all tiles in section must be same suit
  };
}

/**
 * Generates suit constraints for a hand pattern
 * Rule: Each section must be same suit internally, different sections must be different suits
 * Exception: Flowers and winds don't have suits, so they don't participate in constraints
 */
function generateSuitConstraints(sections: HandSection[]): SuitConstraint[] {
  const constraints: SuitConstraint[] = [];
  
  // Find sections that have suits (not just flowers/winds)
  const suitedSections = sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => !section.allowsFlowers || !section.allowsWinds || section.allowsDragons);
  
  if (suitedSections.length <= 1) {
    return constraints; // No constraints needed if 0 or 1 suited section
  }
  
  // Each section must be different suit from all others
  for (let i = 0; i < suitedSections.length; i++) {
    for (let j = i + 1; j < suitedSections.length; j++) {
      constraints.push({
        sections: [suitedSections[i].index, suitedSections[j].index],
        type: 'different'
      });
    }
  }
  
  return constraints;
}

/**
 * Maps JSON category names to HandCategory enum values
 */
function mapCategory(jsonCategory: string): HandCategory {
  switch (jsonCategory.toLowerCase()) {
    case '2024':
      return 'year';
    case 'quints':
      return 'quints';
    case 'winds-dragons':
      return 'winds-dragons';
    case '2468':
      return '2468';
    case 'consecutive run':
      return 'consecutive';
    case '13579':
      return '13579';
    case '369':
      return '369';
    case 'singles-pairs':
      return 'singles-pairs';
    default:
      return 'year'; // Default fallback
  }
}

/**
 * Determines point values based on category and complexity
 */
function calculatePoints(category: HandCategory, handName: string, sections: HandSection[]): number {
  // Standard NMJL point values (simplified)
  switch (category) {
    case 'year':
      return 25;
    case 'quints':
      return 40;
    case 'winds-dragons':
      return 35;
    case '2468':
      return 25;
    case 'consecutive':
      return 30;
    case '13579':
      return 25;
    case '369':
      return 25;
    case 'singles-pairs':
      return 20;
    default:
      return 25;
  }
}

/**
 * Determines if a hand is open (can call tiles) or closed
 */
function isOpenHand(handName: string, category: HandCategory): boolean {
  // Singles and pairs hands are typically closed (no jokers, no calls)
  if (category === 'singles-pairs') return false;
  
  // Most other hands are open
  return true;
}

/**
 * Calculates allowed jokers for a hand
 */
function calculateAllowedJokers(sections: HandSection[], category: HandCategory): number {
  if (category === 'singles-pairs') return 0; // No jokers in singles-pairs
  
  // Count total tiles in hand
  const totalTiles = sections.reduce((sum, section) => sum + section.tiles.length, 0);
  
  // Typically allow jokers up to about half the hand, but at least 2
  return Math.max(2, Math.floor(totalTiles / 2));
}

/**
 * Parses a single hand from JSON into HandPattern
 */
function parseHand(handName: string, sectionPatterns: string[], categoryName: string): HandPattern {
  const category = mapCategory(categoryName);
  const sections = sectionPatterns.map(parseSection);
  const suitConstraints = generateSuitConstraints(sections);
  
  return {
    name: handName,
    category,
    points: calculatePoints(category, handName, sections),
    isOpen: isOpenHand(handName, category),
    pattern: sectionPatterns.join(' '),
    sections,
    suitConstraints,
    allowedJokers: calculateAllowedJokers(sections, category),
    specialRules: {
      noJokers: category === 'singles-pairs',
      consecutiveRun: category === 'consecutive',
      windsDragonsOnly: category === 'winds-dragons'
    }
  };
}

/**
 * Loads and parses the 2024 rule card from JSON
 */
export function load2024RuleCard(): RuleCard {
  const patterns: HandPattern[] = [];
  
  // Load JSON data
  const jsonPath = path.join(__dirname, 'data', '2024 Hands.json');
  const ruleCardData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const yearData = ruleCardData['2024'] as Record<string, Record<string, string[]>>;
  
  // Parse each category
  for (const [categoryName, hands] of Object.entries(yearData)) {
    // Parse each hand in the category
    for (const [handName, sectionPatterns] of Object.entries(hands as Record<string, string[]>)) {
      const pattern = parseHand(handName, sectionPatterns as string[], categoryName);
      patterns.push(pattern);
    }
  }
  
  return {
    name: "National Mah Jongg League 2024",
    year: 2024,
    patterns,
    rules: {
      charlestonPasses: 2,
      allowKongDrawAfter: true,
      allowRobbingKong: true,
      maxJokersPerHand: 8,
      jokerReplacements: true,
      allowChowClaim: false, // American Mahjong doesn't allow chow claims
      allowKongClaim: true,
      selfDrawBonus: 2,
      flowerBonus: 1,
      minimumPoints: 25
    },
    scoring: {
      basicPoints: 10,
      flowerPoints: 1,
      selfDrawPoints: 2,
      kongPoints: 2,
      claimPenalty: 1
    }
  };
}

/**
 * Gets all available hands for a specific category
 */
export function getHandsByCategory(ruleCard: RuleCard, category: HandCategory): HandPattern[] {
  return ruleCard.patterns.filter(pattern => pattern.category === category);
}

/**
 * Finds a hand pattern by name
 */
export function findHandByName(ruleCard: RuleCard, name: string): HandPattern | undefined {
  return ruleCard.patterns.find(pattern => pattern.name === name);
}
