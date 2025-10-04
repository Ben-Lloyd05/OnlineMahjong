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
          <div className="opacity-70">Connected: {Boolean(gameSnapshot)?.toString()}</div>
        </div>
      </div>
      <Table players={players} currentSeat={state.currentPlayer || 0} />
    </div>
  );
}
