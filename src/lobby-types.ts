/**
 * Lobby and Matchmaking Type Definitions
 * Comprehensive type system for room management, player matching, and lobby coordination
 */

import { GameState, PlayerId, RuleCard } from './types';

// Game Options for lobby system
export interface GameOptions {
  ruleCard: RuleCard;
}

// Player Status and Preferences
export type PlayerStatus = 'online' | 'in-game' | 'in-lobby' | 'away' | 'offline';
export type MatchmakingStatus = 'searching' | 'matched' | 'in-room' | 'not-searching';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor';

export interface PlayerProfile {
  id: string;
  username: string;
  avatar?: string;
  status: PlayerStatus;
  skillLevel: SkillLevel;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  averageGameDuration: number; // in minutes
  preferredRuleCard?: string;
  lastSeen: Date;
  connectionQuality: ConnectionQuality;
  country?: string;
  timezone?: string;
}

export interface MatchmakingPreferences {
  skillLevelRange: {
    min: SkillLevel;
    max: SkillLevel;
  };
  maxPing: number;
  preferredRuleCards: string[];
  gameSpeed: 'slow' | 'normal' | 'fast';
  allowSpectators: boolean;
  preferredGameModes: GameMode[];
  regionPreference?: string;
  friendlyMatch: boolean; // vs competitive
}

// Room and Game Types
export type RoomStatus = 'waiting' | 'starting' | 'in-progress' | 'finished' | 'abandoned';
export type GameMode = 'standard' | 'tournament' | 'casual' | 'practice' | 'custom';
export type RoomType = 'public' | 'private' | 'friends-only' | 'tournament';

export interface RoomSettings {
  maxPlayers: number;
  gameOptions: GameOptions;
  ruleCard: string;
  gameMode: GameMode;
  timeLimit?: number; // seconds per turn
  allowSpectators: boolean;
  isRanked: boolean;
  requireInvitation: boolean;
  password?: string;
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  status: RoomStatus;
  settings: RoomSettings;
  host: string; // player ID
  players: RoomPlayer[];
  spectators: Spectator[];
  createdAt: Date;
  startedAt?: Date;
  gameState?: GameState;
  inviteCodes?: string[];
  maxSpectators: number;
  chatHistory: ChatMessage[];
}

export interface RoomPlayer {
  playerId: string;
  profile: PlayerProfile;
  isReady: boolean;
  seat?: PlayerId; // 0, 1, 2, 3
  joinedAt: Date;
  isHost: boolean;
  ping: number;
}

export interface Spectator {
  playerId: string;
  profile: PlayerProfile;
  joinedAt: Date;
  canChat: boolean;
}

// Matchmaking System
export interface MatchmakingRequest {
  playerId: string;
  preferences: MatchmakingPreferences;
  timestamp: Date;
  estimatedWaitTime?: number;
  priority: number; // higher = more urgent
}

export interface MatchmakingResult {
  requestId: string;
  roomId: string;
  players: string[];
  estimatedGameStart: Date;
  averagePing: number;
  matchQuality: number; // 0-1, higher = better match
}

export interface LobbyStats {
  totalPlayersOnline: number;
  playersInGame: number;
  playersSearching: number;
  activeRooms: number;
  averageWaitTime: number;
  peakHours: { hour: number; playerCount: number }[];
}

// Communication and Events
export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: Date;
  type: 'player' | 'system' | 'announcement';
  roomId?: string;
}

export interface LobbyNotification {
  id: string;
  type: 'room-invitation' | 'game-ready' | 'player-joined' | 'player-left' | 'match-found' | 'system';
  title: string;
  message: string;
  timestamp: Date;
  recipientId: string;
  data?: any;
  actionRequired?: boolean;
  expiresAt?: Date;
}

// Lobby State Management
export interface LobbyState {
  rooms: Record<string, Room>;
  players: Record<string, PlayerProfile>;
  matchmakingQueue: MatchmakingRequest[];
  activeMatches: Record<string, MatchmakingResult>;
  recentGames: RecentGame[];
  serverStats: LobbyStats;
  announcements: Announcement[];
}

export interface RecentGame {
  gameId: string;
  roomName: string;
  players: { id: string; name: string; score: number }[];
  duration: number; // minutes
  completedAt: Date;
  ruleCard: string;
  winner?: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'maintenance' | 'feature' | 'tournament' | 'general';
  createdAt: Date;
  expiresAt?: Date;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  targetAudience?: 'all' | 'beginners' | 'advanced' | 'tournament-players';
}

// WebSocket Protocol Messages
export interface LobbyMessage {
  type: string;
  timestamp: Date;
  senderId?: string;
  data: any;
}

export interface JoinLobbyMessage extends LobbyMessage {
  type: 'join-lobby';
  data: {
    playerId: string;
    playerProfile: PlayerProfile;
  };
}

