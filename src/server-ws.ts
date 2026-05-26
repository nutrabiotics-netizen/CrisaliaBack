/**
 * Servidor mínimo solo para WebSocket de transcripción.
 * Desplegar en Railway (o similar) para soportar conexiones persistentes.
 * La API REST sigue en Vercel.
 */

import http from 'http';
import dotenv from 'dotenv';
import { connectDB } from './config/database';
import { WebSocketServer } from 'ws';
import { registerTranscriptionHandlers } from './ws/transcriptionWs';
import { registerChatHandlers } from './ws/chatWs';

dotenv.config();

// Handlers globales — sin esto, una excepción no manejada tumba el proceso silenciosamente
process.on('unhandledRejection', (reason) => {
  console.error('[server-ws] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server-ws] uncaughtException:', err);
});

// Modelos necesarios para transcripción (registrar antes de usar)
import './models/Cita';
import './models/TranscriptionSession';
import './models/TranscriptionSegment';
import './models/ChatMessage';

const PORT = process.env.PORT || 5001;

async function main() {
  await connectDB();

  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'OK', service: 'transcription-ws' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  // IMPORTANTE: usar { noServer: true } + un único listener de `upgrade` que enrute
  // por pathname. Si se montan 2 WSS con { server, path }, cada uno se cuelga del
  // mismo evento 'upgrade' y el que NO matchea llama abortHandshake → manda HTTP 400
  // sobre un socket que ya tuvo 101 OK del otro → browser ve "Invalid frame header"
  // y cierra con código 1006. (Mismo patrón que registerWebSockets.ts.)
  const wssTranscription = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const wssChat = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  registerTranscriptionHandlers(wssTranscription);
  registerChatHandlers(wssChat);

  function pathnameOf(req: http.IncomingMessage): string {
    const u = req.url || '';
    const q = u.indexOf('?');
    return q === -1 ? u : u.slice(0, q);
  }

  server.on('upgrade', (request, socket, head) => {
    try {
      const p = pathnameOf(request);
      if (p === '/api/transcription-ws') {
        wssTranscription.handleUpgrade(request, socket, head, (ws) => {
          wssTranscription.emit('connection', ws, request);
        });
      } else if (p === '/api/chat-ws') {
        wssChat.handleUpgrade(request, socket, head, (ws) => {
          wssChat.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch (err) {
      console.error('[server-ws] upgrade error:', err);
      socket.destroy();
    }
  });

  server.listen(PORT, () => {
    console.log(`📡 WebSocket server en puerto ${PORT}`);
    console.log(`   Endpoint transcripción: ws://localhost:${PORT}/api/transcription-ws`);
    console.log(`   Endpoint chat:          ws://localhost:${PORT}/api/chat-ws`);
  });
}

main().catch((err) => {
  console.error('Error iniciando servidor WebSocket:', err);
  process.exit(1);
});
