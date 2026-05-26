/**
 * Varios WebSocketServer con `{ server, path }` registran cada uno `server.on('upgrade')`.
 * El primero que no coincide con su path llama `abortHandshake` y mata el socket → el copiloto nunca conecta.
 * Aquí: un solo listener `upgrade` y WSS en modo `noServer`.
 */

import type { IncomingMessage, Server } from 'http';
import { WebSocketServer } from 'ws';
import { registerTranscriptionHandlers } from './transcriptionWs';
import { registerMedicoCopilotoVozHandlers } from './medicoCopilotoVozWs';
import { registerChatHandlers } from './chatWs';

function pathnameOf(req: IncomingMessage): string {
  const u = req.url || '';
  const q = u.indexOf('?');
  return q === -1 ? u : u.slice(0, q);
}

export function registerSharedWebSockets(server: Server): void {
  // perMessageDeflate: false → necesario detrás de proxies (Railway/Cloudflare/etc.)
  // que corrompen frames comprimidos generando "Invalid frame header" en el cliente.
  const wssTranscription = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const wssCopiloto = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const wssChat = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  registerTranscriptionHandlers(wssTranscription);
  registerMedicoCopilotoVozHandlers(wssCopiloto);
  registerChatHandlers(wssChat);

  server.on('upgrade', (request, socket, head) => {
    try {
      const p = pathnameOf(request);
      if (p === '/api/transcription-ws') {
        wssTranscription.handleUpgrade(request, socket, head, (ws) => {
          wssTranscription.emit('connection', ws, request);
        });
      } else if (p === '/api/medico/copiloto-voz-ws') {
        wssCopiloto.handleUpgrade(request, socket, head, (ws) => {
          wssCopiloto.emit('connection', ws, request);
        });
      } else if (p === '/api/chat-ws') {
        wssChat.handleUpgrade(request, socket, head, (ws) => {
          wssChat.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });
}
