const Administrador = require('../models/Administrador');
const servicioBaseDatos = require('./servicioBaseDatos');
const config = require('../config/server');
const { ErrorAplicacion } = require('../middleware/manejadorErrores');
const { generarToken } = require('../middleware/autenticacion');

class ServicioAdministracion {
    static mapearFilaAdministrador(row) {
        if (!row) {
            return null;
        }

        return new Administrador({
            username: row.username,
            password: row.password,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastLogin: row.last_login,
            loginAttempts: row.login_attempts,
            lockUntil: row.lock_until
        });
    }

    static async obtenerTodosLosAdministradores() {
        try {
            const rows = await servicioBaseDatos.obtenerTodos(
                `SELECT username, password, created_at, updated_at, last_login, login_attempts, lock_until
                 FROM admins
                 ORDER BY username`
            );

            const admins = rows.map(row => this.mapearFilaAdministrador(row));
            console.log(`👥 Cargados ${admins.length} administradores desde la base de datos`);
            return admins;
        } catch (error) {
            console.error('❌ Error obteniendo administradores:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al obtener administradores', 500, 'ADMINS_LOAD_ERROR');
        }
    }

    static async buscarPorNombreUsuario(username) {
        try {
            if (!username) {
                throw new ErrorAplicacion('Username es requerido', 400, 'MISSING_USERNAME');
            }

            const normalizedUsername = new Administrador({ username }).username;
            const row = await servicioBaseDatos.obtenerUno(
                `SELECT username, password, created_at, updated_at, last_login, login_attempts, lock_until
                 FROM admins
                 WHERE username = $1`,
                [normalizedUsername]
            );

            if (!row) {
                console.log(`⚠️ Administrador no encontrado en base de datos: ${normalizedUsername}`);
                return null;
            }

            const admin = this.mapearFilaAdministrador(row);
            console.log(`✅ Administrador encontrado: ${admin.username}`);
            return admin;
        } catch (error) {
            console.error('❌ Error buscando administrador:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al buscar administrador', 500, 'ADMIN_SEARCH_ERROR');
        }
    }

    static crearTokenSesion(username, opciones = {}) {
        if (!username) {
            throw new ErrorAplicacion('Username es requerido', 400, 'MISSING_USERNAME');
        }

        const scopes = new Set(Array.isArray(opciones.scopes) ? opciones.scopes.filter(Boolean) : []);
        scopes.add('admin');

        if (opciones.technicalAccess) {
            scopes.add('technical');
        }

        const payload = {
            username,
            loginTime: opciones.loginTime || new Date().toISOString(),
            scopes: Array.from(scopes),
            technicalAccess: scopes.has('technical')
        };

        if (opciones.extraPayload && typeof opciones.extraPayload === 'object') {
            Object.assign(payload, opciones.extraPayload);
        }

        return generarToken(payload);
    }

    static async autenticar(username, password) {
        try {
            if (!username || !password) {
                throw new ErrorAplicacion(
                    config.MESSAGES.ERROR.INVALID_CREDENTIALS,
                    401,
                    'MISSING_CREDENTIALS'
                );
            }

            const admin = await this.buscarPorNombreUsuario(username);

            if (!admin) {
                console.log(`⚠️ Intento de login con usuario inexistente: ${username}`);
                throw new ErrorAplicacion(
                    config.MESSAGES.ERROR.INVALID_CREDENTIALS,
                    401,
                    'USER_NOT_FOUND'
                );
            }

            if (admin.isLocked()) {
                const timeRemaining = Math.ceil(admin.getLockTimeRemaining() / 1000 / 60);
                throw new ErrorAplicacion(
                    `Cuenta bloqueada. Intente nuevamente en ${timeRemaining} minutos.`,
                    423,
                    'ACCOUNT_LOCKED'
                );
            }

            const isValidPassword = await admin.verifyPassword(password);

            if (!isValidPassword) {
                console.log(`⚠️ Contraseña incorrecta para: ${username}`);

                admin.recordFailedLogin();
                await this.persistirEstadoAdministrador(admin);

                throw new ErrorAplicacion(
                    config.MESSAGES.ERROR.INVALID_CREDENTIALS,
                    401,
                    'INVALID_PASSWORD'
                );
            }

            admin.recordSuccessfulLogin();
            await this.persistirEstadoAdministrador(admin);

            const token = this.crearTokenSesion(admin.username, {
                loginTime: new Date().toISOString(),
                scopes: ['admin'],
                technicalAccess: false
            });

            console.log(`✅ Login exitoso para: ${username}`);

            return {
                success: true,
                token,
                admin: admin.toSafeJSON(),
                expiresIn: config.JWT_EXPIRES_IN,
                technicalAccess: false
            };
        } catch (error) {
            console.error('❌ Error en autenticación:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error en proceso de autenticación', 500, 'AUTHENTICATION_ERROR');
        }
    }

