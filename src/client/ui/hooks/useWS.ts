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

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (e) {
      console.error('Failed to save table history:', e);
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
    
    ws.onclose = () => {
      console.log('[useWS] WebSocket closed');
    };
    
    ws.onerror = (error) => {
      console.error('[useWS] WebSocket error:', error);
    };
    
    return () => {
      console.log('[useWS] Cleaning up WebSocket connection');
      ws.close();
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

  const createTable = (clientSeed?: string) => {
    const ts = new Date().toISOString();
    const tid = cryptoRandomId();
    send({ type: 'create_table', traceId: tid(), ts, clientSeed } as ClientToServer);
  };

  const joinTable = (inviteCode: string, clientSeed?: string) => {
    const ts = new Date().toISOString();
    const tid = cryptoRandomId();
    send({ type: 'join_table', traceId: tid(), ts, inviteCode, clientSeed } as ClientToServer);
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

  return { messages, send, createTable, joinTable, leaveTable, getMyTables, clearHistory };
}

function cryptoRandomId() {
  return () => (globalThis.crypto && 'randomUUID' in globalThis.crypto ? (globalThis.crypto as any).randomUUID() : Math.random().toString(36).slice(2));
}


