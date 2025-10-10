const app = require('./src/app');
const config = require('./src/config/server');
const ServicioSistema = require('./src/services/servicioSistema');

const PORT = process.env.PORT || config.DEFAULT_PORT;

async function startServer() {
    try {
        // Inicializar el sistema (crear directorios, archivos base, etc.)
        console.log('🔄 Inicializando sistema...');
        await ServicioSistema.initializeSystem();

        // Iniciar servidor
        const server = app.listen(PORT, () => {
            console.log('🚀 ================================');
            console.log('🪖 Sistema de Pase de Lista Militar');
            console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🚀 Servidor corriendo en puerto ${PORT}`);

            if (process.env.NODE_ENV !== 'production') {
                console.log(`🌐 URL local: http://localhost:${PORT}`);
                console.log(`👤 Panel admin: http://localhost:${PORT}/admin`);
            }

            console.log('🔐 Usuario admin por defecto: admin / admin123');
            console.log('🚀 ================================');
        });

        // Manejo de señales para cierre graceful
        process.on('SIGTERM', () => {
            console.log('📴 Recibida señal SIGTERM, cerrando servidor...');
            server.close(() => {
                console.log('✅ Servidor cerrado correctamente');
                process.exit(0);
            });
        });

        process.on('SIGINT', () => {
            console.log('\n📴 Recibida señal SIGINT, cerrando servidor...');
            server.close(() => {
                console.log('✅ Servidor cerrado correctamente');
                process.exit(0);
            });
        });
    } catch (error) {
        console.error('❌ Error fatal al iniciar servidor:', error);
        process.exit(1);
    }
}

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection en:', promise, 'razón:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

startServer();
