import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ServerToClient } from '../../server/ws/protocol';

interface AdminPageProps {
  messages: ServerToClient[];
  onAdminAuth: (password: string) => void;
  onListTables: () => void;
}

export default function AdminPage({ messages, onAdminAuth, onListTables }: AdminPageProps) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [hasTriedAutoAuth, setHasTriedAutoAuth] = useState(false);

  // Check for auth result
  const authResult = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if ((messages[i] as any).type === 'admin_auth_result') {
        return messages[i] as any;
      }
    }
    return null;
  }, [messages]);

  // Get tables list
  const tablesList = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if ((messages[i] as any).type === 'admin_tables_list') {
        return (messages[i] as any).tables || [];
      }
    }
    return [];
  }, [messages]);

  // Auto-authenticate on mount if password is stored
  useEffect(() => {
    if (!hasTriedAutoAuth) {
      const storedPassword = localStorage.getItem('mahjong_admin_password');
      if (storedPassword) {
        console.log('[AdminPage] Auto-authenticating with stored password');
        onAdminAuth(storedPassword);
      }
      setHasTriedAutoAuth(true);
    }
  }, [hasTriedAutoAuth, onAdminAuth]);

  // Detect unauthorized errors and re-authenticate
  useEffect(() => {
    // Check for unauthorized errors in recent messages
    const recentUnauthorized = messages.slice(-5).find((m: any) => 
      m.type === 'action_result' && 
      !m.ok && 
      (m.error?.code === 'unauthorized' || m.error?.message?.includes('Admin authentication'))
    );

    if (recentUnauthorized && isAuthenticated) {
      console.log('[AdminPage] Detected unauthorized error, attempting re-authentication');
      const storedPassword = localStorage.getItem('mahjong_admin_password');
      if (storedPassword) {
        onAdminAuth(storedPassword);
      } else {
        // Lost password, need to re-authenticate manually
        setIsAuthenticated(false);
        setAuthError('Session expired. Please log in again.');
      }
    }
  }, [messages, isAuthenticated, onAdminAuth]);

  // Handle auth result
  useEffect(() => {
    if (authResult) {
      if (authResult.ok) {
        setIsAuthenticated(true);
        setAuthError('');
        // Store password for auto-auth on reconnect
        if (password) {
          localStorage.setItem('mahjong_admin_password', password);
        }
        // Auto-request tables list
        onListTables();
      } else {
        setAuthError(authResult.error || 'Authentication failed');
        // Don't clear stored password on first fail - might be a transient error
        // Clear it only if user manually tries to auth and fails
        if (password) {
          localStorage.removeItem('mahjong_admin_password');
        }
      }
    }
  }, [authResult, onListTables, password]);

  // Auto-refresh tables list every 5 seconds when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(() => {
        console.log('[AdminPage] Auto-refreshing tables list');
        onListTables();
      }, 5000); // Refresh every 5 seconds

      return () => clearInterval(interval);
    }
  }, [isAuthenticated, onListTables]);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    onAdminAuth(password);
  };

  const handleRefresh = () => {
    onListTables();
  };

  const handleViewTable = (inviteCode: string) => {
    navigate(`/admin/table/${inviteCode}`);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPassword('');
    localStorage.removeItem('mahjong_admin_password');
    navigate('/');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Panel</h1>
            <p className="text-gray-600">Enter admin password to continue</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Admin Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter password"
                autoFocus
              />
            </div>

            {authError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-800 text-sm">{authError}</p>
              </div>
            )}

            <button
              type="submit"
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              Authenticate
            </button>
          </form>

          <button
            onClick={() => navigate('/')}
            className="w-full mt-4 px-6 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-2xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Admin Panel</h1>
              <p className="text-gray-600">Active Tables Overview</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Refresh Now
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
              >
                Logout
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
              >
                Back to Lobby
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-2xl p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Active Tables ({tablesList.length})
          </h2>

          {tablesList.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No active tables</p>
              <p className="text-gray-400 text-sm mt-2">Tables will appear here when players create them</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tablesList.map((table: any) => (
                <div
                  key={table.tableId}
                  className="border border-gray-200 rounded-lg p-4 hover:border-blue-500 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-900">
                          Code: {table.inviteCode}
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          table.gameStarted 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {table.gameStarted ? 'In Progress' : 'Waiting'}
                        </span>
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                          {table.playerCount}/4 Players
                        </span>
                      </div>

                      <div className="text-sm text-gray-600 mb-3">
                        <p className="mb-1">
                          <span className="font-medium">Table ID:</span>{' '}
                          <span className="font-mono text-xs">{table.tableId}</span>
                        </p>
                        <p>
                          <span className="font-medium">Created:</span>{' '}
                          {new Date(table.createdAt).toLocaleString()}
                        </p>
                      </div>

                      {table.players && table.players.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {table.players.map((player: any, idx: number) => (
                            <span
                              key={idx}
                              className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium"
                            >
                              {player.username} (P{player.playerId + 1})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleViewTable(table.inviteCode)}
                      className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
                    >
                      View Table
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
