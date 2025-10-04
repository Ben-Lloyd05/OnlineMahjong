/**
 * Room Management System
 * Handles room creation, joining, leaving, and state management for mahjong games
 */

import { 
  Room, 
  RoomPlayer, 
  RoomSettings, 
  RoomStatus, 
  RoomType, 
  PlayerProfile,
  Spectator,
  CreateRoomResponse,
  JoinRoomResponse,
  RoomError,
  LobbyError,
  ChatMessage,
  GameOptions
} from './lobby-types';
import { PlayerId, GameState } from './types';
import { randomBytes } from 'crypto';

export class RoomManager {
  private rooms = new Map<string, Room>();
  private playerToRoom = new Map<string, string>(); // playerId -> roomId
  private roomChangeCallbacks = new Set<(room: Room, event: string) => void>();

  constructor() {
    // Clean up abandoned rooms every 5 minutes
    setInterval(() => this.cleanupAbandonedRooms(), 5 * 60 * 1000);
  }

  /**
   * Create a new room
   */
  async createRoom(
    hostProfile: PlayerProfile,
    name: string,
    settings: RoomSettings,
    type: RoomType = 'public'
  ): Promise<CreateRoomResponse> {
    try {
      // Validate room settings
      this.validateRoomSettings(settings);

      // Check if host is already in a room
      if (this.playerToRoom.has(hostProfile.id)) {
        throw new RoomError('Player is already in a room');
      }

      // Generate room ID
      const roomId = this.generateRoomId();
      
      // Create host player
      const hostPlayer: RoomPlayer = {
        playerId: hostProfile.id,
        profile: hostProfile,
        isReady: false,
        isHost: true,
        joinedAt: new Date(),
        ping: 0
      };

      // Create room
      const room: Room = {
        id: roomId,
        name: name.trim(),
        type,
        status: 'waiting',
        settings,
        host: hostProfile.id,
        players: [hostPlayer],
        spectators: [],
        createdAt: new Date(),
        maxSpectators: settings.allowSpectators ? 10 : 0,
        chatHistory: [],
        inviteCodes: type === 'private' ? [this.generateInviteCode()] : undefined
      };

      // Store room and player mapping
      this.rooms.set(roomId, room);
      this.playerToRoom.set(hostProfile.id, roomId);

      // Notify callbacks
      this.notifyRoomChange(room, 'room-created');

      // Add welcome message
      this.addSystemMessage(roomId, `Room created by ${hostProfile.username}`);

      return {
        success: true,
        roomId,
        room
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create room'
      };
    }
  }

  /**
   * Join an existing room
   */
  async joinRoom(
    playerProfile: PlayerProfile,
    roomId: string,
    password?: string,
    inviteCode?: string
  ): Promise<JoinRoomResponse> {
    try {
      const room = this.rooms.get(roomId);
      if (!room) {
        throw new RoomError('Room not found', roomId);
      }

      // Check if player is already in a room
      if (this.playerToRoom.has(playerProfile.id)) {
        const currentRoomId = this.playerToRoom.get(playerProfile.id);
        if (currentRoomId === roomId) {
          return { success: true, room }; // Already in this room
        }
        throw new RoomError('Player is already in another room');
      }

      // Validate room access
      await this.validateRoomAccess(room, playerProfile, password, inviteCode);

      // Check room capacity
      if (room.players.length >= room.settings.maxPlayers) {
        throw new RoomError('Room is full', roomId);
      }

      // Check room status
      if (room.status === 'in-progress') {
        throw new RoomError('Game is already in progress', roomId);
      }

      // Find available seat
      const availableSeat = this.findAvailableSeat(room);
      
      // Create room player
      const roomPlayer: RoomPlayer = {
        playerId: playerProfile.id,
        profile: playerProfile,
        isReady: false,
        seat: availableSeat,
        isHost: false,
        joinedAt: new Date(),
        ping: 0
      };

      // Add player to room
      room.players.push(roomPlayer);
      this.playerToRoom.set(playerProfile.id, roomId);

      // Add join message
      this.addSystemMessage(roomId, `${playerProfile.username} joined the room`);

      // Notify callbacks
      this.notifyRoomChange(room, 'player-joined');

      return {
        success: true,
        room,
        playerPosition: availableSeat
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to join room'
      };
    }
  }

