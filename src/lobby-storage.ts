/**
 * Lobby Persistence Layer (SQLite)
 * Stores rooms, player statistics, and matchmaking history
 */

import DatabaseConstructor from 'better-sqlite3';
type Database = InstanceType<typeof DatabaseConstructor>;
import {
  Room,
  PlayerProfile,
  MatchmakingRequest,
  MatchmakingResult,
  LobbyStats,
  ChatMessage,
  RoomStatus,
  RoomType
} from './lobby-types';

const DB_PATH = process.env.LOBBY_DB_PATH || './lobby.sqlite';

export class LobbyStorage {
  private db: Database;

  constructor() {
    this.db = new DatabaseConstructor(DB_PATH);
    this.setupSchema();
  }

  private setupSchema() {
    // Rooms
    this.db.exec(`CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      status TEXT,
      host TEXT,
      settings TEXT,
      createdAt INTEGER,
      startedAt INTEGER,
      maxSpectators INTEGER
    )`);
    // Players
    this.db.exec(`CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      username TEXT,
      avatar TEXT,
      status TEXT,
      skillLevel TEXT,
      gamesPlayed INTEGER,
      gamesWon INTEGER,
      winRate REAL,
      averageGameDuration INTEGER,
      preferredRuleCard TEXT,
      lastSeen INTEGER,
      connectionQuality TEXT,
      country TEXT,
      timezone TEXT
    )`);
    // Room membership
    this.db.exec(`CREATE TABLE IF NOT EXISTS room_players (
      roomId TEXT,
      playerId TEXT,
      isReady INTEGER,
      seat INTEGER,
      isHost INTEGER,
      joinedAt INTEGER,
      ping INTEGER,
      PRIMARY KEY (roomId, playerId)
    )`);
    // Spectators
    this.db.exec(`CREATE TABLE IF NOT EXISTS room_spectators (
      roomId TEXT,
      playerId TEXT,
      joinedAt INTEGER,
      canChat INTEGER,
      PRIMARY KEY (roomId, playerId)
    )`);
    // Chat messages
    this.db.exec(`CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      roomId TEXT,
      senderId TEXT,
      senderName TEXT,
      message TEXT,
      timestamp INTEGER,
      type TEXT
    )`);
    // Matchmaking history
    this.db.exec(`CREATE TABLE IF NOT EXISTS matchmaking_history (
      requestId TEXT PRIMARY KEY,
      roomId TEXT,
      players TEXT,
      estimatedGameStart INTEGER,
      averagePing INTEGER,
      matchQuality REAL
    )`);
  }

