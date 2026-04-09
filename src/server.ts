import app from './index';
import { attachTranscriptionWebSocket } from './ws/transcriptionWs';
import { ejecutarRecordatoriosCitasPendientes } from './services/notifications/citaWhatsAppNotifier';

const PORT = process.env.PORT || 5000;

const REMINDER_INTERVAL_MS = 15 * 60 * 1000;

// Solo iniciar el servidor en desarrollo local
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  });
  attachTranscriptionWebSocket(server);
  console.log('📡 WebSocket de transcripción en /api/transcription-ws');

  if (process.env.ENABLE_CITA_REMINDER_JOB !== '0') {
    setTimeout(() => {
      ejecutarRecordatoriosCitasPendientes().catch((e) => console.error('[Cita-WhatsApp] job inicial:', e));
    }, 20_000);
    setInterval(() => {
      ejecutarRecordatoriosCitasPendientes().catch((e) => console.error('[Cita-WhatsApp] job:', e));
    }, REMINDER_INTERVAL_MS);
    console.log('⏰ Recordatorios de cita (24h / 2h): job cada 15 min (deshabilitar con ENABLE_CITA_REMINDER_JOB=0)');
  }
}

