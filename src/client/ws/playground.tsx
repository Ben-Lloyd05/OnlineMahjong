// path: mahjong-ts/src/client/ws/playground.tsx
import { ClientToServer } from '../../server/ws/protocol';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';

function send(ws: WebSocket, msg: ClientToServer) {
  ws.send(JSON.stringify(msg));
}

export function startPlayground(tableId = 'table1') {
  const ws = new WebSocket('ws://localhost:8080');
  ws.onopen = () => {
    const now = new Date().toISOString();
    send(ws, { type: 'auth', traceId: randomUUID(), ts: now, token: 'demo' });
    send(ws, { type: 'subscribe', traceId: randomUUID(), ts: now, tableId });
  };
  ws.onmessage = (ev: any) => {
    console.log('msg:', ev.data);
  };
}


