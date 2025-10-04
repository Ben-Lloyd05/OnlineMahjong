import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/index.css';
import Table from './ui/components/Table';
import RuleCardSelector from './ui/components/RuleCardSelector';
import { useWS } from './ui/hooks/useWS';

function App() {
  const [year, setYear] = React.useState<2024 | 2025>(2025);
  // For development, use a random clientSeed once per page load
  const clientSeed = React.useMemo(() => (globalThis.crypto && 'randomUUID' in globalThis.crypto ? (globalThis.crypto as any).randomUUID() : Math.random().toString(36).slice(2)), []);
  const { messages } = useWS('ws://localhost:8080', 'table1', { clientSeed });

  const snapshot = useMemo(() => messages.find(m => (m as any).type === 'game_state_update' && (m as any).full) as any, [messages]);
  const state = snapshot?.full || { players: { 0: { hand: [] }, 1: { hand: [] }, 2: { hand: [] }, 3: { hand: [] } }, currentPlayer: 0 };
  const players = [0,1,2,3].map(p => state.players[p] || { hand: [] });

  return (
    <div className="min-h-screen p-4 space-y-4">
      <div className="flex items-center justify-between">
        <RuleCardSelector value={year} onChange={setYear} />
        <div className="text-sm opacity-70">Connected: {Boolean(snapshot)?.toString()}</div>
      </div>
      <Table players={players} currentSeat={state.currentPlayer || 0} />
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);


