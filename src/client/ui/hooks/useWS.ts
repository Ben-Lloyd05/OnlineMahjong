import { useEffect, useRef, useState } from 'react';
import { ClientToServer, ServerToClient } from '../../../server/ws/protocol';

export function useWS(url: string, tableId: string, opts?: { clientSeed?: string }) {
  const wsRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<ServerToClient[]>([]);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;
    
    ws.onopen = () => {
      const ts = new Date().toISOString();
      const tid = cryptoRandomId();
      ws.send(JSON.stringify({ type: 'auth', traceId: tid(), ts, token: 'demo' } as ClientToServer));
      ws.send(JSON.stringify({ type: 'subscribe', traceId: tid(), ts, tableId, clientSeed: opts?.clientSeed } as ClientToServer));
    };
    
    ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data);
        setMessages((prev: ServerToClient[]) => [...prev, msg]);
      } catch {}
    };
    
    return () => { ws.close(); };
  }, [url, tableId]);

  const send = (msg: ClientToServer) => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify(msg));
  };

  return { messages, send };
}

function cryptoRandomId() {
  return () => (globalThis.crypto && 'randomUUID' in globalThis.crypto ? (globalThis.crypto as any).randomUUID() : Math.random().toString(36).slice(2));
}


