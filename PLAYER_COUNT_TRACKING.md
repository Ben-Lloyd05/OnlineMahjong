# Player Count Tracking System

## Overview
Implemented a real-time player count tracking system that monitors the number of players in each game room and broadcasts updates when players join, leave, or disconnect.

## Changes Made

### 1. Protocol Updates (`src/server/ws/protocol.ts`)
- Added new `PlayerCountUpdateMsg` message type:
  ```typescript
  type: 'player_count_update'
  tableId: string
  players: number    // Current player count
  ready: boolean     // True when exactly 4 players are present
  ```

### 2. Server Updates (`src/server/ws/server.ts`)
- **New `broadcastPlayerCount()` function**: Broadcasts player count updates to all clients in a table
- **Enhanced disconnect handling**: When a client disconnects via `ws.on('close')`:
  - Removes the client from the table
  - Broadcasts updated player count to remaining players
  - Logs disconnect events with player counts
- **Enhanced join handling**: When a client creates or joins a table:
  - Broadcasts player count after successful join
  - All clients receive real-time player count updates
- **Enhanced leave handling**: When a client explicitly leaves via `leave_table`:
  - Broadcasts updated player count to remaining players
  - Logs leave events

### 3. Client UI Updates (`src/client/pages/TablePage.tsx`)
- **Player count display**: Shows current player count with visual indicators
  - Green badge when ready (4/4 players): "✓ READY"
  - Yellow badge when waiting (<4 players): "⏳ Waiting..."
- **Waiting banner**: Displays prominent message when < 4 players:
  - Explains game requires 4 players
  - Shows invite code for easy sharing
  - Automatically disappears when ready

## Features

### Real-Time Updates
- Player count updates are broadcast immediately when:
  - A player joins a table
  - A player leaves a table
  - A player disconnects (closes tab/loses connection)
  - A player explicitly clicks "Leave Table"

### Visual Feedback
- Clear status indicators showing:
  - Current player count (X/4)
  - Ready status when 4 players present
  - Waiting status when < 4 players
  - Invite code for easy sharing

### Server Logging
- Console logs track all player count changes:
  ```
  [Table abc12345] Player count: 1/4
  [Table abc12345] Player count: 2/4
  [Table abc12345] Player count: 3/4
  [Table abc12345] Player count: 4/4 (READY)
  [Table abc12345] Creator disconnected, table empty but kept alive
  ```

## Game Start Requirements
The system tracks when exactly 4 players are present (`ready: true`), which can be used to:
- Enable/disable game start buttons
- Prevent game actions until ready
- Show clear feedback to players about readiness

## Testing
To test the player count system:
1. Open multiple browser tabs/windows
2. Create a table in one tab
3. Join the same table from other tabs using the invite code
4. Observe player count updates in real-time
5. Close tabs or click "Leave Table" to see count decrease
6. Watch server console for player count logs

## Future Enhancements
- Player names/avatars display
- Seat assignment visualization
- Player ready status (beyond just presence)
- Reconnection handling for dropped connections
- Maximum wait time before auto-start
