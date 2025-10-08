/**
 * Intelligent Matchmaking Engine
 * Handles player matching based on skill level, preferences, and connection quality
 */

import {
  PlayerProfile,
  MatchmakingRequest,
  MatchmakingResult,
  MatchmakingPreferences,
  MatchmakingError,
  MatchmakingResponse,
  SkillLevel,
  ConnectionQuality,
  RoomSettings,
  GameMode
} from './lobby-types';
import { roomManager } from './room-manager';
import { randomBytes } from 'crypto';

interface MatchGroup {
  players: PlayerProfile[];
  averageSkill: number;
  averagePing: number;
  matchQuality: number;
  commonPreferences: Partial<MatchmakingPreferences>;
}

interface SkillRating {
  [key: string]: number; // SkillLevel -> numeric rating
}

export class MatchmakingEngine {
  private activeRequests = new Map<string, MatchmakingRequest>();
  private playerRequests = new Map<string, string>(); // playerId -> requestId
  private matchCallbacks = new Set<(result: MatchmakingResult) => void>();
  
  // Skill level ratings for matching
  private skillRatings: SkillRating = {
    'beginner': 100,
    'intermediate': 500,
    'advanced': 1000,
    'expert': 1500
  };

  // Connection quality ratings
  private connectionRatings = {
    'excellent': 100,
    'good': 75,
    'fair': 50,
    'poor': 25
  };

  constructor() {
    // Process matchmaking queue every 5 seconds
    setInterval(() => this.processMatchmakingQueue(), 5000);
    
    // Clean up expired requests every minute
    setInterval(() => this.cleanupExpiredRequests(), 60000);
  }

  /**
   * Start matchmaking for a player
   */
  async startMatchmaking(
    player: PlayerProfile,
    preferences: MatchmakingPreferences
  ): Promise<MatchmakingResponse> {
    try {
      // Check if player is already searching
      if (this.playerRequests.has(player.id)) {
        const existingRequestId = this.playerRequests.get(player.id)!;
        const existingRequest = this.activeRequests.get(existingRequestId);
        
        if (existingRequest) {
          return {
            success: true,
            requestId: existingRequestId,
            estimatedWaitTime: this.estimateWaitTime(existingRequest),
            queuePosition: this.getQueuePosition(existingRequestId)
          };
        }
      }

      // Validate preferences
      this.validateMatchmakingPreferences(preferences);

      // Create matchmaking request
      const requestId = this.generateRequestId();
      const request: MatchmakingRequest = {
        playerId: player.id,
        preferences,
        timestamp: new Date(),
        estimatedWaitTime: this.estimateInitialWaitTime(preferences),
        priority: this.calculatePriority(player, preferences)
      };

      // Store request
      this.activeRequests.set(requestId, request);
      this.playerRequests.set(player.id, requestId);

      return {
        success: true,
        requestId,
        estimatedWaitTime: request.estimatedWaitTime,
        queuePosition: this.getQueuePosition(requestId)
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Matchmaking failed'
      };
    }
  }

  /**
   * Cancel matchmaking for a player
   */
  async cancelMatchmaking(playerId: string): Promise<void> {
    const requestId = this.playerRequests.get(playerId);
    if (requestId) {
      this.activeRequests.delete(requestId);
      this.playerRequests.delete(playerId);
    }
  }

  /**
   * Get matchmaking status for a player
   */
  getMatchmakingStatus(playerId: string): MatchmakingRequest | null {
    const requestId = this.playerRequests.get(playerId);
    return requestId ? this.activeRequests.get(requestId) || null : null;
  }

  /**
   * Subscribe to match results
   */
  onMatchFound(callback: (result: MatchmakingResult) => void): () => void {
    this.matchCallbacks.add(callback);
    return () => this.matchCallbacks.delete(callback);
  }

