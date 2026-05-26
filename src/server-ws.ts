/**
 * Servidor mínimo solo para WebSocket de transcripción.
 * Desplegar en Railway (o similar) para soportar conexiones persistentes.
 * La API REST sigue en Vercel.
 */

import http from 'http';
import dotenv from 'dotenv';
import { connectDB } from './config/database';
import { attachTranscriptionWebSocket } from './ws/transcriptionWs';
import { WebSocketServer } from 'ws';
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

  attachTranscriptionWebSocket(server);

  // Chat de teleconsulta (compartido por médico y paciente)
  // perMessageDeflate: false → el proxy de Railway corrompe frames comprimidos
  const wssChat = new WebSocketServer({ server, path: '/api/chat-ws', perMessageDeflate: false });
  registerChatHandlers(wssChat);

  server.listen(PORT, () => {
    console.log(`📡 WebSocket de transcripción en puerto ${PORT}`);
    console.log(`   Endpoint transcripción: ws://localhost:${PORT}/api/transcription-ws`);
    console.log(`   Endpoint chat:          ws://localhost:${PORT}/api/chat-ws`);
  });
}

main().catch((err) => {
  console.error('Error iniciando servidor WebSocket:', err);
  process.exit(1);
});
