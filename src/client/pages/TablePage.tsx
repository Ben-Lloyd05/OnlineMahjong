import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Table from '../ui/components/Table';
import RuleCardSelector from '../ui/components/RuleCardSelector';
import { ServerToClient } from '../../server/ws/protocol';

interface TablePageProps {
  messages: ServerToClient[];
  onLeaveTable: () => void;
}

export default function TablePage({ messages, onLeaveTable }: TablePageProps) {
  const navigate = useNavigate();
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const [year, setYear] = React.useState<2024 | 2025>(2025);

  // Get the most recent game state update
  const gameSnapshot = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if ((messages[i] as any).type === 'game_state_update' && (messages[i] as any).full) {
        return messages[i] as any;
      }
    }
    return null;
  }, [messages]);

  // Get the most recent player count update
  const playerCountInfo = useMemo(() => {
    console.log('[TablePage] Recalculating player count from', messages.length, 'messages');
    for (let i = messages.length - 1; i >= 0; i--) {
      if ((messages[i] as any).type === 'player_count_update') {
        console.log('[TablePage] Found player_count_update:', messages[i]);
        return messages[i] as any;
      }
    }
    console.log('[TablePage] No player_count_update found, using default');
    return { players: 1, ready: false };
  }, [messages]);

  // Use invite code from URL
  const currentInviteCode = inviteCode || 'Unknown';

  const handleLeaveTable = () => {
    onLeaveTable();
    navigate('/');
  };

  const state = gameSnapshot?.full || { 
    players: { 0: { hand: [] }, 1: { hand: [] }, 2: { hand: [] }, 3: { hand: [] } }, 
    currentPlayer: 0 
  };
  const players = [0, 1, 2, 3].map(p => state.players[p] || { hand: [] });

  return (
    <div className="min-h-screen p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <RuleCardSelector value={year} onChange={setYear} />
          <button
            onClick={handleLeaveTable}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Return to Lobby
          </button>
        </div>
        <div className="flex items-center space-x-4 text-sm">
          <div className="opacity-70">
            Invite Code: <span className="font-mono font-bold">{currentInviteCode}</span>
          </div>
          <div className={`font-semibold px-3 py-1 rounded-lg ${
            playerCountInfo.ready 
              ? 'bg-green-600 text-white' 
              : 'bg-yellow-500 text-gray-900'
          }`}>
            Players: {playerCountInfo.players}/4 {playerCountInfo.ready ? 'READY' : 'Waiting...'}
          </div>
        </div>
      </div>
      {!playerCountInfo.ready && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded">
          <p className="font-bold">Waiting for Players</p>
          <p className="text-sm">The game requires 4 players to start. Share the invite code <span className="font-mono font-bold">{currentInviteCode}</span> with your friends!</p>
        </div>
      )}
      <Table players={players} currentSeat={state.currentPlayer || 0} />
    </div>
  );
}