export interface CreateRoomMessage extends LobbyMessage {
  type: 'create-room';
  data: {
    name: string;
    settings: RoomSettings;
  };
}

export interface JoinRoomMessage extends LobbyMessage {
  type: 'join-room';
  data: {
    roomId: string;
    password?: string;
  };
}

export interface StartMatchmakingMessage extends LobbyMessage {
  type: 'start-matchmaking';
  data: {
    preferences: MatchmakingPreferences;
  };
}

export interface SpectateRoomMessage extends LobbyMessage {
  type: 'spectate-room';
  data: {
    roomId: string;
  };
}

export interface LobbyUpdateMessage extends LobbyMessage {
  type: 'lobby-update';
  data: {
    rooms: Room[];
    stats: LobbyStats;
    notifications: LobbyNotification[];
  };
}

export interface RoomUpdateMessage extends LobbyMessage {
  type: 'room-update';
  data: {
    room: Room;
    event: 'player-joined' | 'player-left' | 'settings-changed' | 'game-started' | 'game-ended';
  };
}

export interface MatchFoundMessage extends LobbyMessage {
  type: 'match-found';
  data: {
    result: MatchmakingResult;
    acceptDeadline: Date;
  };
}

export interface ChatMessageBroadcast extends LobbyMessage {
  type: 'chat-message';
  data: ChatMessage;
}

// Tournament System (Extended)
export interface Tournament {
  id: string;
  name: string;
  description: string;
  format: 'single-elimination' | 'double-elimination' | 'round-robin' | 'swiss';
  maxParticipants: number;
  entryFee?: number;
  prizePool: number;
  startDate: Date;
  endDate?: Date;
  status: 'registration' | 'in-progress' | 'completed' | 'cancelled';
  rules: TournamentRules;
  participants: TournamentParticipant[];
  rounds: TournamentRound[];
  organizer: string;
}

export interface TournamentRules {
  ruleCard: string;
  gameOptions: GameOptions;
  timeLimit: number;
  maxGamesPerMatch: number;
  tiebreaker: 'points' | 'head-to-head' | 'buchholz';
}

export interface TournamentParticipant {
  playerId: string;
  registeredAt: Date;
  currentRound: number;
  totalScore: number;
  matchesPlayed: number;
  matchesWon: number;
  isEliminated: boolean;
}

export interface TournamentRound {
  roundNumber: number;
  matches: TournamentMatch[];
  startTime: Date;
  endTime?: Date;
  status: 'scheduled' | 'in-progress' | 'completed';
}

export interface TournamentMatch {
  id: string;
  participants: string[];
  roomId?: string;
  result?: {
    winner: string;
    scores: Record<string, number>;
    completedAt: Date;
  };
  status: 'scheduled' | 'in-progress' | 'completed' | 'forfeited';
}

// API Response Types
export interface CreateRoomResponse {
  success: boolean;
  roomId?: string;
  room?: Room;
  error?: string;
}

export interface JoinRoomResponse {
  success: boolean;
  room?: Room;
  playerPosition?: PlayerId;
  error?: string;
}

export interface MatchmakingResponse {
  success: boolean;
  requestId?: string;
  estimatedWaitTime?: number;
  queuePosition?: number;
  error?: string;
}

export interface LobbyListResponse {
  rooms: Room[];
  stats: LobbyStats;
  playerCount: number;
  serverTime: Date;
}

// Error Types
export class LobbyError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'LobbyError';
  }
}

export class RoomError extends LobbyError {
  constructor(message: string, public roomId?: string, details?: any) {
    super(message, 'ROOM_ERROR', details);
    this.name = 'RoomError';
  }
}

export class MatchmakingError extends LobbyError {
  constructor(message: string, details?: any) {
    super(message, 'MATCHMAKING_ERROR', details);
    this.name = 'MatchmakingError';
  }
}

// Utility Types
export type LobbyEventType = 
  | 'player-joined-lobby'
  | 'player-left-lobby'
  | 'room-created'
  | 'room-updated'
  | 'room-deleted'
  | 'matchmaking-started'
  | 'matchmaking-cancelled'
  | 'match-found'
  | 'game-started'
  | 'game-ended'
  | 'chat-message'
  | 'notification-sent'
  | 'tournament-created'
  | 'tournament-updated';

export interface LobbyEvent {
  type: LobbyEventType;
  timestamp: Date;
  data: any;
  affectedPlayers: string[];
  roomId?: string;
}

export interface PlayerStatistics {
  playerId: string;
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  averageScore: number;
  highestScore: number;
  averageGameDuration: number;
  favoriteRuleCard: string;
  winStreak: number;
  longestWinStreak: number;
  recentForm: ('W' | 'L' | 'D')[]; // last 10 games
  skillRating: number;
  rank: number;
  achievements: Achievement[];
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlockedAt: Date;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}