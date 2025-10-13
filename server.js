const app = require('./src/app');
const config = require('./src/config/server');
const ServicioSistema = require('./src/services/servicioSistema');

const PUERTO = process.env.PORT || config.DEFAULT_PORT;

async function iniciarServidor() {
    try {
        // Inicializar el sistema (crear directorios, archivos base, etc.)
        console.log('🔄 Inicializando sistema...');
        await ServicioSistema.inicializarSistema();

        // Iniciar servidor
        const servidor = app.listen(PUERTO, () => {
            console.log('🚀 ================================');
            console.log('🪖 Sistema de Pase de Lista Militar');
            console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🚀 Servidor corriendo en puerto ${PUERTO}`);

            if (process.env.NODE_ENV !== 'production') {
                console.log(`🌐 URL local: http://localhost:${PUERTO}`);
                console.log(`👤 Panel admin: http://localhost:${PUERTO}/admin`);
            }

            console.log('🔐 Usuario admin por defecto: admin / admin123');
            const defaultTechnicalPassword = process.env.TECH_ADMIN_PASSWORD || 'tecnico123';
            console.log(`🛠️ Contraseña técnica por defecto: ${defaultTechnicalPassword}`);
            console.log('🚀 ================================');
        });

        // Manejo de señales para cierre ordenado
        process.on('SIGTERM', () => {
            console.log('📴 Recibida señal SIGTERM, cerrando servidor...');
            servidor.close(() => {
                console.log('✅ Servidor cerrado correctamente');
                process.exit(0);
            });
        });

        process.on('SIGINT', () => {
            console.log('\n📴 Recibida señal SIGINT, cerrando servidor...');
            servidor.close(() => {
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
    console.error('❌ Rechazo no controlado en:', promise, 'razón:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Excepción no controlada:', error);
    process.exit(1);
});

iniciarServidor();