  // Room CRUD
  saveRoom(room: Room) {
    this.db.prepare(`REPLACE INTO rooms (id, name, type, status, host, settings, createdAt, startedAt, maxSpectators)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        room.id,
        room.name,
        room.type,
        room.status,
        room.host,
        JSON.stringify(room.settings),
        +room.createdAt,
        room.startedAt ? +room.startedAt : null,
        room.maxSpectators
      );
  }
  getRoom(id: string): Room | undefined {
    const row: any = this.db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      type: row.type as RoomType,
      status: row.status as RoomStatus,
      host: row.host,
      settings: JSON.parse(row.settings),
      createdAt: new Date(row.createdAt),
      startedAt: row.startedAt ? new Date(row.startedAt) : undefined,
      maxSpectators: row.maxSpectators,
      players: [],
      spectators: [],
      chatHistory: [],
      inviteCodes: undefined,
      gameState: undefined
    };
  }
  deleteRoom(id: string) {
    this.db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM room_players WHERE roomId = ?').run(id);
    this.db.prepare('DELETE FROM room_spectators WHERE roomId = ?').run(id);
    this.db.prepare('DELETE FROM chat_messages WHERE roomId = ?').run(id);
  }

  // Player CRUD
  savePlayer(profile: PlayerProfile) {
    this.db.prepare(`REPLACE INTO players (id, username, avatar, status, skillLevel, gamesPlayed, gamesWon, winRate, averageGameDuration, preferredRuleCard, lastSeen, connectionQuality, country, timezone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        profile.id,
        profile.username,
        profile.avatar || null,
        profile.status,
        profile.skillLevel,
        profile.gamesPlayed,
        profile.gamesWon,
        profile.winRate,
        profile.averageGameDuration,
        profile.preferredRuleCard || null,
        +profile.lastSeen,
        profile.connectionQuality,
        profile.country || null,
        profile.timezone || null
      );
  }
  getPlayer(id: string): PlayerProfile | undefined {
    const row: any = this.db.prepare('SELECT * FROM players WHERE id = ?').get(id);
    if (!row) return undefined;
    return {
      id: row.id,
      username: row.username,
      avatar: row.avatar || undefined,
      status: row.status,
      skillLevel: row.skillLevel,
      gamesPlayed: row.gamesPlayed,
      gamesWon: row.gamesWon,
      winRate: row.winRate,
      averageGameDuration: row.averageGameDuration,
      preferredRuleCard: row.preferredRuleCard || undefined,
      lastSeen: new Date(row.lastSeen),
      connectionQuality: row.connectionQuality,
      country: row.country || undefined,
      timezone: row.timezone || undefined
    };
  }

  // Room membership
  saveRoomPlayer(roomId: string, player: PlayerProfile, isReady: boolean, seat?: number, isHost?: boolean, joinedAt?: Date, ping?: number) {
    this.savePlayer(player);
    this.db.prepare(`REPLACE INTO room_players (roomId, playerId, isReady, seat, isHost, joinedAt, ping)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        roomId,
        player.id,
        isReady ? 1 : 0,
        seat ?? null,
        isHost ? 1 : 0,
        joinedAt ? +joinedAt : Date.now(),
        ping ?? 0
      );
  }
  removeRoomPlayer(roomId: string, playerId: string) {
    this.db.prepare('DELETE FROM room_players WHERE roomId = ? AND playerId = ?').run(roomId, playerId);
  }

  // Spectators
  saveSpectator(roomId: string, player: PlayerProfile, joinedAt?: Date, canChat?: boolean) {
    this.savePlayer(player);
    this.db.prepare(`REPLACE INTO room_spectators (roomId, playerId, joinedAt, canChat)
      VALUES (?, ?, ?, ?)`)
      .run(
        roomId,
        player.id,
        joinedAt ? +joinedAt : Date.now(),
        canChat ? 1 : 0
      );
  }
  removeSpectator(roomId: string, playerId: string) {
    this.db.prepare('DELETE FROM room_spectators WHERE roomId = ? AND playerId = ?').run(roomId, playerId);
  }

  // Chat messages
  saveChatMessage(msg: ChatMessage) {
    this.db.prepare(`REPLACE INTO chat_messages (id, roomId, senderId, senderName, message, timestamp, type)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        msg.id,
        msg.roomId,
        msg.senderId,
        msg.senderName,
        msg.message,
        +msg.timestamp,
        msg.type
      );
  }
  getRoomChat(roomId: string, limit = 100): ChatMessage[] {
    return this.db.prepare('SELECT * FROM chat_messages WHERE roomId = ? ORDER BY timestamp DESC LIMIT ?').all(roomId, limit)
      .map((row: any) => ({
        id: row.id,
        senderId: row.senderId,
        senderName: row.senderName,
        message: row.message,
        timestamp: new Date(row.timestamp),
        type: row.type,
        roomId: row.roomId
      }));
  }

  // Matchmaking history
  saveMatchmakingResult(result: MatchmakingResult) {
    this.db.prepare(`REPLACE INTO matchmaking_history (requestId, roomId, players, estimatedGameStart, averagePing, matchQuality)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(
        result.requestId,
        result.roomId,
        JSON.stringify(result.players),
        +result.estimatedGameStart,
        result.averagePing,
        result.matchQuality
      );
  }
  getMatchmakingHistory(limit = 100): MatchmakingResult[] {
    return this.db.prepare('SELECT * FROM matchmaking_history ORDER BY estimatedGameStart DESC LIMIT ?').all(limit)
      .map((row: any) => ({
        requestId: row.requestId,
        roomId: row.roomId,
        players: JSON.parse(row.players),
        estimatedGameStart: new Date(row.estimatedGameStart),
        averagePing: row.averagePing,
        matchQuality: row.matchQuality
      }));
  }

  // Lobby stats
  getLobbyStats(): LobbyStats {
    const totalPlayersOnline = (this.db.prepare('SELECT COUNT(*) as count FROM players WHERE status = ?').get('online') as any).count;
    const playersInGame = (this.db.prepare('SELECT COUNT(*) as count FROM players WHERE status = ?').get('in-game') as any).count;
    const playersSearching = (this.db.prepare('SELECT COUNT(*) as count FROM players WHERE status = ?').get('searching') as any).count;
    const activeRooms = (this.db.prepare('SELECT COUNT(*) as count FROM rooms WHERE status IN (?, ?)').get('waiting', 'in-progress') as any).count;
    return {
      totalPlayersOnline,
      playersInGame,
      playersSearching,
      activeRooms,
      averageWaitTime: 0,
      peakHours: []
    };
  }
}

export const lobbyStorage = new LobbyStorage();