  /**
   * Get current queue statistics
   */
  getQueueStats(): {
    totalRequests: number;
    averageWaitTime: number;
    skillDistribution: Record<SkillLevel, number>;
    gameModeDistribution: Record<GameMode, number>;
  } {
    const requests = Array.from(this.activeRequests.values());
    
    const skillDistribution: Record<SkillLevel, number> = {
      beginner: 0,
      intermediate: 0,
      advanced: 0,
      expert: 0
    };

    const gameModeDistribution: Record<GameMode, number> = {
      standard: 0,
      tournament: 0,
      casual: 0,
      practice: 0,
      custom: 0
    };

    let totalWaitTime = 0;

    requests.forEach(request => {
      // Get player skill (would need to fetch from player profile)
      const now = new Date();
      const waitTime = now.getTime() - request.timestamp.getTime();
      totalWaitTime += waitTime;

      request.preferences.preferredGameModes.forEach(mode => {
        gameModeDistribution[mode]++;
      });
    });

    return {
      totalRequests: requests.length,
      averageWaitTime: requests.length > 0 ? totalWaitTime / requests.length : 0,
      skillDistribution,
      gameModeDistribution
    };
  }

  // Private methods

  private async processMatchmakingQueue(): Promise<void> {
    const requests = Array.from(this.activeRequests.values());
    if (requests.length < 2) return;

    // Sort requests by priority and wait time
    const sortedRequests = requests.sort((a, b) => {
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) return priorityDiff;
      
      return a.timestamp.getTime() - b.timestamp.getTime(); // Older first
    });

    // Try to form matches
    const processedPlayers = new Set<string>();

