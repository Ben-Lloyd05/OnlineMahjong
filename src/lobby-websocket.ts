/**
 * WebSocket Lobby Protocol
 * Handles real-time communication for lobby updates, room notifications, and player status
 */

import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { 
  LobbyMessage,
  JoinLobbyMessage,
  CreateRoomMessage,
  JoinRoomMessage,
  StartMatchmakingMessage,
  SpectateRoomMessage,
  LobbyUpdateMessage,
  RoomUpdateMessage,
  MatchFoundMessage,
  ChatMessageBroadcast,
  PlayerProfile,
  Room,
  LobbyNotification,
  LobbyStats,
  MatchmakingResult,
  ChatMessage
} from './lobby-types';
import { roomManager } from './room-manager';
import { matchmakingEngine } from './matchmaking-engine';

// Use a broad type to avoid DOM WebSocket conflicts (no @types/ws installed)
type WSClient = any;

interface LobbyClient {
  ws: WSClient;
  playerId?: string;
  playerProfile?: PlayerProfile;
  currentRoomId?: string;
  isSpectating?: boolean;
  lastPing?: Date;
}

interface LobbyServerOptions {
  port: number;
  pingInterval?: number;
  maxPlayersPerLobby?: number;
  enableHeartbeat?: boolean;
}

export class LobbyServer {
  private wss: typeof WebSocketServer;
  private clients = new Map<string, LobbyClient>(); // connectionId -> client
  private playerConnections = new Map<string, string>(); // playerId -> connectionId
  private roomSubscriptions = new Map<string, Set<string>>(); // roomId -> Set<connectionId>
  private pingInterval?: NodeJS.Timeout;
  private options: LobbyServerOptions;

  constructor(options: LobbyServerOptions) {
    this.options = {
      pingInterval: 30000, // 30 seconds
      maxPlayersPerLobby: 1000,
      enableHeartbeat: true,
      ...options
    };

    this.wss = new WebSocketServer({ port: options.port });
    this.setupServer();
    this.setupRoomManager();
    this.setupMatchmaking();
    
    if (this.options.enableHeartbeat) {
      this.startHeartbeat();
    }

    console.log(`Lobby WebSocket server started on port ${options.port}`);
  }

  private setupServer(): void {
    this.wss.on('connection', (ws: WSClient, request: IncomingMessage) => {
      const connectionId = this.generateConnectionId();
      const client: LobbyClient = { ws };
      
      this.clients.set(connectionId, client);
      
      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as LobbyMessage;
          await this.handleMessage(connectionId, message);
        } catch (error) {
          console.error('Error handling message:', error);
          this.sendError(connectionId, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        this.handleDisconnection(connectionId);
      });

      ws.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
        this.handleDisconnection(connectionId);
      });

      ws.on('pong', () => {
        const client = this.clients.get(connectionId);
        if (client) {
          client.lastPing = new Date();
        }
      });

