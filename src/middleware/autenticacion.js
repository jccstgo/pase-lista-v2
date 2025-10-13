const jwt = require('jsonwebtoken');
const config = require('../config/server');

/**
 * Middleware para autenticar administradores
 */
const autenticarAdministrador = async (req, res, next) => {
    try {
        const encabezadoAutorizacion = req.headers.authorization;

        if (!encabezadoAutorizacion) {
            return res.status(401).json({
                error: 'Token de autorización requerido',
                code: 'MISSING_TOKEN'
            });
        }

        const token = encabezadoAutorizacion.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                error: 'Formato de token inválido. Use: Bearer <token>',
                code: 'INVALID_TOKEN_FORMAT'
            });
        }

        const datosDecodificados = jwt.verify(token, config.JWT_SECRET);

        // Verificar que el token no haya expirado
        const now = Math.floor(Date.now() / 1000);
        if (datosDecodificados.exp && datosDecodificados.exp < now) {
            return res.status(401).json({
                error: 'Token expirado',
                code: 'TOKEN_EXPIRED'
            });
        }

        req.admin = datosDecodificados;
        next();
    } catch (error) {
        console.error('❌ Error de autenticación:', error.message);

        let errorMessage = 'Token inválido';
        let errorCode = 'INVALID_TOKEN';
        
        if (error.name === 'JsonWebTokenError') {
            errorMessage = 'Token malformado';
            errorCode = 'MALFORMED_TOKEN';
        } else if (error.name === 'TokenExpiredError') {
            errorMessage = 'Token expirado';
            errorCode = 'TOKEN_EXPIRED';
        }
        
        res.status(403).json({ 
            error: errorMessage,
            code: errorCode
        });
    }
};

/**
 * Middleware opcional de autenticación
 */
const autenticacionOpcional = async (req, res, next) => {
    try {
        const encabezadoAutorizacion = req.headers.authorization;

        if (encabezadoAutorizacion) {
            const token = encabezadoAutorizacion.split(' ')[1];
            if (token) {
                const datosDecodificados = jwt.verify(token, config.JWT_SECRET);
                req.admin = datosDecodificados;
            }
        }

        next();
    } catch (error) {
        // En auth opcional, ignoramos errores y continuamos sin autenticación
        next();
    }
};

/**
 * Generar token JWT
 */
const generarToken = (cargaUtil) => {
    return jwt.sign(cargaUtil, config.JWT_SECRET, {
        expiresIn: config.JWT_EXPIRES_IN
    });
};

/**
 * Verificar token JWT
 */
const verificarToken = (token) => {
    return jwt.verify(token, config.JWT_SECRET);
};

/**
 * Middleware para rutas que requieren privilegios técnicos
 */
const requerirAccesoTecnico = (req, res, next) => {
    const scopes = Array.isArray(req.admin?.scopes) ? req.admin.scopes : [];
    const tieneAcceso = req.admin?.technicalAccess === true || scopes.includes('technical');

    if (!tieneAcceso) {
        return res.status(403).json({
            success: false,
            error: 'Acceso técnico requerido',
            code: 'TECH_ACCESS_REQUIRED'
        });
    }

    next();
};

module.exports = {
    autenticarAdministrador,
    autenticacionOpcional,
    generarToken,
    verificarToken,
    requerirAccesoTecnico
};