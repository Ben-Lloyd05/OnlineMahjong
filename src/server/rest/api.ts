// path: mahjong-ts/src/server/rest/api.ts
import http from 'http';
import { URL } from 'url';
import { load2024RuleCard } from '../../rulecard-parser';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, body?: any) => Promise<void> | void;

function json(res: http.ServerResponse, code: number, data: any) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8') || '{}';
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
  });
}

const routes: { method: string; path: RegExp; handler: Handler }[] = [];

function route(method: string, path: RegExp, handler: Handler) { routes.push({ method, path, handler }); }

// List rule cards (built-in 2024/2025)
route('GET', /^\/rule_cards$/, (req, res) => {
  json(res, 200, [{ name: 'NMJL 2024', year: 2024 }, { name: 'NMJL 2025', year: 2025 }]);
});

// Upload custom rule card
route('POST', /^\/rule_cards$/, async (req, res, body) => {
  if (!body?.name || !body?.year || !Array.isArray(body?.patterns)) {
    return json(res, 400, { error: 'invalid_rule_card' });
  }
  try {
    load2024RuleCard();
    return json(res, 200, { ok: true });
  } catch (e: any) {
    return json(res, 400, { error: 'invalid_rule_card', message: e?.message });
  }
});

// Create game
route('POST', /^\/games$/, async (req, res, body) => {
  const year = body?.year === 2024 ? 2024 : 2025;
  // Here would persist to DB; for scaffold return a stub
  return json(res, 200, { id: 'game-stub', year });
});

// Join game
route('POST', /^\/games\/([^/]+)\/join$/, async (req, res) => {
  return json(res, 200, { ok: true });
});

// Get replay
route('GET', /^\/games\/([^/]+)\/replay$/, async (req, res) => {
  return json(res, 200, { logs: [] });
});

export function startRestServer(port = 3000) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const match = routes.find(r => r.method === (req.method || '') && r.path.test(url.pathname));
    if (!match) return json(res, 404, { error: 'not_found' });
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method || '') ? await readBody(req) : undefined;
    return match.handler(req, res, body);
  });
  server.listen(port);
  return server;
}


