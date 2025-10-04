import React, { useState } from 'react';
import { ServerToClient } from '../../../server/ws/protocol';

interface LobbyViewProps {
  messages: ServerToClient[];
  onCreateTable: (clientSeed?: string) => void;
  onJoinTable: (inviteCode: string, clientSeed?: string) => void;
}

export default function LobbyView({ messages, onCreateTable, onJoinTable }: LobbyViewProps) {
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  const [inviteCode, setInviteCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [dismissedErrors, setDismissedErrors] = useState<Set<string>>(new Set());
  
  // Force a re-read of localStorage by tracking table-related messages
  const tableMessages = React.useMemo(() => {
    return messages.filter(m => 
      m.type === 'table_created' || 
      m.type === 'table_joined' || 
      m.type === 'table_left'
    ).length;
  }, [messages]);

  // Get tables from localStorage and update when table messages change
  const allTables = React.useMemo(() => {
    try {
      const stored = localStorage.getItem('mahjong_my_tables');
      console.log('[LobbyView] Reading from localStorage:', stored);
      if (stored) {
        const tables = JSON.parse(stored);
        console.log('[LobbyView] Parsed tables:', tables);
        return tables.map((t: any) => ({
          inviteCode: t.inviteCode,
          type: t.isCreator ? 'created' as const : 'joined' as const,
          tableId: t.tableId
        }));
      }
    } catch (e) {
      console.error('Failed to load tables:', e);
    }
    return [];
  }, [tableMessages]); // Recompute whenever table message count changes
  
  // Only show errors from the last 10 messages that haven't been dismissed
  const recentMessages = messages.slice(-10);
  const actionResult = recentMessages.find(m => {
    const msg = m as any;
    return msg.type === 'action_result' && !msg.ok && !dismissedErrors.has(msg.traceId);
  }) as any;
  const hasTables = allTables.length > 0;

  const handleCreateTable = () => {
    setIsCreating(true);
    // Generate a client seed for this table
    const clientSeed = globalThis.crypto && 'randomUUID' in globalThis.crypto 
      ? (globalThis.crypto as any).randomUUID() 
      : Math.random().toString(36).slice(2);
    onCreateTable(clientSeed);
  };

  const handleJoinTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    
    setIsJoining(true);
    // Generate a client seed for this table
    const clientSeed = globalThis.crypto && 'randomUUID' in globalThis.crypto 
      ? (globalThis.crypto as any).randomUUID() 
      : Math.random().toString(36).slice(2);
    onJoinTable(inviteCode.trim().toUpperCase(), clientSeed);
  };

  const handleRemoveTable = (inviteCode: string) => {
    try {
      const stored = localStorage.getItem('mahjong_my_tables');
      if (stored) {
        const tables = JSON.parse(stored);
        const filtered = tables.filter((t: any) => t.inviteCode !== inviteCode);
        localStorage.setItem('mahjong_my_tables', JSON.stringify(filtered));
        forceUpdate(); // Force re-render to update the list
      }
    } catch (e) {
      console.error('Failed to remove table:', e);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-800 to-green-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
          American Mahjong Lobby
        </h1>
        
        {/* Error Messages */}
        {actionResult && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded relative">
            <button
              onClick={() => setDismissedErrors(new Set([...dismissedErrors, actionResult.traceId]))}
              className="absolute top-2 right-2 text-red-700 hover:text-red-900 font-bold text-lg"
              aria-label="Dismiss error"
            >
              ×
            </button>
            <p className="font-semibold mb-1">Error</p>
            <p className="text-sm pr-6">{actionResult.error?.message || 'An error occurred'}</p>
          </div>
        )}
        
        {/* Your Active Tables */}
        {hasTables && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
            <p className="font-semibold text-blue-800 mb-3">Your Active Tables</p>
            <div className="divide-y divide-gray-200">
              {allTables.map((table: {inviteCode: string, type: 'created' | 'joined', tableId: string}, idx: number) => (
                <div key={idx} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:bg-blue-50 transition-colors px-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600">Code:</span>
                    <span className="font-mono font-bold text-lg">{table.inviteCode}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const clientSeed = globalThis.crypto && 'randomUUID' in globalThis.crypto 
                          ? (globalThis.crypto as any).randomUUID() 
                          : Math.random().toString(36).slice(2);
                        onJoinTable(table.inviteCode, clientSeed);
                      }}
                      className={`px-4 py-2 ${table.type === 'created' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} text-white text-sm font-medium rounded transition-colors`}
                    >
                      Connect
                    </button>
                    <button
                      onClick={() => handleRemoveTable(table.inviteCode)}
                      className="text-gray-400 hover:text-red-600 font-bold text-2xl w-8 h-8 flex items-center justify-center"
                      aria-label="Remove table"
                      title="Remove from list"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Main Actions - Always visible */}
        <div className="space-y-6">
          {/* Create Table Section */}
          <div className="border-b border-gray-200 pb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">
              Create New Table
            </h2>
            <button
              onClick={handleCreateTable}
              disabled={isCreating}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              {isCreating ? 'Creating...' : 'Create Table'}
            </button>
            <p className="text-sm text-gray-500 mt-2">
              You'll get a unique invite code to share with friends.
            </p>
          </div>
          
          {/* Join Table Section */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-700">
              Join Existing Table
            </h2>
            <form onSubmit={handleJoinTable}>
              <div className="mb-4">
                <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-700 mb-2">
                  Invite Code
                </label>
                <input
                  type="text"
                  id="inviteCode"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Enter 6-character code"
                  maxLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-center text-lg uppercase"
                  disabled={isJoining}
                />
              </div>
              <button
                type="submit"
                disabled={!inviteCode.trim() || isJoining}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                {isJoining ? 'Joining...' : 'Join Table'}
              </button>
            </form>
            <p className="text-sm text-gray-500 mt-2">
              Enter the 6-character code shared by your friend.
            </p>
          </div>
        </div>
        
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>American Mahjong • Online Multiplayer</p>
        </div>
      </div>
    </div>
  );
}
