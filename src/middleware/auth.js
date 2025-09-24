const jwt = require('jsonwebtoken');
const config = require('../config/server');

/**
 * Middleware para autenticar administradores
 */
const authenticateAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({ 
                error: 'Token de autorización requerido',
                code: 'MISSING_TOKEN'
            });
        }

        const token = authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                error: 'Formato de token inválido. Use: Bearer <token>',
                code: 'INVALID_TOKEN_FORMAT'
            });
        }

        const decoded = jwt.verify(token, config.JWT_SECRET);
        
        // Verificar que el token no haya expirado
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp && decoded.exp < now) {
            return res.status(401).json({ 
                error: 'Token expirado',
                code: 'TOKEN_EXPIRED'
            });
        }

        req.admin = decoded;
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
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            if (token) {
                const decoded = jwt.verify(token, config.JWT_SECRET);
                req.admin = decoded;
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
const generateToken = (payload) => {
    return jwt.sign(payload, config.JWT_SECRET, { 
        expiresIn: config.JWT_EXPIRES_IN 
    });
};

/**
 * Verificar token JWT
 */
const verifyToken = (token) => {
    return jwt.verify(token, config.JWT_SECRET);
};

module.exports = {
    authenticateAdmin,
    optionalAuth,
    generateToken,
    verifyToken
};