    static async cambiarContrasena(username, currentPassword, newPassword) {
        try {
            if (!username || !currentPassword || !newPassword) {
                throw new ErrorAplicacion('Username, contraseña actual y nueva son requeridos', 400, 'MISSING_PARAMETERS');
            }

            const passwordValidation = Administrador.validatePasswordStrength(newPassword);
            if (!passwordValidation.isStrong && config.NODE_ENV === 'production') {
                throw new ErrorAplicacion(
                    `Contraseña no cumple requisitos de seguridad: ${passwordValidation.errors.join(', ')}`,
                    400,
                    'WEAK_PASSWORD'
                );
            }

            if (newPassword.length < config.VALIDATION.MIN_PASSWORD_LENGTH) {
                throw new ErrorAplicacion(
                    `La contraseña debe tener al menos ${config.VALIDATION.MIN_PASSWORD_LENGTH} caracteres`,
                    400,
                    'PASSWORD_TOO_SHORT'
                );
            }

            const admin = await this.buscarPorNombreUsuario(username);
            if (!admin) {
                throw new ErrorAplicacion('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
            }

            const isValidCurrentPassword = await admin.verifyPassword(currentPassword);
            if (!isValidCurrentPassword) {
                console.log(`⚠️ Contraseña actual incorrecta para: ${username}`);
                throw new ErrorAplicacion('Contraseña actual incorrecta', 401, 'INVALID_CURRENT_PASSWORD');
            }

            const isSamePassword = await admin.verifyPassword(newPassword);
            if (isSamePassword) {
                throw new ErrorAplicacion('La nueva contraseña debe ser diferente a la actual', 400, 'SAME_PASSWORD');
            }

            await admin.hashPassword(newPassword);
            await this.persistirEstadoAdministrador(admin);

            console.log(`✅ Contraseña cambiada exitosamente para: ${username}`);

            return {
                success: true,
                message: config.MESSAGES.SUCCESS.PASSWORD_CHANGED,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error en cambio de contraseña:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error en cambio de contraseña', 500, 'PASSWORD_CHANGE_ERROR');
        }
    }

    static async crearAdministrador(adminData) {
        try {
            const admin = new Administrador(adminData);
            const validation = admin.isValid();

            if (!validation.isValid) {
                throw new ErrorAplicacion(`Datos de administrador inválidos: ${validation.errors.join(', ')}`, 400, 'INVALID_ADMIN_DATA');
            }

            const existing = await this.buscarPorNombreUsuario(admin.username);
            if (existing) {
                throw new ErrorAplicacion('Ya existe un administrador con ese username', 409, 'ADMIN_ALREADY_EXISTS');
            }

            if (adminData.plainPassword) {
                await admin.hashPassword(adminData.plainPassword);
            }

            await servicioBaseDatos.ejecutar(
                `INSERT INTO admins (username, password, created_at, updated_at, last_login, login_attempts, lock_until)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    admin.username,
                    admin.password,
                    admin.createdAt,
                    admin.updatedAt,
                    admin.lastLogin,
                    admin.loginAttempts,
                    admin.lockUntil
                ]
            );

            console.log(`✅ Administrador creado: ${admin.username}`);
            return admin.toSafeJSON();
        } catch (error) {
            console.error('❌ Error creando administrador:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al crear administrador', 500, 'ADMIN_CREATE_ERROR');
        }
    }

    static async actualizarAdministrador(username, updateData) {
        try {
            const existingAdmin = await this.buscarPorNombreUsuario(username);
            if (!existingAdmin) {
                throw new ErrorAplicacion('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
            }

            const mergedData = {
                username: existingAdmin.username,
                password: typeof updateData.password !== 'undefined' ? updateData.password : existingAdmin.password,
                createdAt: existingAdmin.createdAt,
                updatedAt: updateData.updatedAt || new Date().toISOString(),
                lastLogin: typeof updateData.lastLogin !== 'undefined' ? updateData.lastLogin : existingAdmin.lastLogin,
                loginAttempts: typeof updateData.loginAttempts !== 'undefined' ? updateData.loginAttempts : existingAdmin.loginAttempts,
                lockUntil: typeof updateData.lockUntil !== 'undefined' ? updateData.lockUntil : existingAdmin.lockUntil
            };

            const updatedAdmin = new Administrador(mergedData);

            const result = await servicioBaseDatos.ejecutar(
                `UPDATE admins
                 SET password = $1,
                     updated_at = $2,
                     last_login = $3,
                     login_attempts = $4,
                     lock_until = $5
                 WHERE username = $6`,
                [
                    updatedAdmin.password,
                    updatedAdmin.updatedAt,
                    updatedAdmin.lastLogin,
                    updatedAdmin.loginAttempts,
                    updatedAdmin.lockUntil,
                    updatedAdmin.username
                ]
            );

            if (result.rowCount === 0) {
                throw new ErrorAplicacion('No se pudo actualizar el administrador', 500, 'UPDATE_FAILED');
            }

            console.log(`✅ Administrador actualizado: ${updatedAdmin.username}`);
            return updatedAdmin;
        } catch (error) {
            console.error('❌ Error actualizando administrador:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al actualizar administrador', 500, 'ADMIN_UPDATE_ERROR');
        }
    }

    static async eliminarAdministrador(username) {
        try {
            const admins = await this.obtenerTodosLosAdministradores();
            if (admins.length <= 1) {
                throw new ErrorAplicacion(
                    'No se puede eliminar el último administrador del sistema',
                    400,
                    'CANNOT_DELETE_LAST_ADMIN'
                );
            }

            const existingAdmin = await this.buscarPorNombreUsuario(username);
            if (!existingAdmin) {
                throw new ErrorAplicacion('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
            }

            const result = await servicioBaseDatos.ejecutar(
                'DELETE FROM admins WHERE username = $1',
                [existingAdmin.username]
            );

            if (result.rowCount === 0) {
                throw new ErrorAplicacion('No se pudo eliminar el administrador', 500, 'DELETE_FAILED');
            }

            console.log(`🗑️ Administrador eliminado: ${existingAdmin.username}`);
            return true;
        } catch (error) {
            console.error('❌ Error eliminando administrador:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al eliminar administrador', 500, 'ADMIN_DELETE_ERROR');
        }
    }

    static async persistirEstadoAdministrador(admin) {
        await servicioBaseDatos.ejecutar(
            `UPDATE admins
             SET password = $1,
                 updated_at = $2,
                 last_login = $3,
                 login_attempts = $4,
                 lock_until = $5
             WHERE username = $6`,
            [
                admin.password,
                admin.updatedAt,
                admin.lastLogin,
                admin.loginAttempts,
                admin.lockUntil,
                admin.username
            ]
        );
    }

    static async desbloquearAdministrador(username) {
        try {
            const admin = await this.buscarPorNombreUsuario(username);
            if (!admin) {
                throw new ErrorAplicacion('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
            }

            if (!admin.isLocked()) {
                return {
                    success: true,
                    message: 'La cuenta no está bloqueada',
                    wasLocked: false
                };
            }

            admin.loginAttempts = 0;
            admin.lockUntil = null;
            admin.updatedAt = new Date().toISOString();
            await this.persistAdminState(admin);

            console.log(`🔓 Cuenta desbloqueada: ${username}`);

            return {
                success: true,
                message: 'Cuenta desbloqueada exitosamente',
                wasLocked: true
            };
        } catch (error) {
            console.error('❌ Error desbloqueando cuenta:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al desbloquear cuenta', 500, 'UNLOCK_ERROR');
        }
    }

    static async obtenerEstadisticasAdministradores() {
        try {
            const admins = await this.obtenerTodosLosAdministradores();

            if (admins.length === 0) {
                return {
                    totalAdmins: 0,
                    lockedAccounts: 0,
                    recentLogins: 0,
                    accountsWithFailedAttempts: 0,
                    oldestAccount: null,
                    newestAccount: null,
                    storage: {
                        database: config.DATABASE.SUMMARY
                    },
                    timestamp: new Date().toISOString()
                };
            }

            const stats = {
                totalAdmins: admins.length,
                lockedAccounts: admins.filter(admin => admin.isLocked()).length,
                recentLogins: admins.filter(admin => {
                    if (!admin.lastLogin) return false;
                    const lastLogin = new Date(admin.lastLogin);
                    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    return lastLogin > oneDayAgo;
                }).length,
                accountsWithFailedAttempts: admins.filter(admin => admin.loginAttempts > 0).length,
                oldestAccount: admins.reduce((oldest, admin) => {
                    if (!oldest) return admin;
                    const adminCreated = new Date(admin.createdAt);
                    const oldestCreated = new Date(oldest.createdAt);
                    return adminCreated < oldestCreated ? admin : oldest;
                }, null),
                newestAccount: admins.reduce((newest, admin) => {
                    if (!newest) return admin;
                    const adminCreated = new Date(admin.createdAt);
                    const newestCreated = new Date(newest.createdAt);
                    return adminCreated > newestCreated ? admin : newest;
                }, null),
                storage: {
                    database: config.DATABASE.SUMMARY
                },
                timestamp: new Date().toISOString()
            };

            return stats;
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas de administradores:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al obtener estadísticas', 500, 'ADMIN_STATS_ERROR');
        }
    }

    static async restablecerContrasena(username, newPassword) {
        try {
            const admin = await this.buscarPorNombreUsuario(username);
            if (!admin) {
                throw new ErrorAplicacion('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
            }

            if (newPassword.length < config.VALIDATION.MIN_PASSWORD_LENGTH) {
                throw new ErrorAplicacion(
                    `La contraseña debe tener al menos ${config.VALIDATION.MIN_PASSWORD_LENGTH} caracteres`,
                    400,
                    'PASSWORD_TOO_SHORT'
                );
            }

            await admin.hashPassword(newPassword);
            admin.loginAttempts = 0;
            admin.lockUntil = null;
            await this.persistirEstadoAdministrador(admin);

            console.log(`🔄 Contraseña reseteada para: ${username}`);

            return {
                success: true,
                message: 'Contraseña reseteada exitosamente',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error reseteando contraseña:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al resetear contraseña', 500, 'PASSWORD_RESET_ERROR');
        }
    }
}

module.exports = ServicioAdministracion;
