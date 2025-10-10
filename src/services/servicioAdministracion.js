const Administrador = require('../models/Administrador');
const servicioBaseDatos = require('./servicioBaseDatos');
const config = require('../config/server');
const { AppError } = require('../middleware/errorHandler');
const { generateToken } = require('../middleware/auth');

class ServicioAdministracion {
    static mapRowToAdmin(row) {
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

    static async getAllAdmins() {
        try {
            const rows = await servicioBaseDatos.all(
                `SELECT username, password, created_at, updated_at, last_login, login_attempts, lock_until
                 FROM admins
                 ORDER BY username`
            );

            const admins = rows.map(row => this.mapRowToAdmin(row));
            console.log(`👥 Cargados ${admins.length} administradores desde la base de datos`);
            return admins;
        } catch (error) {
            console.error('❌ Error obteniendo administradores:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al obtener administradores', 500, 'ADMINS_LOAD_ERROR');
        }
    }

    static async findByUsername(username) {
        try {
            if (!username) {
                throw new AppError('Username es requerido', 400, 'MISSING_USERNAME');
            }

            const normalizedUsername = new Administrador({ username }).username;
            const row = await servicioBaseDatos.get(
                `SELECT username, password, created_at, updated_at, last_login, login_attempts, lock_until
                 FROM admins
                 WHERE username = $1`,
                [normalizedUsername]
            );

            if (!row) {
                console.log(`⚠️ Administrador no encontrado en base de datos: ${normalizedUsername}`);
                return null;
            }

            const admin = this.mapRowToAdmin(row);
            console.log(`✅ Administrador encontrado: ${admin.username}`);
            return admin;
        } catch (error) {
            console.error('❌ Error buscando administrador:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al buscar administrador', 500, 'ADMIN_SEARCH_ERROR');
        }
    }

    static async authenticate(username, password) {
        try {
            if (!username || !password) {
                throw new AppError(
                    config.MESSAGES.ERROR.INVALID_CREDENTIALS,
                    401,
                    'MISSING_CREDENTIALS'
                );
            }

            const admin = await this.findByUsername(username);

            if (!admin) {
                console.log(`⚠️ Intento de login con usuario inexistente: ${username}`);
                throw new AppError(
                    config.MESSAGES.ERROR.INVALID_CREDENTIALS,
                    401,
                    'USER_NOT_FOUND'
                );
            }

            if (admin.isLocked()) {
                const timeRemaining = Math.ceil(admin.getLockTimeRemaining() / 1000 / 60);
                throw new AppError(
                    `Cuenta bloqueada. Intente nuevamente en ${timeRemaining} minutos.`,
                    423,
                    'ACCOUNT_LOCKED'
                );
            }

            const isValidPassword = await admin.verifyPassword(password);

            if (!isValidPassword) {
                console.log(`⚠️ Contraseña incorrecta para: ${username}`);

                admin.recordFailedLogin();
                await this.persistAdminState(admin);

                throw new AppError(
                    config.MESSAGES.ERROR.INVALID_CREDENTIALS,
                    401,
                    'INVALID_PASSWORD'
                );
            }

            admin.recordSuccessfulLogin();
            await this.persistAdminState(admin);

            const token = generateToken({
                username: admin.username,
                loginTime: new Date().toISOString()
            });

            console.log(`✅ Login exitoso para: ${username}`);

            return {
                success: true,
                token,
                admin: admin.toSafeJSON(),
                expiresIn: config.JWT_EXPIRES_IN
            };
        } catch (error) {
            console.error('❌ Error en autenticación:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error en proceso de autenticación', 500, 'AUTHENTICATION_ERROR');
        }
    }

    static async changePassword(username, currentPassword, newPassword) {
        try {
            if (!username || !currentPassword || !newPassword) {
                throw new AppError('Username, contraseña actual y nueva son requeridos', 400, 'MISSING_PARAMETERS');
            }

            const passwordValidation = Administrador.validatePasswordStrength(newPassword);
            if (!passwordValidation.isStrong && config.NODE_ENV === 'production') {
                throw new AppError(
                    `Contraseña no cumple requisitos de seguridad: ${passwordValidation.errors.join(', ')}`,
                    400,
                    'WEAK_PASSWORD'
                );
            }

            if (newPassword.length < config.VALIDATION.MIN_PASSWORD_LENGTH) {
                throw new AppError(
                    `La contraseña debe tener al menos ${config.VALIDATION.MIN_PASSWORD_LENGTH} caracteres`,
                    400,
                    'PASSWORD_TOO_SHORT'
                );
            }

            const admin = await this.findByUsername(username);
            if (!admin) {
                throw new AppError('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
            }

            const isValidCurrentPassword = await admin.verifyPassword(currentPassword);
            if (!isValidCurrentPassword) {
                console.log(`⚠️ Contraseña actual incorrecta para: ${username}`);
                throw new AppError('Contraseña actual incorrecta', 401, 'INVALID_CURRENT_PASSWORD');
            }

            const isSamePassword = await admin.verifyPassword(newPassword);
            if (isSamePassword) {
                throw new AppError('La nueva contraseña debe ser diferente a la actual', 400, 'SAME_PASSWORD');
            }

            await admin.hashPassword(newPassword);
            await this.persistAdminState(admin);

            console.log(`✅ Contraseña cambiada exitosamente para: ${username}`);

            return {
                success: true,
                message: config.MESSAGES.SUCCESS.PASSWORD_CHANGED,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error en cambio de contraseña:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error en cambio de contraseña', 500, 'PASSWORD_CHANGE_ERROR');
        }
    }

    static async createAdmin(adminData) {
        try {
            const admin = new Administrador(adminData);
            const validation = admin.isValid();

            if (!validation.isValid) {
                throw new AppError(`Datos de administrador inválidos: ${validation.errors.join(', ')}`, 400, 'INVALID_ADMIN_DATA');
            }

            const existing = await this.findByUsername(admin.username);
            if (existing) {
                throw new AppError('Ya existe un administrador con ese username', 409, 'ADMIN_ALREADY_EXISTS');
            }

            if (adminData.plainPassword) {
                await admin.hashPassword(adminData.plainPassword);
            }

            await servicioBaseDatos.run(
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
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al crear administrador', 500, 'ADMIN_CREATE_ERROR');
        }
    }

    static async updateAdmin(username, updateData) {
        try {
            const existingAdmin = await this.findByUsername(username);
            if (!existingAdmin) {
                throw new AppError('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
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

            const result = await servicioBaseDatos.run(
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
                throw new AppError('No se pudo actualizar el administrador', 500, 'UPDATE_FAILED');
            }

            console.log(`✅ Administrador actualizado: ${updatedAdmin.username}`);
            return updatedAdmin;
        } catch (error) {
            console.error('❌ Error actualizando administrador:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al actualizar administrador', 500, 'ADMIN_UPDATE_ERROR');
        }
    }

    static async deleteAdmin(username) {
        try {
            const admins = await this.getAllAdmins();
            if (admins.length <= 1) {
                throw new AppError(
                    'No se puede eliminar el último administrador del sistema',
                    400,
                    'CANNOT_DELETE_LAST_ADMIN'
                );
            }

            const existingAdmin = await this.findByUsername(username);
            if (!existingAdmin) {
                throw new AppError('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
            }

            const result = await servicioBaseDatos.run(
                'DELETE FROM admins WHERE username = $1',
                [existingAdmin.username]
            );

            if (result.rowCount === 0) {
                throw new AppError('No se pudo eliminar el administrador', 500, 'DELETE_FAILED');
            }

            console.log(`🗑️ Administrador eliminado: ${existingAdmin.username}`);
            return true;
        } catch (error) {
            console.error('❌ Error eliminando administrador:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al eliminar administrador', 500, 'ADMIN_DELETE_ERROR');
        }
    }

    static async persistAdminState(admin) {
        await servicioBaseDatos.run(
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

    static async unlockAdmin(username) {
        try {
            const admin = await this.findByUsername(username);
            if (!admin) {
                throw new AppError('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
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
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al desbloquear cuenta', 500, 'UNLOCK_ERROR');
        }
    }

    static async getAdminStats() {
        try {
            const admins = await this.getAllAdmins();

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
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al obtener estadísticas', 500, 'ADMIN_STATS_ERROR');
        }
    }

    static async resetPassword(username, newPassword) {
        try {
            const admin = await this.findByUsername(username);
            if (!admin) {
                throw new AppError('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
            }

            if (newPassword.length < config.VALIDATION.MIN_PASSWORD_LENGTH) {
                throw new AppError(
                    `La contraseña debe tener al menos ${config.VALIDATION.MIN_PASSWORD_LENGTH} caracteres`,
                    400,
                    'PASSWORD_TOO_SHORT'
                );
            }

            await admin.hashPassword(newPassword);
            admin.loginAttempts = 0;
            admin.lockUntil = null;
            await this.persistAdminState(admin);

            console.log(`🔄 Contraseña reseteada para: ${username}`);

            return {
                success: true,
                message: 'Contraseña reseteada exitosamente',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error reseteando contraseña:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al resetear contraseña', 500, 'PASSWORD_RESET_ERROR');
        }
    }
}

module.exports = ServicioAdministracion;
