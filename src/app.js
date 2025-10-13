const express = require('express');
const path = require('path');
// Middleware
const { encabezadosSeguridad } = require('./middleware/seguridad');
const { manejadorErroresGlobal } = require('./middleware/manejadorErrores');
const { registradorSolicitudes } = require('./middleware/registro');

// Rutas
const rutasAsistencias = require('./routes/attendance');
const rutasAdministracion = require('./routes/admin');
const rutasAutenticacion = require('./routes/auth');
const rutasConfiguracion = require('./routes/config');

const app = express();

// Configuración de middlewares globales
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de seguridad
if (process.env.NODE_ENV === 'production') {
    app.use(encabezadosSeguridad);
    console.log('🛡️ Encabezados de seguridad activados para producción');
}

// Registro de solicitudes en desarrollo
if (process.env.NODE_ENV === 'development') {
    app.use(registradorSolicitudes);
}

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, '../public')));
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

// Verificación de estado
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        message: 'Sistema de pase de lista funcionando correctamente',
        version: process.env.npm_package_version || '1.0.0'
    });
});

// Rutas de API
app.use('/api/config', rutasConfiguracion);
app.use('/api/auth', rutasAutenticacion);
app.use('/api/attendance', rutasAsistencias);
app.use('/api/admin', rutasAdministracion);

// Rutas de vistas
app.get('/', (req, res, next) => {
    res.sendFile(path.join(__dirname, '../public/index.html'), (error) => {
        if (error) {
            console.error('❌ Error al servir la vista principal:', error.message);
            next(error);
        }
    });
});

app.get('/admin', (req, res, next) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'), (error) => {
        if (error) {
            console.error('❌ Error al servir la vista de administración:', error.message);
            next(error);
        }
    });
});

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
    console.log(`⚠️ Ruta no encontrada: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        error: 'Ruta no encontrada',
        path: req.originalUrl,
        method: req.method
    });
});

// Middleware de manejo de errores (debe ir al final)
app.use(manejadorErroresGlobal);

module.exports = app;