      this.sendMessage(connectionId, {
        type: 'connection-established',
        timestamp: new Date(),
        data: { connectionId }
      });
    });
  }

  private setupRoomManager(): void {
    roomManager.onRoomChange((room: Room, event: string) => {
      this.broadcastRoomUpdate(room, event);
      
      // Send lobby update to all clients
      this.broadcastLobbyUpdate();
    });
  }

  private setupMatchmaking(): void {
    matchmakingEngine.onMatchFound((result: MatchmakingResult) => {
      result.players.forEach(playerId => {
        const connectionId = this.playerConnections.get(playerId);
        if (connectionId) {
          this.sendMatchFound(connectionId, result);
        }
      });
    });
  }

  private async handleMessage(connectionId: string, message: LobbyMessage): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client) return;

    switch (message.type) {
      case 'join-lobby':
        await this.handleJoinLobby(connectionId, message as JoinLobbyMessage);
        break;
      
      case 'leave-lobby':
        await this.handleLeaveLobby(connectionId);
        break;
      
      case 'create-room':
        await this.handleCreateRoom(connectionId, message as CreateRoomMessage);
        break;
      
      case 'join-room':
        await this.handleJoinRoom(connectionId, message as JoinRoomMessage);
        break;
      
      case 'leave-room':
        await this.handleLeaveRoom(connectionId);
        break;
      
      case 'set-ready':
        await this.handleSetReady(connectionId, message.data.isReady);
        break;
      
      case 'start-matchmaking':
        await this.handleStartMatchmaking(connectionId, message as StartMatchmakingMessage);
        break;
      
      case 'cancel-matchmaking':
        await this.handleCancelMatchmaking(connectionId);
        break;
      
      case 'spectate-room':
        await this.handleSpectateRoom(connectionId, message as SpectateRoomMessage);
        break;
      
      case 'stop-spectating':
        await this.handleStopSpectating(connectionId);
        break;
      
      case 'chat-message':
        await this.handleChatMessage(connectionId, message.data);
        break;
      
      case 'update-room-settings':
        await this.handleUpdateRoomSettings(connectionId, message.data);
        break;
      
      case 'get-lobby-status':
        await this.handleGetLobbyStatus(connectionId);
        break;
      
      case 'ping':
        this.sendMessage(connectionId, {
          type: 'pong',
          timestamp: new Date(),
          data: {}
        });
        break;
      
      default:
        this.sendError(connectionId, `Unknown message type: ${message.type}`);
    }
  }

  private async handleJoinLobby(connectionId: string, message: JoinLobbyMessage): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client) return;

    const { playerId, playerProfile } = message.data;

    // Check if player is already connected from another session
    if (this.playerConnections.has(playerId)) {
      const existingConnectionId = this.playerConnections.get(playerId)!;
      const existingClient = this.clients.get(existingConnectionId);
      
      if (existingClient && existingClient.ws.readyState === 1) { // WebSocket.OPEN
        this.sendError(connectionId, 'Player already connected from another session');
        return;
      } else {
        // Clean up stale connection
        this.playerConnections.delete(playerId);
      }
    }

    // Update client info
    client.playerId = playerId;
    client.playerProfile = playerProfile;
    this.playerConnections.set(playerId, connectionId);

    // Send current lobby state
    await this.sendLobbyUpdate(connectionId);
    
    // Check if player was in a room before disconnecting
    const existingRoom = roomManager.getPlayerRoom(playerId);
    if (existingRoom) {
      client.currentRoomId = existingRoom.id;
      this.subscribeToRoom(connectionId, existingRoom.id);
      this.sendRoomUpdate(connectionId, existingRoom, 'player-reconnected');
    }

    this.sendMessage(connectionId, {
      type: 'lobby-joined',
      timestamp: new Date(),
      data: { success: true }
    });
  }

  private async handleLeaveLobby(connectionId: string): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client || !client.playerId) return;

    // Leave current room
    await this.handleLeaveRoom(connectionId);
    
    // Cancel matchmaking
    await this.handleCancelMatchmaking(connectionId);
    
    // Remove from lobby
    this.playerConnections.delete(client.playerId);
    client.playerId = undefined;
    client.playerProfile = undefined;
  }

  private async handleCreateRoom(connectionId: string, message: CreateRoomMessage): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client?.playerId || !client.playerProfile) {
      this.sendError(connectionId, 'Must be logged in to create room');
      return;
    }

    const { name, settings } = message.data;
    
    const result = await roomManager.createRoom(
      client.playerProfile,
      name,
      settings,
      'public'
    );

    if (result.success && result.roomId) {
      client.currentRoomId = result.roomId;
      this.subscribeToRoom(connectionId, result.roomId);
    }

    this.sendMessage(connectionId, {
      type: 'room-created',
      timestamp: new Date(),
      data: result
    });
  }

  private async handleJoinRoom(connectionId: string, message: JoinRoomMessage): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client?.playerId || !client.playerProfile) {
      this.sendError(connectionId, 'Must be logged in to join room');
      return;
    }

    const { roomId, password } = message.data;
    
    const result = await roomManager.joinRoom(
      client.playerProfile,
      roomId,
      password
    );

    if (result.success) {
      client.currentRoomId = roomId;
      this.subscribeToRoom(connectionId, roomId);
    }

    this.sendMessage(connectionId, {
      type: 'room-joined',
      timestamp: new Date(),
      data: result
    });
  }

  private async handleLeaveRoom(connectionId: string): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client?.playerId || !client.currentRoomId) return;

    await roomManager.leaveRoom(client.playerId);
    this.unsubscribeFromRoom(connectionId, client.currentRoomId);
    client.currentRoomId = undefined;

    this.sendMessage(connectionId, {
      type: 'room-left',
      timestamp: new Date(),
      data: { success: true }
    });
  }

  private async handleSetReady(connectionId: string, isReady: boolean): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client?.playerId) {
      this.sendError(connectionId, 'Must be logged in to set ready status');
      return;
    }

    try {
      await roomManager.setPlayerReady(client.playerId, isReady);
      
      this.sendMessage(connectionId, {
        type: 'ready-status-updated',
        timestamp: new Date(),
        data: { success: true, isReady }
      });
    } catch (error) {
      this.sendError(connectionId, error instanceof Error ? error.message : 'Failed to update ready status');
    }
  }

  private async handleStartMatchmaking(connectionId: string, message: StartMatchmakingMessage): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client?.playerId || !client.playerProfile) {
      this.sendError(connectionId, 'Must be logged in to start matchmaking');
      return;
    }

    const { preferences } = message.data;
    
    const result = await matchmakingEngine.startMatchmaking(
      client.playerProfile,
      preferences
    );

    this.sendMessage(connectionId, {
      type: 'matchmaking-started',
      timestamp: new Date(),
      data: result
    });
  }

  private async handleCancelMatchmaking(connectionId: string): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client?.playerId) return;

    await matchmakingEngine.cancelMatchmaking(client.playerId);

    this.sendMessage(connectionId, {
      type: 'matchmaking-cancelled',
      timestamp: new Date(),
      data: { success: true }
    });
  }

  private async handleSpectateRoom(connectionId: string, message: SpectateRoomMessage): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client?.playerId || !client.playerProfile) {
      this.sendError(connectionId, 'Must be logged in to spectate');
      return;
    }

    try {
      const { roomId } = message.data;
      await roomManager.spectateRoom(client.playerProfile, roomId);
      
      client.currentRoomId = roomId;
      client.isSpectating = true;
      this.subscribeToRoom(connectionId, roomId);

      this.sendMessage(connectionId, {
        type: 'spectating-started',
        timestamp: new Date(),
        data: { success: true, roomId }
      });
    } catch (error) {
      this.sendError(connectionId, error instanceof Error ? error.message : 'Failed to start spectating');
    }
  }

  private async handleStopSpectating(connectionId: string): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client?.playerId || !client.currentRoomId || !client.isSpectating) return;

    await roomManager.stopSpectating(client.playerId, client.currentRoomId);
    this.unsubscribeFromRoom(connectionId, client.currentRoomId);
    
    client.currentRoomId = undefined;
    client.isSpectating = false;

    this.sendMessage(connectionId, {
      type: 'spectating-stopped',
      timestamp: new Date(),
      data: { success: true }
    });
  }

  private async handleChatMessage(connectionId: string, data: { roomId: string; message: string }): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client?.playerId) {
      this.sendError(connectionId, 'Must be logged in to send messages');
      return;
    }

    try {
      await roomManager.addChatMessage(client.playerId, data.roomId, data.message);
    } catch (error) {
      this.sendError(connectionId, error instanceof Error ? error.message : 'Failed to send message');
    }
  }

  private async handleUpdateRoomSettings(connectionId: string, data: { roomId: string; settings: any }): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client?.playerId) {
      this.sendError(connectionId, 'Must be logged in to update room settings');
      return;
    }

    try {
      await roomManager.updateRoomSettings(client.playerId, data.roomId, data.settings);
    } catch (error) {
      this.sendError(connectionId, error instanceof Error ? error.message : 'Failed to update room settings');
    }
  }

  private async handleGetLobbyStatus(connectionId: string): Promise<void> {
    await this.sendLobbyUpdate(connectionId);
  }

  private handleDisconnection(connectionId: string): void {
    const client = this.clients.get(connectionId);
    if (client) {
      if (client.playerId) {
        this.playerConnections.delete(client.playerId);
        
        // Leave room if in one
        if (client.currentRoomId) {
          if (client.isSpectating) {
            roomManager.stopSpectating(client.playerId, client.currentRoomId);
          } else {
            roomManager.leaveRoom(client.playerId);
          }
        }
        
        // Cancel matchmaking
        matchmakingEngine.cancelMatchmaking(client.playerId);
      }

      // Clean up subscriptions
      for (const [roomId, subscribers] of this.roomSubscriptions) {
        subscribers.delete(connectionId);
        if (subscribers.size === 0) {
          this.roomSubscriptions.delete(roomId);
        }
      }
    }

    this.clients.delete(connectionId);
  }

  private subscribeToRoom(connectionId: string, roomId: string): void {
    if (!this.roomSubscriptions.has(roomId)) {
      this.roomSubscriptions.set(roomId, new Set());
    }
    this.roomSubscriptions.get(roomId)!.add(connectionId);
  }

  private unsubscribeFromRoom(connectionId: string, roomId: string): void {
    const subscribers = this.roomSubscriptions.get(roomId);
    if (subscribers) {
      subscribers.delete(connectionId);
      if (subscribers.size === 0) {
        this.roomSubscriptions.delete(roomId);
      }
    }
  }

  private broadcastRoomUpdate(room: Room, event: string): void {
    const subscribers = this.roomSubscriptions.get(room.id);
    if (!subscribers) return;

    const message: RoomUpdateMessage = {
      type: 'room-update',
      timestamp: new Date(),
      data: { room, event: event as any }
    };

    subscribers.forEach(connectionId => {
      this.sendMessage(connectionId, message);
    });
  }

  private broadcastLobbyUpdate(): void {
    const rooms = roomManager.getLobbyRooms();
    const stats = this.getLobbyStats();

    // Send to all connected lobby clients
    for (const [connectionId, client] of this.clients) {
      if (client.playerId) {
        this.sendLobbyUpdate(connectionId, rooms, stats);
      }
    }
  }

  private async sendLobbyUpdate(connectionId: string, rooms?: Room[], stats?: LobbyStats): Promise<void> {
    const lobbyRooms = rooms || roomManager.getLobbyRooms();
    const lobbyStats = stats || this.getLobbyStats();

    const message: LobbyUpdateMessage = {
      type: 'lobby-update',
      timestamp: new Date(),
      data: {
        rooms: lobbyRooms,
        stats: lobbyStats,
        notifications: [] // Would fetch from notification system
      }
    };

    this.sendMessage(connectionId, message);
  }

  private sendRoomUpdate(connectionId: string, room: Room, event: string): void {
    const message: RoomUpdateMessage = {
      type: 'room-update',
      timestamp: new Date(),
      data: { room, event: event as any }
    };

    this.sendMessage(connectionId, message);
  }

  private sendMatchFound(connectionId: string, result: MatchmakingResult): void {
    const message: MatchFoundMessage = {
      type: 'match-found',
      timestamp: new Date(),
      data: {
        result,
        acceptDeadline: new Date(Date.now() + 30000) // 30 seconds to accept
      }
    };

    this.sendMessage(connectionId, message);
  }

  private sendMessage(connectionId: string, message: LobbyMessage): void {
    const client = this.clients.get(connectionId);
    if (client && client.ws.readyState === 1) { // WebSocket.OPEN
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
  }

  private sendError(connectionId: string, error: string): void {
    this.sendMessage(connectionId, {
      type: 'error',
      timestamp: new Date(),
      data: { error }
    });
  }

  private getLobbyStats(): LobbyStats {
    const totalPlayersOnline = this.playerConnections.size;
    const rooms = roomManager.getLobbyRooms();
    const activeRooms = rooms.filter(r => r.status === 'waiting' || r.status === 'in-progress').length;
    const playersInGame = rooms
      .filter(r => r.status === 'in-progress')
      .reduce((count, room) => count + room.players.length, 0);
    
    const matchmakingStats = matchmakingEngine.getQueueStats();
    
    return {
      totalPlayersOnline,
      playersInGame,
      playersSearching: matchmakingStats.totalRequests,
      activeRooms,
      averageWaitTime: matchmakingStats.averageWaitTime,
      peakHours: [] // Would be calculated from historical data
    };
  }

  private startHeartbeat(): void {
    this.pingInterval = setInterval(() => {
      const now = new Date();
      
      for (const [connectionId, client] of this.clients) {
        if (client.ws.readyState === 1) { // WebSocket.OPEN
          // Check if client hasn't responded to ping in 2 intervals
          if (client.lastPing && 
              now.getTime() - client.lastPing.getTime() > (this.options.pingInterval! * 2)) {
            console.log(`Terminating inactive connection: ${connectionId}`);
            (client.ws as any).terminate();
            continue;
          }

          // Send ping
          try {
            (client.ws as any).ping();
          } catch (error) {
            console.error('Error sending ping:', error);
          }
        } else {
          // Clean up dead connections
          this.handleDisconnection(connectionId);
        }
      }
    }, this.options.pingInterval);
  }

  private generateConnectionId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  public close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    this.wss.close();
  }

  public getStats(): {
    connectedClients: number;
    authenticatedPlayers: number;
    activeRooms: number;
    roomSubscriptions: number;
  } {
    return {
      connectedClients: this.clients.size,
      authenticatedPlayers: this.playerConnections.size,
      activeRooms: roomManager.getLobbyRooms().length,
      roomSubscriptions: this.roomSubscriptions.size
    };
  }
}