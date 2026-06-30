import dns from "dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

import http from "http";
import app from "./index";
import { registerSharedWebSockets } from "./ws/registerWebSockets";

const PORT = Number(process.env.PORT) || 5000;

/**
 * Arranque directo del servidor (nodemon/ts-node/node dist/server.js).
 * Algunos entornos no marcan require.main === module; comprobamos también argv.
 */
function isLaunchedAsServerEntry(): boolean {
  if (require.main === module) return true;

  const script = process.argv[1];
  if (!script) return false;

  const n = script.replace(/\\/g, "/");

  return (
    n.endsWith("/server.ts") ||
    n.endsWith("/server.js") ||
    n.endsWith("/server.mjs") ||
    n.endsWith("/server.cjs")
  );
}

if (isLaunchedAsServerEntry()) {
  const server = http.createServer(app);

  registerSharedWebSockets(server);

  server.listen(PORT, () => {
    console.log(`🚀 HTTP + WebSocket en puerto ${PORT}`);
    console.log("📡 /api/transcription-ws");
    console.log("📡 /api/medico/copiloto-voz-ws");
  });
}
