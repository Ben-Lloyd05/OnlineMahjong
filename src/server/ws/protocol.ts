// path: mahjong-ts/src/server/ws/protocol.ts
import { Move, GameState, PlayerId } from '../../types';

export type ISO8601 = string; // e.g., new Date().toISOString()

export type BaseMsg = {
  traceId: string;
  ts: ISO8601;
  type: string;
};

// Client -> Server
export type AuthMsg = BaseMsg & {
  type: 'auth';
  token: string;
};

export type SubscribeMsg = BaseMsg & {
  type: 'subscribe';
  tableId: string;
  // Optional client-provided seed to participate in deterministic RNG
  // If omitted, the server will generate a random clientSeed per new table
  clientSeed?: string;
};

export type PlayerActionMsg = BaseMsg & {
  type: 'player_action';
  tableId: string;
  action: Move;
};

export type ReplayRequestMsg = BaseMsg & {
  type: 'replay_request';
  tableId: string;
  fromIndex?: number;
};

export type ChatMessageMsg = BaseMsg & {
  type: 'chat_message';
  tableId: string;
  text: string;
};

export type CreateTableMsg = BaseMsg & {
  type: 'create_table';
  // Optional client-provided seed to participate in deterministic RNG
  clientSeed?: string;
};

export type JoinTableMsg = BaseMsg & {
  type: 'join_table';
  inviteCode: string;
  // Optional client-provided seed to participate in deterministic RNG
  clientSeed?: string;
};

export type LeaveTableMsg = BaseMsg & {
  type: 'leave_table';
};

export type GetMyTablesMsg = BaseMsg & {
  type: 'get_my_tables';
};

export type PresenceUpdateMsg = BaseMsg & {
  type: 'presence_update';
  status: 'online' | 'away' | 'offline';
};

export type ClientToServer =
  | AuthMsg
  | SubscribeMsg
  | PlayerActionMsg
  | ReplayRequestMsg
  | ChatMessageMsg
  | CreateTableMsg
  | JoinTableMsg
  | LeaveTableMsg
  | GetMyTablesMsg
  | PresenceUpdateMsg;

// Server -> Client
export type GameStateDelta = Partial<GameState> & { logsAppend?: GameState['logs'] };

export type GameStateUpdateMsg = BaseMsg & {
  type: 'game_state_update';
  tableId: string;
  full?: GameState;
  delta?: GameStateDelta;
};

export type ActionResultMsg = BaseMsg & {
  type: 'action_result';
  tableId: string;
  ok: boolean;
  error?: { code: string; message: string };
  applied?: Move;
};

export type ReplayChunkMsg = BaseMsg & {
  type: 'replay_chunk';
  tableId: string;
  startIndex: number;
  logs: GameState['logs'];
  nextIndex?: number;
};

export type TableCreatedMsg = BaseMsg & {
  type: 'table_created';
  tableId: string;
  inviteCode: string;
  serverCommit?: string; // fairness commitment
};

export type TableJoinedMsg = BaseMsg & {
  type: 'table_joined';
  tableId: string;
  inviteCode: string;
  players: number;
  serverCommit?: string; // fairness commitment
};

export type TableLeftMsg = BaseMsg & {
  type: 'table_left';
  tableId: string;
};

export type MyTablesMsg = BaseMsg & {
  type: 'my_tables';
  tables: { tableId: string; inviteCode: string; isCreator: boolean }[];
};

export type LobbyUpdateMsg = BaseMsg & {
  type: 'lobby_update';
  tables: { id: string; inviteCode: string; players: number; started: boolean }[];
};

export type PlayerCountUpdateMsg = BaseMsg & {
  type: 'player_count_update';
  tableId: string;
  players: number;
  ready: boolean; // true if 4 players present
};

export type ServerToClient =
  | GameStateUpdateMsg
  | ActionResultMsg
  | ReplayChunkMsg
  | TableCreatedMsg
  | TableJoinedMsg
  | TableLeftMsg
  | MyTablesMsg
  | LobbyUpdateMsg
  | PlayerCountUpdateMsg
  | PresenceUpdateMsg
  | ChatMessageMsg;

export function nowIso(): ISO8601 { return new Date().toISOString(); }