  /**
   * Leave a room
   */
  async leaveRoom(playerId: string): Promise<void> {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) {
      return; // Player not in any room
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerToRoom.delete(playerId);
      return;
    }

    // Remove player from room
    const playerIndex = room.players.findIndex(p => p.playerId === playerId);
    if (playerIndex === -1) {
      return; // Player not in this room
    }

    const player = room.players[playerIndex];
    room.players.splice(playerIndex, 1);
    this.playerToRoom.delete(playerId);

    // Add leave message
    this.addSystemMessage(roomId, `${player.profile.username} left the room`);

    // Handle host leaving
    if (player.isHost && room.players.length > 0) {
      // Transfer host to next player
      const newHost = room.players[0];
      newHost.isHost = true;
      room.host = newHost.playerId;
      this.addSystemMessage(roomId, `${newHost.profile.username} is now the host`);
    }

    // Check if room should be deleted
    if (room.players.length === 0 && room.spectators.length === 0) {
      this.deleteRoom(roomId);
      return;
    }

    // Update room status if game was about to start
    if (room.status === 'starting' && !this.canStartGame(room)) {
      room.status = 'waiting';
      this.unreadyAllPlayers(room);
    }

    // Notify callbacks
    this.notifyRoomChange(room, 'player-left');
  }

  /**
   * Set player ready status
   */
  async setPlayerReady(playerId: string, isReady: boolean): Promise<void> {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) {
      throw new RoomError('Player not in any room');
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      throw new RoomError('Room not found', roomId);
    }

    const player = room.players.find(p => p.playerId === playerId);
    if (!player) {
      throw new RoomError('Player not in room', roomId);
    }

    player.isReady = isReady;

    // Add ready/unready message
    const status = isReady ? 'ready' : 'not ready';
    this.addSystemMessage(roomId, `${player.profile.username} is ${status}`);

    // Check if all players are ready and we can start
    if (this.canStartGame(room)) {
      await this.startGameCountdown(room);
    } else if (room.status === 'starting') {
      // If someone became unready during countdown, cancel it
      room.status = 'waiting';
    }

    this.notifyRoomChange(room, 'player-ready-changed');
  }

  /**
   * Update room settings (host only)
   */
  async updateRoomSettings(
    hostId: string, 
    roomId: string, 
    settings: Partial<RoomSettings>
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new RoomError('Room not found', roomId);
    }

    if (room.host !== hostId) {
      throw new RoomError('Only host can update room settings', roomId);
    }

    if (room.status !== 'waiting') {
      throw new RoomError('Cannot update settings during game', roomId);
    }

    // Validate new settings
    const newSettings = { ...room.settings, ...settings };
    this.validateRoomSettings(newSettings);

    // Check if player capacity was reduced and current players exceed it
    if (newSettings.maxPlayers < room.players.length) {
      throw new RoomError('Cannot reduce capacity below current player count', roomId);
    }

    // Update settings
    room.settings = newSettings;
    
    // Unready all players when settings change
    this.unreadyAllPlayers(room);

    this.addSystemMessage(roomId, 'Room settings updated by host');
    this.notifyRoomChange(room, 'settings-changed');
  }

  /**
   * Start spectating a room
   */
  async spectateRoom(
    playerProfile: PlayerProfile,
    roomId: string
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new RoomError('Room not found', roomId);
    }

    if (!room.settings.allowSpectators) {
      throw new RoomError('Spectators not allowed in this room', roomId);
    }

    if (room.spectators.length >= room.maxSpectators) {
      throw new RoomError('Spectator limit reached', roomId);
    }

    // Check if already spectating
    if (room.spectators.some(s => s.playerId === playerProfile.id)) {
      return; // Already spectating
    }

    // Check if player is in the room as a player
    if (room.players.some(p => p.playerId === playerProfile.id)) {
      throw new RoomError('Cannot spectate room you are playing in', roomId);
    }

    const spectator: Spectator = {
      playerId: playerProfile.id,
      profile: playerProfile,
      joinedAt: new Date(),
      canChat: true
    };

    room.spectators.push(spectator);
    this.addSystemMessage(roomId, `${playerProfile.username} is now spectating`);
    this.notifyRoomChange(room, 'spectator-joined');
  }

  /**
   * Stop spectating a room
   */
  async stopSpectating(playerId: string, roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const spectatorIndex = room.spectators.findIndex(s => s.playerId === playerId);
    if (spectatorIndex === -1) {
      return; // Not spectating
    }

    const spectator = room.spectators[spectatorIndex];
    room.spectators.splice(spectatorIndex, 1);
    
    this.addSystemMessage(roomId, `${spectator.profile.username} stopped spectating`);
    this.notifyRoomChange(room, 'spectator-left');

    // Delete room if empty
    if (room.players.length === 0 && room.spectators.length === 0) {
      this.deleteRoom(roomId);
    }
  }

  /**
   * Add chat message to room
   */
  async addChatMessage(
    senderId: string,
    roomId: string,
    message: string
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new RoomError('Room not found', roomId);
    }

    // Check if sender is in room (as player or spectator)
    const isPlayer = room.players.some(p => p.playerId === senderId);
    const isSpectator = room.spectators.some(s => s.playerId === senderId);
    
    if (!isPlayer && !isSpectator) {
      throw new RoomError('Only room members can send messages', roomId);
    }

    // Get sender profile
    const senderProfile = isPlayer 
      ? room.players.find(p => p.playerId === senderId)?.profile
      : room.spectators.find(s => s.playerId === senderId)?.profile;

    if (!senderProfile) {
      throw new RoomError('Sender profile not found', roomId);
    }

    const chatMessage: ChatMessage = {
      id: randomBytes(8).toString('hex'),
      senderId,
      senderName: senderProfile.username,
      message: message.trim(),
      timestamp: new Date(),
      type: 'player',
      roomId
    };

    room.chatHistory.push(chatMessage);

    // Keep only last 100 messages
    if (room.chatHistory.length > 100) {
      room.chatHistory = room.chatHistory.slice(-100);
    }

    this.notifyRoomChange(room, 'chat-message');
  }

  /**
   * Start game in room
   */
  async startGame(roomId: string, gameState: GameState): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new RoomError('Room not found', roomId);
    }

    if (room.status !== 'starting') {
      throw new RoomError('Room is not ready to start', roomId);
    }

    room.status = 'in-progress';
    room.startedAt = new Date();
    room.gameState = gameState;

    this.addSystemMessage(roomId, 'Game started!');
    this.notifyRoomChange(room, 'game-started');
  }

  /**
   * End game in room
   */
  async endGame(
    roomId: string, 
    winner?: string, 
    finalScores?: Record<string, number>
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    room.status = 'finished';
    room.gameState = undefined;

    // Add game end message
    if (winner) {
      const winnerProfile = room.players.find(p => p.playerId === winner)?.profile;
      const winnerName = winnerProfile?.username || 'Unknown';
      this.addSystemMessage(roomId, `Game ended! Winner: ${winnerName}`);
    } else {
      this.addSystemMessage(roomId, 'Game ended');
    }

    // Unready all players for potential rematch
    this.unreadyAllPlayers(room);

    this.notifyRoomChange(room, 'game-ended');
  }

  /**
   * Get room by ID
   */
  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get all public rooms
   */
  getPublicRooms(): Room[] {
    return Array.from(this.rooms.values()).filter(room => 
      room.type === 'public' || room.type === 'friends-only'
    );
  }

  /**
   * Get rooms for lobby display
   */
  getLobbyRooms(playerId?: string): Room[] {
    return Array.from(this.rooms.values()).filter(room => {
      // Show public rooms
      if (room.type === 'public') return true;
      
      // Show private rooms if player has invite code or is already in room
      if (room.type === 'private') {
        return room.players.some(p => p.playerId === playerId) ||
               room.spectators.some(s => s.playerId === playerId);
      }
      
      // Show friends-only rooms (implement friends logic as needed)
      if (room.type === 'friends-only') {
        return true; // For now, show all friends-only rooms
      }

      return false;
    });
  }

  /**
   * Get player's current room
   */
  getPlayerRoom(playerId: string): Room | undefined {
    const roomId = this.playerToRoom.get(playerId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  /**
   * Subscribe to room changes
   */
  onRoomChange(callback: (room: Room, event: string) => void): () => void {
    this.roomChangeCallbacks.add(callback);
    return () => this.roomChangeCallbacks.delete(callback);
  }

  // Private helper methods

  private validateRoomSettings(settings: RoomSettings): void {
    if (settings.maxPlayers < 2 || settings.maxPlayers > 4) {
      throw new LobbyError('Invalid player count', 'INVALID_SETTINGS');
    }

    if (settings.timeLimit && settings.timeLimit < 10) {
      throw new LobbyError('Time limit too short', 'INVALID_SETTINGS');
    }

    if (!settings.ruleCard) {
      throw new LobbyError('Rule card required', 'INVALID_SETTINGS');
    }
  }

  private async validateRoomAccess(
    room: Room, 
    player: PlayerProfile,
    password?: string,
    inviteCode?: string
  ): Promise<void> {
    if (room.type === 'private') {
      if (room.settings.password && room.settings.password !== password) {
        throw new RoomError('Invalid password', room.id);
      }
      
      if (room.settings.requireInvitation && 
          (!inviteCode || !room.inviteCodes?.includes(inviteCode))) {
        throw new RoomError('Valid invitation required', room.id);
      }
    }

    // Additional access checks can be added here
    // e.g., friends-only validation, skill level restrictions, etc.
  }

  private findAvailableSeat(room: Room): PlayerId {
    const occupiedSeats = new Set(room.players.map(p => p.seat).filter(s => s !== undefined));
    
    for (let seat = 0; seat < 4; seat++) {
      if (!occupiedSeats.has(seat as PlayerId)) {
        return seat as PlayerId;
      }
    }
    
    throw new RoomError('No available seats', room.id);
  }

  private canStartGame(room: Room): boolean {
    return room.players.length >= 2 && 
           room.players.length <= room.settings.maxPlayers &&
           room.players.every(p => p.isReady) &&
           room.status === 'waiting';
  }

  private async startGameCountdown(room: Room): Promise<void> {
    room.status = 'starting';
    this.addSystemMessage(room.id, 'Starting game in 5 seconds...');
    this.notifyRoomChange(room, 'game-countdown-started');

    // Note: Actual countdown logic would be handled by the calling system
    // This just sets the room to starting state
  }

  private unreadyAllPlayers(room: Room): void {
    room.players.forEach(player => {
      player.isReady = false;
    });
  }

  private addSystemMessage(roomId: string, message: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const systemMessage: ChatMessage = {
      id: randomBytes(8).toString('hex'),
      senderId: 'system',
      senderName: 'System',
      message,
      timestamp: new Date(),
      type: 'system',
      roomId
    };

    room.chatHistory.push(systemMessage);

    // Keep only last 100 messages
    if (room.chatHistory.length > 100) {
      room.chatHistory = room.chatHistory.slice(-100);
    }
  }

  private notifyRoomChange(room: Room, event: string): void {
    this.roomChangeCallbacks.forEach(callback => {
      try {
        callback(room, event);
      } catch (error) {
        console.error('Error in room change callback:', error);
      }
    });
  }

  private generateRoomId(): string {
    return randomBytes(8).toString('hex').toUpperCase();
  }

  private generateInviteCode(): string {
    return randomBytes(4).toString('hex').toUpperCase();
  }

  private deleteRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Remove all player mappings
    room.players.forEach(player => {
      this.playerToRoom.delete(player.playerId);
    });

    // Remove room
    this.rooms.delete(roomId);
    
    this.notifyRoomChange(room, 'room-deleted');
  }

  private cleanupAbandonedRooms(): void {
    const now = new Date();
    const maxAge = 2 * 60 * 60 * 1000; // 2 hours

    for (const [roomId, room] of this.rooms) {
      // Delete old finished rooms
      if (room.status === 'finished' && 
          now.getTime() - room.createdAt.getTime() > maxAge) {
        this.deleteRoom(roomId);
        continue;
      }

      // Delete empty rooms older than 30 minutes
      if (room.players.length === 0 && 
          room.spectators.length === 0 &&
          now.getTime() - room.createdAt.getTime() > 30 * 60 * 1000) {
        this.deleteRoom(roomId);
      }
    }
  }
}

// Singleton instance
export const roomManager = new RoomManager();