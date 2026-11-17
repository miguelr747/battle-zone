import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  buyShopItem,
  claimMission,
  createGuestUser,
  getLeaderboard,
  getUserByToken,
  loginUser,
  recordMatchResult,
  registerUser,
  updateCustomization,
} from './src/server/db';
import { attachWebSocketServer } from './src/server/matchServer';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  attachWebSocketServer(wss);

  app.use(express.json());

  function extractToken(req: express.Request): string | undefined {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    return undefined;
  }

  // Auth & Profile API
  app.post('/api/auth/guest', (_req, res) => {
    try {
      const result = createGuestUser();
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/auth/register', (req, res) => {
    try {
      const token = extractToken(req);
      const guest = getUserByToken(token);
      const result = registerUser(
        String(req.body?.username || ''),
        String(req.body?.password || ''),
        guest?.isGuest ? guest.id : undefined
      );
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const result = loginUser(String(req.body?.username || ''), String(req.body?.password || ''));
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/profile', (req, res) => {
    const profile = getUserByToken(extractToken(req));
    if (!profile) {
      res.status(401).json({ error: 'Sesión no iniciada' });
      return;
    }
    res.json({ profile });
  });

  app.post('/api/profile/customize', (req, res) => {
    const user = getUserByToken(extractToken(req));
    if (!user) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    try {
      const profile = updateCustomization(user.id, req.body);
      res.json({ profile });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/shop/buy', (req, res) => {
    const user = getUserByToken(extractToken(req));
    if (!user) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    try {
      const profile = buyShopItem(user.id, String(req.body?.itemId || ''));
      res.json({ profile });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/missions/claim', (req, res) => {
    const user = getUserByToken(extractToken(req));
    if (!user) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    try {
      const profile = claimMission(user.id, String(req.body?.missionKey || ''));
      res.json({ profile });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/match/record', (req, res) => {
    const user = getUserByToken(extractToken(req));
    if (!user) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    try {
      const result = recordMatchResult(user.id, req.body);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/leaderboard', (_req, res) => {
    res.json({ leaderboard: getLeaderboard() });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`BATTLE ZONE server running on http://localhost:${port}`);
  });
}

startServer();
