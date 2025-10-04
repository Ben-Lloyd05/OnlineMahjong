import { startServer } from '../src/server/ws/server';
import WebSocket from 'ws';

function auth(ws: WebSocket) {
  const traceId = 't-' + Math.random().toString(36).slice(2);
  const ts = new Date().toISOString();
  ws.send(JSON.stringify({ type: 'auth', traceId, ts, token: 'ok' }));
}

function subscribe(ws: WebSocket, tableId: string) {
  const traceId = 't-' + Math.random().toString(36).slice(2);
  const ts = new Date().toISOString();
  ws.send(JSON.stringify({ type: 'subscribe', traceId, ts, tableId }));
}

describe('WS integration', () => {
  let srv: any;
  beforeAll(() => {
    srv = startServer(9090);
  });
  afterAll((done) => {
    srv.close(done);
  });

  test('connect 4 clients and receive state updates', (done) => {
    const tableId = 'ws-test-table';
    const clients = [0,1,2,3].map(() => new WebSocket('ws://localhost:9090'));
    let readyCount = 0;
    for (const ws of clients) {
      ws.on('open', () => {
        auth(ws);
        subscribe(ws, tableId);
      });
      ws.on('message', (data: Buffer) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'game_state_update' && msg.full) {
          readyCount++;
          if (readyCount === 4) {
            for (const c of clients) c.close();
            done();
          }
        }
      });
    }
  });
});


