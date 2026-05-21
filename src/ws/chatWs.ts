/**
 * WebSocket de chat de teleconsulta.
 *  - Autenticación por token en query: ?token=JWT&citaId=<id>
 *  - Mensajes JSON del cliente:
 *      { type: 'send', text: string, attachmentUrl?, attachmentType? }
 *      { type: 'mark_read' }
 *      { type: 'ping' }
 *  - Mensajes JSON del servidor:
 *      { type: 'hello', citaId, role, messages: [...] }   // historial al conectar
 *      { type: 'message', message: {...} }                // mensaje nuevo
 *      { type: 'read', readerRole, count }                // mensajes marcados como leídos
 *      { type: 'error', message }
 *
 * Cada cita tiene su propia "sala": cuando el médico o el paciente envía un
 * mensaje, se hace broadcast a todos los sockets de esa cita (incluido el
 * remitente, para que su ChatDrawer agregue el mensaje confirmado).
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { verifyToken } from '../utils/jwt';
import { UserRole } from '../types';
import {
  createMessage,
  getCitaForUser,
  listMessagesByCita,
  markMessagesRead
} from '../services/chat/chatService';

interface ChatWsClient {
  ws: WebSocket;
  userId: string;
  role: UserRole;
  citaId: string;
}

const rooms = new Map<string, Set<ChatWsClient>>();

function broadcast(citaId: string, payload: object): void {
  const set = rooms.get(citaId);
  if (!set) return;
  const str = JSON.stringify(payload);
  set.forEach((c) => {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(str);
  });
}

function sendJson(ws: WebSocket, obj: object): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function paramsOf(url: string): URLSearchParams {
  const i = url.indexOf('?');
  return new URLSearchParams(i === -1 ? '' : url.slice(i));
}

export function registerChatHandlers(wss: WebSocketServer): void {
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const url = req.url || '';
    const params = paramsOf(url);
    const token = params.get('token');
    const citaId = params.get('citaId');

    if (!token || !citaId) {
      sendJson(ws, { type: 'error', message: 'Faltan parámetros: token y citaId' });
      ws.close(4001, 'Bad params');
      return;
    }

    let userId: string;
    let role: UserRole;
    try {
      const decoded = verifyToken(token);
      userId = decoded.userId;
      role = decoded.role as UserRole;
    } catch {
      sendJson(ws, { type: 'error', message: 'Token inválido' });
      ws.close(4001, 'Unauthorized');
      return;
    }

    // Validar acceso a la cita
    const cita = await getCitaForUser(citaId, userId, role);
    if (!cita) {
      sendJson(ws, { type: 'error', message: 'No tienes acceso a esta cita' });
      ws.close(4003, 'Forbidden');
      return;
    }

    const fromRole = role === UserRole.MEDICO ? 'MEDICO' : 'PACIENTE';
    const client: ChatWsClient = { ws, userId, role, citaId };

    if (!rooms.has(citaId)) rooms.set(citaId, new Set());
    rooms.get(citaId)!.add(client);

    // Historial inicial
    try {
      const messages = await listMessagesByCita(citaId);
      sendJson(ws, { type: 'hello', citaId, role: fromRole, messages });
    } catch (err) {
      console.error('[ChatWS] error listando historial:', err);
      sendJson(ws, { type: 'error', message: 'No se pudo cargar el historial' });
    }

    ws.on('message', async (data: Buffer | string) => {
      const str = Buffer.isBuffer(data) ? data.toString('utf8') : data;
      let msg: any;
      try {
        msg = JSON.parse(str);
      } catch {
        sendJson(ws, { type: 'error', message: 'Mensaje inválido (no JSON)' });
        return;
      }

      if (msg.type === 'send') {
        const text = (msg.text || '').toString().trim();
        if (!text) {
          sendJson(ws, { type: 'error', message: 'El mensaje no puede estar vacío' });
          return;
        }
        try {
          const created = await createMessage({
            citaId,
            fromUserId: userId,
            fromRole,
            text,
            attachmentUrl: msg.attachmentUrl,
            attachmentType: msg.attachmentType
          });
          broadcast(citaId, { type: 'message', message: created });
        } catch (err) {
          console.error('[ChatWS] error creando mensaje:', err);
          sendJson(ws, { type: 'error', message: 'No se pudo enviar el mensaje' });
        }
        return;
      }

      if (msg.type === 'mark_read') {
        try {
          const count = await markMessagesRead(citaId, fromRole);
          if (count > 0) broadcast(citaId, { type: 'read', readerRole: fromRole, count });
        } catch (err) {
          console.error('[ChatWS] error marcando leídos:', err);
        }
        return;
      }

      if (msg.type === 'ping') {
        sendJson(ws, { type: 'pong' });
        return;
      }
    });

    ws.on('close', () => {
      const set = rooms.get(citaId);
      if (set) {
        set.delete(client);
        if (set.size === 0) rooms.delete(citaId);
      }
    });
  });
}
