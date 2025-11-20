import { useEffect, useRef, useState } from 'react';
import { ClientToServer, ServerToClient } from '../../../server/ws/protocol';

const STORAGE_KEY = 'mahjong_table_history';
const TABLES_STORAGE_KEY = 'mahjong_my_tables';

export function useWS(url: string, tableId: string, opts?: { clientSeed?: string }) {
  const wsRef = useRef<WebSocket | null>(null);
  
  // Load persisted messages from localStorage on mount
  const [messages, setMessages] = useState<ServerToClient[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load table history:', e);
    }
    return [];
  });

  // Persist messages to localStorage whenever they change (limit to last 100 to prevent quota issues)
  useEffect(() => {
    try {
      // Keep only the last 100 messages to prevent localStorage from filling up
      const messagesToStore = messages.slice(-100);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messagesToStore));
    } catch (e) {
      console.error('Failed to save table history:', e);
      // If we hit quota, clear old data and try again with just recent messages
      try {
        localStorage.removeItem(STORAGE_KEY);
        const recentMessages = messages.slice(-50);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(recentMessages));
      } catch (e2) {
        console.error('Failed to save even after clearing:', e2);
      }
    }
  }, [messages]);

  // Store session tokens when received
  useEffect(() => {
    const lastMessage = messages[messages.length - 1] as any;
    if (!lastMessage) return;
    
    // Store session token from table_created or table_joined
    if ((lastMessage.type === 'table_created' || lastMessage.type === 'table_joined') && lastMessage.sessionToken) {
      const inviteCode = lastMessage.inviteCode;
      console.log('[useWS] Storing session token for table:', inviteCode);
      localStorage.setItem(`mahjong_session_${inviteCode}`, lastMessage.sessionToken);
      
      // Also log if this was a reconnection
      if (lastMessage.reconnected) {
        console.log('[useWS] Successfully reconnected to table!');
      }
    }
  }, [messages]);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log('[useWS] WebSocket connected');
      const ts = new Date().toISOString();
      const tid = cryptoRandomId();
      ws.send(JSON.stringify({ type: 'auth', traceId: tid(), ts, token: 'demo' } as ClientToServer));
    };
    
    ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data);
        console.log('[useWS] Received message:', msg.type, msg);
        setMessages((prev: ServerToClient[]) => [...prev, msg]);
        
        // Persist table information to localStorage when we create or join
        if (msg.type === 'table_created' || msg.type === 'table_joined') {
          try {
            const stored = localStorage.getItem(TABLES_STORAGE_KEY);
            const myTables = stored ? JSON.parse(stored) : [];
            const tableInfo = {
              tableId: msg.tableId,
              inviteCode: msg.inviteCode,
              isCreator: msg.type === 'table_created',
              lastSeen: Date.now()
            };
            // Add or update
            const existing = myTables.findIndex((t: any) => t.inviteCode === msg.inviteCode);
            if (existing >= 0) {
              myTables[existing] = tableInfo;
            } else {
              myTables.push(tableInfo);
            }
            localStorage.setItem(TABLES_STORAGE_KEY, JSON.stringify(myTables));
          } catch (e) {
            console.error('Failed to persist table info:', e);
          }
        }
        
        // DON'T remove from localStorage when we leave - we want to keep it so user can rejoin
        // Tables should only be removed if they no longer exist on the server (handled by error responses)
        
        // Remove table from localStorage if we get an error joining it (table doesn't exist)
        if (msg.type === 'action_result' && !msg.ok) {
          // Check if this was a join_table error
          const errorMsg = msg.error?.message || '';
          if (errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
            try {
              // Try to extract invite code from the error or trace
              // For now, we can't easily determine which table failed, so we'll rely on user interaction
              console.log('[useWS] Table join failed, but keeping in localStorage for now');
            } catch (e) {
              console.error('Failed to handle error:', e);
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };
    
    ws.onclose = (event) => {
      console.log('[useWS] WebSocket closed:', event.code, event.reason);
      // Try to reconnect after a delay if it wasn't a clean close
      if (event.code !== 1000) {
        console.log('[useWS] Connection lost, will attempt to reconnect...');
        setTimeout(() => {
          console.log('[useWS] Attempting to reconnect...');
          // The useEffect will create a new connection
        }, 3000);
      }
    };
    
    ws.onerror = (error) => {
      // Only log significant errors, not connection attempts
      if (ws.readyState === WebSocket.CONNECTING) {
        console.log('[useWS] Waiting for WebSocket server...');
      } else {
        console.error('[useWS] WebSocket error:', error);
      }
    };
    
    return () => {
      console.log('[useWS] Cleaning up WebSocket connection');
      // Use code 1000 for normal closure
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Component unmounting');
      }
    };
  }, [url, tableId]);

  const send = (msg: ClientToServer) => {
    if (!wsRef.current) {
      console.error('[useWS] WebSocket not initialized');
      return;
    }
    if (wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('[useWS] WebSocket not open, readyState:', wsRef.current.readyState);
      return;
    }
    console.log('[useWS] Sending message:', msg.type, msg);
    wsRef.current.send(JSON.stringify(msg));
  };

  const createTable = (clientSeed?: string, username?: string) => {
    const ts = new Date().toISOString();
    const tid = cryptoRandomId();
    // Don't send session token when creating a new table - it's always a fresh creation
    send({ type: 'create_table', traceId: tid(), ts, clientSeed, username } as ClientToServer);
  };

  const joinTable = (inviteCode: string, clientSeed?: string, username?: string) => {
    const ts = new Date().toISOString();
    const tid = cryptoRandomId();
    // Try to get session token for reconnection
    const storedToken = localStorage.getItem(`mahjong_session_${inviteCode}`);
    const sessionToken = storedToken || undefined;
    console.log('[useWS] Joining table with session token:', sessionToken ? 'Yes' : 'No');
    send({ type: 'join_table', traceId: tid(), ts, inviteCode, clientSeed, username, sessionToken } as ClientToServer);
  };

  const leaveTable = () => {
    const ts = new Date().toISOString();
    const tid = cryptoRandomId();
    send({ type: 'leave_table', traceId: tid(), ts } as ClientToServer);
  };

  const getMyTables = () => {
    const ts = new Date().toISOString();
    const tid = cryptoRandomId();
    send({ type: 'get_my_tables', traceId: tid(), ts } as ClientToServer);
  };

  const clearHistory = () => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TABLES_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear table history:', e);
    }
  };

  // Admin functions
  const adminAuth = (password: string) => {
    const ts = new Date().toISOString();
    const tid = cryptoRandomId();
    send({ type: 'admin_auth', traceId: tid(), ts, password } as ClientToServer);
  };

  const adminListTables = () => {
    const ts = new Date().toISOString();
    const tid = cryptoRandomId();
    send({ type: 'admin_list_tables', traceId: tid(), ts } as ClientToServer);
  };

  const adminJoinTable = (inviteCode: string) => {
    const ts = new Date().toISOString();
    const tid = cryptoRandomId();
    send({ type: 'admin_join_table', traceId: tid(), ts, inviteCode } as ClientToServer);
  };

  return { 
    messages, 
    send, 
    createTable, 
    joinTable, 
    leaveTable, 
    getMyTables, 
    clearHistory,
    adminAuth,
    adminListTables,
    adminJoinTable
  };
}

function cryptoRandomId() {
  return () => (globalThis.crypto && 'randomUUID' in globalThis.crypto ? (globalThis.crypto as any).randomUUID() : Math.random().toString(36).slice(2));
}


