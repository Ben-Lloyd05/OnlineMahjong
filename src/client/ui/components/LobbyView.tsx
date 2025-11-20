import React, { useState } from 'react';
import { ServerToClient } from '../../../server/ws/protocol';

interface LobbyViewProps {
  messages: ServerToClient[];
  onCreateTable: (clientSeed?: string, username?: string) => void;
  onJoinTable: (inviteCode: string, clientSeed?: string, username?: string) => void;
}

export default function LobbyView({ messages, onCreateTable, onJoinTable }: LobbyViewProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  
  // Username management
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem('mahjong_username') || '';
    } catch (e) {
      return '';
    }
  });
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [pendingAction, setPendingAction] = useState<'create' | 'join' | null>(null);
  const [pendingInviteCode, setPendingInviteCode] = useState('');
  
  // Track dismissed errors in memory only (no localStorage to avoid quota issues)
  const [dismissedErrors, setDismissedErrors] = useState<Set<string>>(new Set());
  
  const [refreshCounter, setRefreshCounter] = useState(0);
  
  // Reset isCreating/isJoining when we get a response
  React.useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    
    if (lastMessage.type === 'table_created') {
      setIsCreating(false);
    } else if (lastMessage.type === 'table_joined') {
      setIsJoining(false);
    } else if (lastMessage.type === 'action_result') {
      const actionResult = lastMessage as any;
      if (!actionResult.ok) {
        // Reset both on error since we don't know which action failed
        setIsCreating(false);
        setIsJoining(false);
      }
    }
  }, [messages]);
  
  // Note: Dismissed errors are stored in memory only to avoid localStorage quota issues
  
  // Auto-dismiss errors after 10 seconds
  React.useEffect(() => {
    const timer = setTimeout(() => {
      // Find all error traceIds from the messages
      const allErrorIds = messages
        .filter((m: any) => m.type === 'action_result' && !m.ok)
        .map((m: any) => m.traceId);
      
      // Add all of them to dismissed errors (auto-dismiss after 10 seconds)
      if (allErrorIds.length > 0) {
        setDismissedErrors(new Set([...dismissedErrors, ...allErrorIds]));
      }
    }, 10000); // 10 seconds

    return () => clearTimeout(timer);
  }, [messages]); // Only re-run when messages change
  
  // Force a re-read of localStorage by tracking table-related messages
  const tableMessages = React.useMemo(() => {
    return messages.filter(m => 
      m.type === 'table_created' || 
      m.type === 'table_joined' || 
      m.type === 'table_left'
    ).length;
  }, [messages]);

  // Get tables from localStorage and update when table messages change OR when manually refreshed
  const allTables = React.useMemo(() => {
    try {
      const stored = localStorage.getItem('mahjong_my_tables');
      if (stored) {
        const tables = JSON.parse(stored);
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
  }, [tableMessages, refreshCounter]); // Recompute whenever table message count changes OR refreshCounter changes
  
  // Only show the MOST RECENT error that hasn't been dismissed
  // Filter out "table_full" and admin-related errors
  const actionResult = React.useMemo(() => {
    // Search from most recent to oldest
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any;
      if (msg.type === 'action_result' && !msg.ok) {
        // Skip if already dismissed
        if (dismissedErrors.has(msg.traceId)) {
          continue;
        }
        // Don't show "table full" errors in the lobby - they're handled by TablePage
        if (msg.error?.code === 'table_full') {
          continue;
        }
        // Don't show admin-related errors in the lobby
        if (msg.error?.code === 'unauthorized' || msg.error?.message?.includes('Admin authentication')) {
          continue;
        }
        // Return the first (most recent) non-dismissed, non-filtered error
        console.log('[LobbyView] Showing error:', msg.error?.message, 'traceId:', msg.traceId);
        return msg;
      }
    }
    return null;
  }, [messages, dismissedErrors]);
  const hasTables = allTables.length > 0;

  const handleCreateTable = () => {
    // Check if user has a username
    if (!username) {
      setPendingAction('create');
      setUsernameInput('');
      setShowUsernameModal(true);
      return;
    }
    
    setIsCreating(true);
    // Generate a client seed for this table
    const clientSeed = globalThis.crypto && 'randomUUID' in globalThis.crypto 
      ? (globalThis.crypto as any).randomUUID() 
      : Math.random().toString(36).slice(2);
    onCreateTable(clientSeed, username);
  };

  const handleJoinTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    
    // Check if user has a username
    if (!username) {
      setPendingAction('join');
      setPendingInviteCode(inviteCode.trim().toUpperCase());
      setUsernameInput('');
      setShowUsernameModal(true);
      return;
    }
    
    setIsJoining(true);
    // Generate a client seed for this table
    const clientSeed = globalThis.crypto && 'randomUUID' in globalThis.crypto 
      ? (globalThis.crypto as any).randomUUID() 
      : Math.random().toString(36).slice(2);
    const code = inviteCode.trim().toUpperCase();
    console.log('[LobbyView] Attempting to join table with code:', code);
    onJoinTable(code, clientSeed, username);
  };

  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUsername = usernameInput.trim();
    if (!trimmedUsername) return;
    
    // Save username to localStorage
    setUsername(trimmedUsername);
    localStorage.setItem('mahjong_username', trimmedUsername);
    setShowUsernameModal(false);
    
    // Execute the pending action
    if (pendingAction === 'create') {
      setIsCreating(true);
      const clientSeed = globalThis.crypto && 'randomUUID' in globalThis.crypto 
        ? (globalThis.crypto as any).randomUUID() 
        : Math.random().toString(36).slice(2);
      onCreateTable(clientSeed, trimmedUsername);
    } else if (pendingAction === 'join') {
      setIsJoining(true);
      const clientSeed = globalThis.crypto && 'randomUUID' in globalThis.crypto 
        ? (globalThis.crypto as any).randomUUID() 
        : Math.random().toString(36).slice(2);
      console.log('[LobbyView] Attempting to join table with code:', pendingInviteCode);
      onJoinTable(pendingInviteCode, clientSeed, trimmedUsername);
    }
    
    // Clear pending action
    setPendingAction(null);
    setPendingInviteCode('');
  };

  const handleRemoveTable = (inviteCode: string) => {
    try {
      const stored = localStorage.getItem('mahjong_my_tables');
      if (stored) {
        const tables = JSON.parse(stored);
        const filtered = tables.filter((t: any) => t.inviteCode !== inviteCode);
        localStorage.setItem('mahjong_my_tables', JSON.stringify(filtered));
        setRefreshCounter(c => c + 1); // Trigger re-computation of allTables
      }
    } catch (e) {
      console.error('Failed to remove table:', e);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 border-2 border-emerald-700 rounded-xl shadow-2xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-center mb-8 text-emerald-400">
          American Mahjong Lobby
        </h1>
        
        {/* Error Messages */}
        {actionResult && (
          <div className="mb-6 p-4 bg-red-900 border border-red-600 text-red-200 rounded relative">
            <button
              onClick={() => setDismissedErrors(new Set([...dismissedErrors, actionResult.traceId]))}
              className="absolute top-2 right-2 text-red-200 hover:text-red-100 font-bold text-lg"
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
          <div className="mb-6 p-4 bg-gradient-to-r from-emerald-900 to-emerald-800 border border-emerald-600 rounded">
            <p className="font-semibold text-emerald-300 mb-3">Your Active Tables</p>
            <div className="divide-y divide-emerald-700">
              {allTables.map((table: {inviteCode: string, type: 'created' | 'joined', tableId: string}, idx: number) => (
                <div key={idx} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:bg-emerald-800/50 transition-colors px-2 rounded">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-emerald-400">Code:</span>
                    <span className="font-mono font-bold text-lg text-emerald-200">{table.inviteCode}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        console.log('[LobbyView] Connect button clicked for table:', table.inviteCode);
                        const clientSeed = globalThis.crypto && 'randomUUID' in globalThis.crypto 
                          ? (globalThis.crypto as any).randomUUID() 
                          : Math.random().toString(36).slice(2);
                        onJoinTable(table.inviteCode, clientSeed, username);
                      }}
                      className={`px-4 py-2 ${table.type === 'created' ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800' : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'} text-white text-sm font-medium rounded transition-all hover:shadow-lg`}
                    >
                      Connect
                    </button>
                    <button
                      onClick={() => handleRemoveTable(table.inviteCode)}
                      className="text-gray-500 hover:text-red-500 font-bold text-2xl w-8 h-8 flex items-center justify-center transition-colors"
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
          <div className="border-b border-emerald-800 pb-6">
            <h2 className="text-xl font-semibold mb-4 text-emerald-300">
              Create New Table
            </h2>
            <button
              onClick={handleCreateTable}
              disabled={isCreating}
              className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-all hover:shadow-lg hover:shadow-emerald-500/50"
            >
              {isCreating ? 'Creating...' : 'Create Table'}
            </button>
            <p className="text-sm text-gray-400 mt-2">
              You'll get a unique invite code to share with friends.
            </p>
          </div>
          
          {/* Join Table Section */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-emerald-300">
              Join Existing Table
            </h2>
            <form onSubmit={handleJoinTable}>
              <div className="mb-4">
                <label htmlFor="inviteCode" className="block text-sm font-medium text-emerald-400 mb-2">
                  Invite Code
                </label>
                <input
                  type="text"
                  id="inviteCode"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Enter 6-character code"
                  maxLength={6}
                  className="w-full px-3 py-2 bg-gray-800 border border-emerald-700 text-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono text-center text-lg uppercase placeholder-gray-600"
                  disabled={isJoining}
                />
              </div>
              <button
                type="submit"
                disabled={!inviteCode.trim() || isJoining}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-all hover:shadow-lg hover:shadow-blue-500/50"
              >
                {isJoining ? 'Joining...' : 'Join Table'}
              </button>
            </form>
            <p className="text-sm text-gray-400 mt-2">
              Enter the 6-character code shared by your friend.
            </p>
          </div>
        </div>
        
        <div className="mt-8 text-center text-sm text-gray-500">
          <p className="text-emerald-400">American Mahjong • Online Multiplayer</p>
          {username && (
            <p className="mt-2 text-gray-400">
              Playing as: <span className="font-semibold text-emerald-300">{username}</span>
              {' • '}
              <button
                onClick={() => {
                  setUsernameInput(username);
                  setPendingAction(null);
                  setShowUsernameModal(true);
                }}
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Change
              </button>
            </p>
          )}
          <p className="mt-2">
            <button
              onClick={() => {
                if (confirm('Clear all stored data? This will remove your message history and table list.')) {
                  try {
                    localStorage.clear();
                    window.location.reload();
                  } catch (e) {
                    console.error('Failed to clear storage:', e);
                  }
                }
              }}
              className="text-red-600 hover:text-red-800 underline text-xs"
            >
              Clear Storage
            </button>
          </p>
        </div>
      </div>

      {/* Username Modal */}
      {showUsernameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold text-center mb-4 text-gray-800">
              Enter Your Username
            </h2>
            <p className="text-gray-600 text-center mb-6">
              Choose a username to identify yourself in the game
            </p>
            <form onSubmit={handleUsernameSubmit}>
              <div className="mb-6">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Your username"
                  maxLength={20}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-center text-lg"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                {pendingAction && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowUsernameModal(false);
                      setPendingAction(null);
                      setPendingInviteCode('');
                    }}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-3 px-4 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!usernameInput.trim()}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                >
                  {pendingAction ? 'Continue' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
