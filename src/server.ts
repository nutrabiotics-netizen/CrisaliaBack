import app from './index';

const PORT = process.env.PORT || 5000;

// Solo iniciar el servidor en desarrollo local
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  });
}

