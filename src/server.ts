import app from './index';
import { attachTranscriptionWebSocket } from './ws/transcriptionWs';

const PORT = process.env.PORT || 5000;

// Solo iniciar el servidor en desarrollo local
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  });
  attachTranscriptionWebSocket(server);
  console.log('📡 WebSocket de transcripción en /api/transcription-ws');
}

