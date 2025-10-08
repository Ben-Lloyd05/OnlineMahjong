import { startServer } from '../src/server/ws/server';
import WebSocket from 'ws';

function auth(ws: WebSocket) {
  const traceId = 't-' + Math.random().toString(36).slice(2);
  const ts = new Date().toISOString();
  ws.send(JSON.stringify({ type: 'auth', traceId, ts, token: 'ok' }));
}

function createTable(ws: WebSocket, username: string) {
  const traceId = 't-' + Math.random().toString(36).slice(2);
  const ts = new Date().toISOString();
  const clientSeed = 'test-seed-' + Math.random().toString(36).slice(2);
  ws.send(JSON.stringify({ type: 'create_table', traceId, ts, clientSeed, username }));
}

function joinTable(ws: WebSocket, inviteCode: string, username: string) {
  const traceId = 't-' + Math.random().toString(36).slice(2);
  const ts = new Date().toISOString();
  const clientSeed = 'test-seed-' + Math.random().toString(36).slice(2);
  ws.send(JSON.stringify({ type: 'join_table', traceId, ts, inviteCode, clientSeed, username }));
}

describe('WS integration', () => {
  let srv: any;
  beforeAll(() => {
    srv = startServer(9090);
  });
  afterAll((done: any) => {
    setTimeout(() => {
      srv.close(done);
    }, 1000); // Give connections time to close
  }, 10000);

  test('create table with 4 players and receive game start', (done: any) => {
    let inviteCode: string | null = null;
    let gameStartCount = 0;
    const allClients: WebSocket[] = [];
    
    const checkComplete = () => {
      // When all 4 players receive game_start, test is complete
      if (gameStartCount === 4) {
        console.log('All 4 players received game_start! Test complete.');
        // Close all connections
        allClients.forEach(c => c.close());
        done();
      }
    };
    
    // Create first client
    const client0 = new WebSocket('ws://localhost:9090');
    allClients.push(client0);
    
    client0.on('open', () => {
      console.log('Client 0 connected, creating table...');
      auth(client0);
      createTable(client0, 'Player1');
    });

    client0.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      
      // Get invite code from table_created message
      if (msg.type === 'table_created') {
        inviteCode = msg.inviteCode;
        console.log(`Table created with invite code: ${inviteCode}`);
        
        // Now create and connect other clients
        for (let i = 1; i < 4; i++) {
          const playerNum = i + 1;
          const client = new WebSocket('ws://localhost:9090');
          allClients.push(client);
          
          client.on('open', () => {
            console.log(`Client ${i} connected, joining table...`);
            auth(client);
            joinTable(client, inviteCode!, `Player${playerNum}`);
          });
          
          client.on('message', (data: Buffer) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'game_start') {
              gameStartCount++;
              console.log(`Player ${playerNum} received game_start (${gameStartCount}/4)`);
              checkComplete();
            }
          });
        }
      }
      
      // Count game_start messages for client 0
      if (msg.type === 'game_start') {
        gameStartCount++;
        console.log(`Player 1 received game_start (${gameStartCount}/4)`);
        checkComplete();
      }
    });
  }, 15000); // Increase timeout to 15s
});


