const express = require('express');
const path = require('path');
const config = require('./config/server');

// Middlewares
const { securityHeaders } = require('./middleware/security');
const { globalErrorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logger');

// Routes
const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');

const app = express();

// Configuración de middlewares globales
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middlewares de seguridad
if (process.env.NODE_ENV === 'production') {
    app.use(securityHeaders);
    console.log('🛡️ Headers de seguridad activados para producción');
}

// Logger de requests
if (process.env.NODE_ENV === 'development') {
    app.use(requestLogger);
}

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, '../public')));
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'Sistema de pase de lista funcionando correctamente',
        version: process.env.npm_package_version || '1.0.0'
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);

// Rutas de vistas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/views/index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/views/admin.html'));
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
app.use(globalErrorHandler);

module.exports = app;