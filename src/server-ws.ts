/**
 * Servidor mínimo solo para WebSocket de transcripción.
 * Desplegar en Railway (o similar) para soportar conexiones persistentes.
 * La API REST sigue en Vercel.
 */

import http from 'http';
import dotenv from 'dotenv';
import { connectDB } from './config/database';
import { attachTranscriptionWebSocket } from './ws/transcriptionWs';

dotenv.config();

// Modelos necesarios para transcripción (registrar antes de usar)
import './models/Cita';
import './models/TranscriptionSession';
import './models/TranscriptionSegment';

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
  server.listen(PORT, () => {
    console.log(`📡 WebSocket de transcripción en puerto ${PORT}`);
    console.log(`   Endpoint: ws://localhost:${PORT}/api/transcription-ws`);
  });
}

main().catch((err) => {
  console.error('Error iniciando servidor WebSocket:', err);
  process.exit(1);
});
