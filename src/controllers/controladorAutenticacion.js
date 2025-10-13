const ServicioAdministracion = require('../services/servicioAdministracion');
const ServicioAccesoTecnico = require('../services/servicioAccesoTecnico');
const { manejadorAsincrono, ErrorAplicacion } = require('../middleware/manejadorErrores');
const { verificarToken } = require('../middleware/autenticacion');
const config = require('../config/server');

class ControladorAutenticacion {
    /**
     * Login de administrador
     * POST /api/auth/login
     */
    static iniciarSesion = manejadorAsincrono(async (req, res) => {
        console.log('🔐 Intento de login de administrador');
        
        const { username, password } = req.body;
        
        const result = await ServicioAdministracion.autenticar(username, password);
        
        res.status(200).json({
            success: true,
            message: 'Login exitoso',
            data: {
                token: result.token,
                admin: result.admin,
                expiresIn: result.expiresIn,
                loginTime: new Date().toISOString(),
                technicalAccess: result.technicalAccess === true
            }
        });
    });

    /**
     * Verificar token válido
     * POST /api/auth/verify
     */
    static verificarAutenticacion = manejadorAsincrono(async (req, res) => {
        console.log('🔍 Verificación de token');
        
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                error: 'Token de autorización requerido',
                code: 'MISSING_TOKEN'
            });
        }

        const token = authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Formato de token inválido',
                code: 'INVALID_TOKEN_FORMAT'
            });
        }

        try {
            const decoded = verificarToken(token);
            
            // Verificar que el usuario aún existe
            const admin = await ServicioAdministracion.buscarPorNombreUsuario(decoded.username);
            
            if (!admin) {
                return res.status(401).json({
                    success: false,
                    error: 'Usuario no válido',
                    code: 'INVALID_USER'
                });
            }

            // Verificar si la cuenta está bloqueada
            if (admin.isLocked()) {
                return res.status(423).json({
                    success: false,
                    error: 'Cuenta bloqueada',
                    code: 'ACCOUNT_LOCKED'
                });
            }

            const hasTechnicalAccess = decoded.technicalAccess === true ||
                (Array.isArray(decoded.scopes) && decoded.scopes.includes('technical'));

            res.status(200).json({
                success: true,
                data: {
                    valid: true,
                    admin: admin.toSafeJSON(),
                    technicalAccess: hasTechnicalAccess,
                    tokenInfo: {
                        username: decoded.username,
                        issuedAt: new Date(decoded.iat * 1000).toISOString(),
                        expiresAt: new Date(decoded.exp * 1000).toISOString(),
                        scopes: decoded.scopes || ['admin'],
                        technicalAccess: hasTechnicalAccess
                    }
                }
            });
        } catch (error) {
            let errorMessage = 'Token inválido';
            let errorCode = 'INVALID_TOKEN';
            
            if (error.name === 'TokenExpiredError') {
                errorMessage = 'Token expirado';
                errorCode = 'TOKEN_EXPIRED';
            } else if (error.name === 'JsonWebTokenError') {
                errorMessage = 'Token malformado';
                errorCode = 'MALFORMED_TOKEN';
            }
            
            res.status(401).json({
                success: false,
                error: errorMessage,
                code: errorCode
            });
        }
    });

    /**
     * Renovar token
     * POST /api/auth/refresh
     */
    static renovarToken = manejadorAsincrono(async (req, res) => {
        console.log('🔄 Renovación de token');
        
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                error: 'Token de autorización requerido'
            });
        }

        const token = authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Formato de token inválido'
            });
        }

        try {
            // Verificar token actual (puede estar expirado)
            const decoded = verificarToken(token);
            
            // Verificar que el usuario aún existe
            const admin = await ServicioAdministracion.buscarPorNombreUsuario(decoded.username);
            
            if (!admin) {
                return res.status(401).json({
                    success: false,
                    error: 'Usuario no válido'
                });
            }

            if (admin.isLocked()) {
                return res.status(423).json({
                    success: false,
                    error: 'Cuenta bloqueada'
                });
            }

            const existingScopes = Array.isArray(decoded.scopes) ? decoded.scopes : ['admin'];
            const technicalAccess = decoded.technicalAccess === true || existingScopes.includes('technical');

            const newToken = ServicioAdministracion.crearTokenSesion(admin.username, {
                loginTime: decoded.loginTime || new Date().toISOString(),
                scopes: existingScopes,
                technicalAccess,
                extraPayload: { refreshTime: new Date().toISOString() }
            });

            res.status(200).json({
                success: true,
                message: 'Token renovado exitosamente',
                data: {
                    token: newToken,
                    admin: admin.toSafeJSON(),
                    refreshTime: new Date().toISOString(),
                    technicalAccess
                }
            });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                // Para tokens expirados, permitir renovación si no ha pasado mucho tiempo
                const expiredDecoded = require('jsonwebtoken').decode(token);
                const expiredTime = new Date(expiredDecoded.exp * 1000);
                const now = new Date();
                const hoursSinceExpired = (now - expiredTime) / (1000 * 60 * 60);
                
                if (hoursSinceExpired <= 24) { // Permitir renovación hasta 24h después de expirar
                    const admin = await ServicioAdministracion.buscarPorNombreUsuario(expiredDecoded.username);
                    
                    if (admin && !admin.isLocked()) {
                        const scopes = Array.isArray(expiredDecoded.scopes) ? expiredDecoded.scopes : ['admin'];
                        const technicalAccess = expiredDecoded.technicalAccess === true || scopes.includes('technical');

                        const newToken = ServicioAdministracion.crearTokenSesion(admin.username, {
                            loginTime: expiredDecoded.loginTime || new Date().toISOString(),
                            scopes,
                            technicalAccess,
                            extraPayload: { refreshTime: new Date().toISOString() }
                        });

                        return res.status(200).json({
                            success: true,
                            message: 'Token renovado después de expiración',
                            data: {
                                token: newToken,
                                admin: admin.toSafeJSON(),
                                refreshTime: new Date().toISOString(),
                                technicalAccess
                            }
                        });
                    }
                }
            }
            
            res.status(401).json({
                success: false,
                error: 'No se puede renovar el token',
                code: 'REFRESH_FAILED'
            });
        }
    });

    /**
     * Logout (invalidar token del lado del cliente)
     * POST /api/auth/logout
     */
    static cerrarSesion = manejadorAsincrono(async (req, res) => {
        console.log('👋 Logout de administrador');

        // En un sistema con JWT stateless, el logout se maneja del lado del cliente
        // Aquí podríamos agregar el token a una blacklist si fuera necesario
        
        res.status(200).json({
            success: true,
            message: 'Logout exitoso',
            data: {
                logoutTime: new Date().toISOString()
            }
        });
    });

    /**
     * Habilitar acceso técnico adicional para la sesión actual
     * POST /api/auth/tech-access
     */
    static habilitarAccesoTecnico = manejadorAsincrono(async (req, res) => {
        console.log('🛠️ Solicitud de acceso técnico adicional');

        const { technicalPassword, techPassword, password } = req.body || {};
        const contrasenaTecnica = technicalPassword || techPassword || password;

        await ServicioAccesoTecnico.verificarContrasena(contrasenaTecnica);

        const username = req.admin?.username;
        if (!username) {
            throw new ErrorAplicacion('Sesión inválida', 401, 'INVALID_SESSION');
        }

        const admin = await ServicioAdministracion.buscarPorNombreUsuario(username);
        if (!admin) {
            throw new ErrorAplicacion('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
        }

        const scopes = Array.isArray(req.admin?.scopes) ? req.admin.scopes : ['admin'];
        const loginTime = req.admin?.loginTime || new Date().toISOString();

        const token = ServicioAdministracion.crearTokenSesion(admin.username, {
            loginTime,
            scopes: [...scopes, 'technical'],
            technicalAccess: true
        });

        res.status(200).json({
            success: true,
            message: 'Acceso técnico habilitado',
            data: {
                token,
                admin: admin.toSafeJSON(),
                technicalAccess: true,
                expiresIn: config.JWT_EXPIRES_IN
            }
        });
    });

    /**
     * Cambiar contraseña con verificación de autenticación
     * POST /api/auth/change-password
     */
    static cambiarContrasena = manejadorAsincrono(async (req, res) => {
        console.log('🔐 Cambio de contraseña vía auth');
        
        const { currentPassword, newPassword } = req.body;
        
        // El middleware de auth ya verificó el token y añadió req.admin
        const username = req.admin.username;
        
        const result = await ServicioAdministracion.cambiarContrasena(username, currentPassword, newPassword);
        
        res.status(200).json({
            success: true,
            message: result.message,
            data: {
                timestamp: result.timestamp,
                // Sugerir re-login después de cambio de contraseña
                shouldReLogin: true
            }
        });
    });

    /**
     * Obtener información de la sesión actual
     * GET /api/auth/session
     */
    static obtenerSesion = manejadorAsincrono(async (req, res) => {
        console.log('📋 Información de sesión');
        
        const username = req.admin.username;
        const admin = await ServicioAdministracion.buscarPorNombreUsuario(username);
        
        if (!admin) {
            return res.status(401).json({
                success: false,
                error: 'Sesión inválida'
            });
        }
        
        // Obtener información del token desde el header
        const authHeader = req.headers.authorization;
        const token = authHeader.split(' ')[1];
        const decoded = verificarToken(token);

        const hasTechnicalAccess = decoded.technicalAccess === true ||
            (Array.isArray(decoded.scopes) && decoded.scopes.includes('technical'));

        const sessionInfo = {
            admin: admin.toSafeJSON(),
            session: {
                loginTime: decoded.loginTime || new Date(decoded.iat * 1000).toISOString(),
                issuedAt: new Date(decoded.iat * 1000).toISOString(),
                expiresAt: new Date(decoded.exp * 1000).toISOString(),
                timeRemaining: decoded.exp - Math.floor(Date.now() / 1000),
                isNearExpiry: (decoded.exp - Math.floor(Date.now() / 1000)) < 3600, // Menos de 1 hora
                scopes: decoded.scopes || ['admin'],
                technicalAccess: hasTechnicalAccess
            },
            permissions: {
                canManageStudents: hasTechnicalAccess,
                canViewAttendance: true,
                canManageSystem: hasTechnicalAccess,
                canExportData: hasTechnicalAccess,
                technicalAccess: hasTechnicalAccess
            }
        };

        res.status(200).json({
            success: true,
            data: sessionInfo
        });
    });

    /**
     * Validar fuerza de contraseña
     * POST /api/auth/validate-password
     */
    static validarContrasena = manejadorAsincrono(async (req, res) => {
        console.log('🔍 Validación de contraseña');
        
        const { password } = req.body;
        
        if (!password) {
            return res.status(400).json({
                success: false,
                error: 'Contraseña es requerida'
            });
        }
        
        const Administrador = require('../models/Administrador');
        const validation = Administrador.validatePasswordStrength(password);
        
        res.status(200).json({
            success: true,
            data: {
                isStrong: validation.isStrong,
                errors: validation.errors,
                suggestions: [
                    'Use al menos 8 caracteres',
                    'Incluya mayúsculas y minúsculas',
                    'Incluya números',
                    'Incluya caracteres especiales (!@#$%^&*)',
                    'Evite información personal'
                ]
            }
        });
    });

    /**
     * Obtener intentos de login fallidos
     * GET /api/auth/login-attempts
     */
    static obtenerIntentosInicioSesion = manejadorAsincrono(async (req, res) => {
        console.log('🔍 Consulta de intentos de login');
        
        const username = req.admin.username;
        const admin = await ServicioAdministracion.buscarPorNombreUsuario(username);
        
        if (!admin) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no válido'
            });
        }
        
        const attemptsInfo = {
            username: admin.username,
            failedAttempts: admin.loginAttempts,
            isLocked: admin.isLocked(),
            lockTimeRemaining: admin.isLocked() ? admin.getLockTimeRemaining() : 0,
            lastLogin: admin.lastLogin,
            maxAttempts: require('../config/server').SECURITY.MAX_LOGIN_ATTEMPTS,
            lockoutDuration: require('../config/server').SECURITY.LOCKOUT_TIME / 1000 / 60 // minutos
        };
        
        res.status(200).json({
            success: true,
            data: attemptsInfo
        });
    });
}

module.exports = ControladorAutenticacion;