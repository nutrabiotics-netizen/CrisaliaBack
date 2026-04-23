/**
 * Varios WebSocketServer con `{ server, path }` registran cada uno `server.on('upgrade')`.
 * El primero que no coincide con su path llama `abortHandshake` y mata el socket → el copiloto nunca conecta.
 * Aquí: un solo listener `upgrade` y WSS en modo `noServer`.
 */

import type { IncomingMessage, Server } from 'http';
import { WebSocketServer } from 'ws';
import { registerTranscriptionHandlers } from './transcriptionWs';
import { registerMedicoCopilotoVozHandlers } from './medicoCopilotoVozWs';

function pathnameOf(req: IncomingMessage): string {
  const u = req.url || '';
  const q = u.indexOf('?');
  return q === -1 ? u : u.slice(0, q);
}

export function registerSharedWebSockets(server: Server): void {
  const wssTranscription = new WebSocketServer({ noServer: true });
  const wssCopiloto = new WebSocketServer({ noServer: true });

  registerTranscriptionHandlers(wssTranscription);
  registerMedicoCopilotoVozHandlers(wssCopiloto);

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
      } else {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });
}