    for (let i = 0; i < sortedRequests.length; i++) {
      const request = sortedRequests[i];
      
      if (processedPlayers.has(request.playerId)) continue;

      // Find compatible players for this request
      const compatibleRequests = this.findCompatibleRequests(request, sortedRequests);
      
      if (compatibleRequests.length >= 1) { // Need at least 2 total (including original)
        const matchGroup = this.createMatchGroup([request, ...compatibleRequests]);
        
        if (matchGroup && this.isGoodMatch(matchGroup)) {
          await this.createMatch(matchGroup);
          
          // Mark players as processed
          matchGroup.players.forEach(player => {
            processedPlayers.add(player.id);
          });
        }
      }
    }
  }

  private findCompatibleRequests(
    baseRequest: MatchmakingRequest,
    allRequests: MatchmakingRequest[]
  ): MatchmakingRequest[] {
    const compatible: MatchmakingRequest[] = [];
    const maxPlayersNeeded = 3; // For 4-player game (base + 3 more)

    for (const request of allRequests) {
      if (request.playerId === baseRequest.playerId) continue;
      if (compatible.length >= maxPlayersNeeded) break;

      if (this.areRequestsCompatible(baseRequest, request)) {
        compatible.push(request);
      }
    }

    return compatible;
  }

  private areRequestsCompatible(
    request1: MatchmakingRequest,
    request2: MatchmakingRequest
  ): boolean {
    const prefs1 = request1.preferences;
    const prefs2 = request2.preferences;

    // Check skill level compatibility
    if (!this.isSkillLevelCompatible(prefs1, prefs2)) {
      return false;
    }

    // Check game mode compatibility
    const commonGameModes = prefs1.preferredGameModes.filter(mode =>
      prefs2.preferredGameModes.includes(mode)
    );
    if (commonGameModes.length === 0) {
      return false;
    }

    // Check rule card compatibility
    const commonRuleCards = prefs1.preferredRuleCards.filter(card =>
      prefs2.preferredRuleCards.includes(card)
    );
    if (commonRuleCards.length === 0 && 
        prefs1.preferredRuleCards.length > 0 && 
        prefs2.preferredRuleCards.length > 0) {
      return false;
    }

    // Check game speed compatibility
    if (prefs1.gameSpeed !== prefs2.gameSpeed) {
      return false;
    }

    // Check ping requirements (simplified)
    if (prefs1.maxPing < 100 || prefs2.maxPing < 100) {
      // Would need actual ping data between players
      // For now, assume compatible if both have reasonable limits
    }

    return true;
  }

  private isSkillLevelCompatible(
    prefs1: MatchmakingPreferences,
    prefs2: MatchmakingPreferences
  ): boolean {
    const skill1Min = this.skillRatings[prefs1.skillLevelRange.min];
    const skill1Max = this.skillRatings[prefs1.skillLevelRange.max];
    const skill2Min = this.skillRatings[prefs2.skillLevelRange.min];
    const skill2Max = this.skillRatings[prefs2.skillLevelRange.max];

    // Check if ranges overlap
    return !(skill1Max < skill2Min || skill2Max < skill1Min);
  }

  private createMatchGroup(requests: MatchmakingRequest[]): MatchGroup | null {
    if (requests.length < 2) return null;

    // This would fetch actual player profiles - simplified for now
    const players: PlayerProfile[] = requests.map(request => ({
      id: request.playerId,
      username: `Player_${request.playerId.slice(0, 8)}`,
      status: 'online',
      skillLevel: 'intermediate', // Would be fetched from database
      gamesPlayed: 50,
      gamesWon: 25,
      winRate: 0.5,
      averageGameDuration: 45,
      lastSeen: new Date(),
      connectionQuality: 'good'
    }));

    const averageSkill = this.calculateAverageSkill(players);
    const averagePing = this.calculateAveragePing(players);
    const matchQuality = this.calculateMatchQuality(requests);
    
    const commonPreferences = this.findCommonPreferences(requests);

    return {
      players,
      averageSkill,
      averagePing,
      matchQuality,
      commonPreferences
    };
  }

  private isGoodMatch(matchGroup: MatchGroup): boolean {
    // Match quality threshold (0-1, higher is better)
    const minQuality = 0.6;
    
    // Skill variance threshold
    const maxSkillVariance = 200;
    
    // Check match quality
    if (matchGroup.matchQuality < minQuality) {
      return false;
    }

    // Check skill level variance
    const skillLevels = matchGroup.players.map(p => this.skillRatings[p.skillLevel]);
    const avgSkill = skillLevels.reduce((a, b) => a + b, 0) / skillLevels.length;
    const variance = skillLevels.reduce((acc, skill) => 
      acc + Math.pow(skill - avgSkill, 2), 0) / skillLevels.length;
    
    if (Math.sqrt(variance) > maxSkillVariance) {
      return false;
    }

    return true;
  }

  private async createMatch(matchGroup: MatchGroup): Promise<void> {
    try {
      // Remove requests from queue
      matchGroup.players.forEach(player => {
        const requestId = this.playerRequests.get(player.id);
        if (requestId) {
          this.activeRequests.delete(requestId);
          this.playerRequests.delete(player.id);
        }
      });

      // Create room for the match
      const hostPlayer = matchGroup.players[0];
      const roomSettings: RoomSettings = this.createRoomSettingsFromPreferences(matchGroup.commonPreferences);
      
      const createResult = await roomManager.createRoom(
        hostPlayer,
        `Match Room ${Date.now()}`,
        roomSettings,
        'public'
      );

      if (!createResult.success || !createResult.roomId) {
        throw new MatchmakingError('Failed to create match room');
      }

      // Add other players to room
      for (let i = 1; i < matchGroup.players.length; i++) {
        const player = matchGroup.players[i];
        await roomManager.joinRoom(player, createResult.roomId);
      }

      // Create match result
      const matchResult: MatchmakingResult = {
        requestId: randomBytes(8).toString('hex'),
        roomId: createResult.roomId,
        players: matchGroup.players.map(p => p.id),
        estimatedGameStart: new Date(Date.now() + 30000), // 30 seconds from now
        averagePing: matchGroup.averagePing,
        matchQuality: matchGroup.matchQuality
      };

      // Notify callbacks
      this.notifyMatchFound(matchResult);

    } catch (error) {
      console.error('Failed to create match:', error);
      
      // Re-queue players if match creation failed
      matchGroup.players.forEach(player => {
        // Would re-add to queue with updated preferences
      });
    }
  }

  private calculateAverageSkill(players: PlayerProfile[]): number {
    const skillSum = players.reduce((sum, player) => 
      sum + this.skillRatings[player.skillLevel], 0);
    return skillSum / players.length;
  }

  private calculateAveragePing(players: PlayerProfile[]): number {
    // Simplified - would calculate actual ping between players
    return players.reduce((sum, player) => 
      sum + this.connectionRatings[player.connectionQuality], 0) / players.length;
  }

  private calculateMatchQuality(requests: MatchmakingRequest[]): number {
    let quality = 1.0;
    
    // Reduce quality based on skill level spread
    const skillLevels = requests.map(r => r.preferences.skillLevelRange);
    const minSkill = Math.min(...skillLevels.map(s => this.skillRatings[s.min]));
    const maxSkill = Math.max(...skillLevels.map(s => this.skillRatings[s.max]));
    const skillSpread = maxSkill - minSkill;
    
    quality *= Math.max(0.3, 1.0 - (skillSpread / 1000));
    
    // Reduce quality based on wait time (older requests get priority)
    const now = new Date();
    const avgWaitTime = requests.reduce((sum, req) => 
      sum + (now.getTime() - req.timestamp.getTime()), 0) / requests.length;
    
    // Bonus quality for players who have waited longer
    const waitBonus = Math.min(0.3, avgWaitTime / (5 * 60 * 1000)); // Max bonus after 5 minutes
    quality += waitBonus;
    
    return Math.min(1.0, quality);
  }

  private findCommonPreferences(requests: MatchmakingRequest[]): Partial<MatchmakingPreferences> {
    if (requests.length === 0) return {};
    
    const first = requests[0].preferences;
    
    // Find common game modes
    let commonGameModes = [...first.preferredGameModes];
    requests.slice(1).forEach(request => {
      commonGameModes = commonGameModes.filter(mode => 
        request.preferences.preferredGameModes.includes(mode)
      );
    });
    
    // Find common rule cards
    let commonRuleCards = [...first.preferredRuleCards];
    requests.slice(1).forEach(request => {
      commonRuleCards = commonRuleCards.filter(card => 
        request.preferences.preferredRuleCards.includes(card)
      );
    });
    
    // Use most common game speed
    const gameSpeeds = requests.map(r => r.preferences.gameSpeed);
    const gameSpeedCounts = gameSpeeds.reduce((acc, speed) => {
      acc[speed] = (acc[speed] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const commonGameSpeed = Object.keys(gameSpeedCounts).reduce((a, b) => 
      gameSpeedCounts[a] > gameSpeedCounts[b] ? a : b
    ) as 'slow' | 'normal' | 'fast';
    
    return {
      preferredGameModes: commonGameModes.length > 0 ? commonGameModes : ['standard'],
      preferredRuleCards: commonRuleCards.length > 0 ? commonRuleCards : ['2024'],
      gameSpeed: commonGameSpeed,
      allowSpectators: requests.every(r => r.preferences.allowSpectators),
      friendlyMatch: requests.every(r => r.preferences.friendlyMatch)
    };
  }

  private createRoomSettingsFromPreferences(prefs: Partial<MatchmakingPreferences>): RoomSettings {
    return {
      maxPlayers: 4,
      gameOptions: {
        ruleCard: {
          name: prefs.preferredRuleCards?.[0] || '2024',
          year: 2024,
          patterns: [],
          rules: {
            charlestonPasses: 3,
            allowKongDrawAfter: true,
            allowRobbingKong: false,
            maxJokersPerHand: 8,
            jokerReplacements: true,
            allowChowClaim: false,
            allowKongClaim: true,
            selfDrawBonus: 2,
            flowerBonus: 4,
            minimumPoints: 25
          },
          scoring: {
            basicPoints: 1,
            flowerPoints: 4,
            selfDrawPoints: 2,
            kongPoints: 2,
            claimPenalty: 1
          }
        }
      },
      ruleCard: prefs.preferredRuleCards?.[0] || '2024',
      gameMode: prefs.preferredGameModes?.[0] || 'standard',
      timeLimit: prefs.gameSpeed === 'fast' ? 30 : prefs.gameSpeed === 'slow' ? 90 : 60,
      allowSpectators: prefs.allowSpectators ?? true,
      isRanked: !prefs.friendlyMatch,
      requireInvitation: false
    };
  }

  private validateMatchmakingPreferences(prefs: MatchmakingPreferences): void {
    if (prefs.maxPing < 50 || prefs.maxPing > 1000) {
      throw new MatchmakingError('Invalid ping limit');
    }
    
    if (prefs.preferredGameModes.length === 0) {
      throw new MatchmakingError('At least one game mode must be selected');
    }
    
    const skillMin = this.skillRatings[prefs.skillLevelRange.min];
    const skillMax = this.skillRatings[prefs.skillLevelRange.max];
    
    if (skillMin > skillMax) {
      throw new MatchmakingError('Invalid skill level range');
    }
  }

  private calculatePriority(player: PlayerProfile, prefs: MatchmakingPreferences): number {
    let priority = 100;
    
    // Higher priority for players with fewer games (help newcomers)
    if (player.gamesPlayed < 10) priority += 50;
    
    // Higher priority for flexible preferences
    if (prefs.preferredGameModes.length > 1) priority += 10;
    if (prefs.preferredRuleCards.length > 1) priority += 10;
    
    // Higher priority for friendly matches (less competitive pressure)
    if (prefs.friendlyMatch) priority += 20;
    
    return priority;
  }

  private estimateInitialWaitTime(prefs: MatchmakingPreferences): number {
    // Base wait time: 2 minutes
    let waitTime = 2 * 60 * 1000;
    
    // Adjust based on preferences restrictiveness
    if (prefs.preferredGameModes.length === 1) waitTime += 30000;
    if (prefs.preferredRuleCards.length === 1) waitTime += 30000;
    if (prefs.maxPing < 100) waitTime += 60000;
    
    // Adjust based on skill level (experts might wait longer)
    if (prefs.skillLevelRange.min === 'expert') waitTime += 60000;
    
    return waitTime;
  }

  private estimateWaitTime(request: MatchmakingRequest): number {
    const elapsed = Date.now() - request.timestamp.getTime();
    const remaining = Math.max(0, (request.estimatedWaitTime || 0) - elapsed);
    
    // Adjust based on current queue
    const queueSize = this.activeRequests.size;
    const adjustment = Math.min(120000, queueSize * 10000); // Max 2 minutes adjustment
    
    return remaining + adjustment;
  }

  private getQueuePosition(requestId: string): number {
    const request = this.activeRequests.get(requestId);
    if (!request) return 0;
    
    const allRequests = Array.from(this.activeRequests.values());
    const sorted = allRequests.sort((a, b) => {
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return a.timestamp.getTime() - b.timestamp.getTime();
    });
    
    return sorted.findIndex(r => r.playerId === request.playerId) + 1;
  }

  private notifyMatchFound(result: MatchmakingResult): void {
    this.matchCallbacks.forEach(callback => {
      try {
        callback(result);
      } catch (error) {
        console.error('Error in match found callback:', error);
      }
    });
  }

  private cleanupExpiredRequests(): void {
    const now = new Date();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    for (const [requestId, request] of this.activeRequests) {
      if (now.getTime() - request.timestamp.getTime() > maxAge) {
        this.activeRequests.delete(requestId);
        this.playerRequests.delete(request.playerId);
      }
    }
  }

  private generateRequestId(): string {
    return randomBytes(8).toString('hex');
  }
}

// Singleton instance
export const matchmakingEngine = new MatchmakingEngine();