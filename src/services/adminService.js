const Admin = require('../models/Admin');
const CSVService = require('./csvService');
const config = require('../config/server');
const { AppError } = require('../middleware/errorHandler');
const { generateToken } = require('../middleware/auth');

class AdminService {
    /**
     * Obtener todos los administradores
     */
    static async getAllAdmins() {
        try {
            const csvData = await CSVService.readCSV(config.FILES.ADMIN);
            const admins = Admin.fromCSVArray(csvData);
            
            console.log(`👥 Cargados ${admins.length} administradores`);
            return admins;
        } catch (error) {
            console.error('❌ Error obteniendo administradores:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al obtener administradores', 500, 'ADMINS_LOAD_ERROR');
        }
    }

    /**
     * Buscar administrador por username
     */
    static async findByUsername(username) {
        try {
            if (!username) {
                throw new AppError('Username es requerido', 400, 'MISSING_USERNAME');
            }

            const admins = await this.getAllAdmins();
            const admin = Admin.findByUsername(admins, username);
            
            if (!admin) {
                console.log(`⚠️ Administrador no encontrado: ${username}`);
                return null;
            }

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

    /**
     * Autenticar administrador
     */
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

            // Verificar si la cuenta está bloqueada
            if (admin.isLocked()) {
                const timeRemaining = Math.ceil(admin.getLockTimeRemaining() / 1000 / 60);
                throw new AppError(
                    `Cuenta bloqueada. Intente nuevamente en ${timeRemaining} minutos.`, 
                    423, 
                    'ACCOUNT_LOCKED'
                );
            }

            // Verificar contraseña
            const isValidPassword = await admin.verifyPassword(password);
            
            if (!isValidPassword) {
                console.log(`⚠️ Contraseña incorrecta para: ${username}`);
                
                // Registrar intento fallido
                admin.recordFailedLogin();
                await this.updateAdmin(admin.username, {
                    loginAttempts: admin.loginAttempts,
                    lockUntil: admin.lockUntil,
                    updatedAt: admin.updatedAt
                });

                throw new AppError(
                    config.MESSAGES.ERROR.INVALID_CREDENTIALS, 
                    401, 
                    'INVALID_PASSWORD'
                );
            }

            // Login exitoso
            admin.recordSuccessfulLogin();
            await this.updateAdmin(admin.username, {
                loginAttempts: admin.loginAttempts,
                lockUntil: admin.lockUntil,
                lastLogin: admin.lastLogin,
                updatedAt: admin.updatedAt
            });

            // Generar token JWT
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

    /**
     * Cambiar contraseña de administrador
     */
    static async changePassword(username, currentPassword, newPassword) {
        try {
            if (!username || !currentPassword || !newPassword) {
                throw new AppError('Username, contraseña actual y nueva son requeridos', 400, 'MISSING_PARAMETERS');
            }

            // Validar fuerza de la nueva contraseña
            const passwordValidation = Admin.validatePasswordStrength(newPassword);
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

            // Verificar contraseña actual
            const isValidCurrentPassword = await admin.verifyPassword(currentPassword);
            if (!isValidCurrentPassword) {
                console.log(`⚠️ Contraseña actual incorrecta para: ${username}`);
                throw new AppError('Contraseña actual incorrecta', 401, 'INVALID_CURRENT_PASSWORD');
            }

            // Verificar que la nueva contraseña sea diferente
            const isSamePassword = await admin.verifyPassword(newPassword);
            if (isSamePassword) {
                throw new AppError('La nueva contraseña debe ser diferente a la actual', 400, 'SAME_PASSWORD');
            }

            // Cambiar contraseña
            await admin.hashPassword(newPassword);
            
            // Actualizar en archivo
            const success = await this.updateAdmin(admin.username, {
                password: admin.password,
                updatedAt: admin.updatedAt
            });

            if (!success) {
                throw new AppError('No se pudo actualizar la contraseña', 500, 'UPDATE_FAILED');
            }

            console.log(`✅ Contraseña cambiada exitosamente para: ${username}`);
            
            return {
                success: true,
                message: config.MESSAGES.SUCCESS.PASSWORD_CHANGED,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error cambiando contraseña:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al cambiar contraseña', 500, 'PASSWORD_CHANGE_ERROR');
        }
    }

    /**
     * Crear nuevo administrador
     */
    static async createAdmin(adminData) {
        try {
            const admin = new Admin(adminData);
            const validation = admin.isValid();
            
            if (!validation.isValid) {
                throw new AppError(
                    `Datos de administrador inválidos: ${validation.errors.join(', ')}`,
                    400,
                    'INVALID_ADMIN_DATA'
                );
            }

            // Verificar que no exista ya
            const existingAdmin = await this.findByUsername(admin.username);
            if (existingAdmin) {
                throw new AppError(
                    `Ya existe un administrador con username ${admin.username}`,
                    409,
                    'ADMIN_ALREADY_EXISTS'
                );
            }

            // Hashear contraseña si se proporciona en texto plano
            if (adminData.plainPassword) {
                await admin.hashPassword(adminData.plainPassword);
            } else if (!admin.password) {
                throw new AppError('Contraseña es requerida', 400, 'MISSING_PASSWORD');
            }

            // Agregar al archivo CSV
            await CSVService.appendToCSV(
                config.FILES.ADMIN, 
                admin.toCSV(), 
                config.CSV_HEADERS.ADMIN
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

    /**
     * Actualizar datos de administrador
     */
    static async updateAdmin(username, updateData) {
        try {
            const existingAdmin = await this.findByUsername(username);
            if (!existingAdmin) {
                throw new AppError('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
            }

            // Combinar datos preservando contraseña y campos críticos
            const mergedData = {
                username: existingAdmin.username,
                password: existingAdmin.password,
                createdAt: existingAdmin.createdAt,
                updatedAt: new Date().toISOString(),
                lastLogin: existingAdmin.lastLogin,
                loginAttempts: existingAdmin.loginAttempts,
                lockUntil: existingAdmin.lockUntil,
                ...updateData
            };

            // Asegurar que la contraseña solo se sobrescriba cuando se envía explícitamente
            if (!updateData || typeof updateData.password === 'undefined') {
                mergedData.password = existingAdmin.password;
            }

            // Crear admin actualizado
            const updatedAdmin = new Admin(mergedData);

            // Actualizar en CSV
            const updated = await CSVService.updateInCSV(
                config.FILES.ADMIN,
                { username: existingAdmin.username },
                updatedAdmin.toCSV(),
                config.CSV_HEADERS.ADMIN
            );

            if (!updated) {
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

    /**
     * Eliminar administrador
     */
    static async deleteAdmin(username) {
        try {
            // Verificar que no sea el último administrador
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

            // Eliminar del CSV
            const deletedCount = await CSVService.deleteFromCSV(
                config.FILES.ADMIN,
                { username: existingAdmin.username },
                config.CSV_HEADERS.ADMIN
            );

            if (deletedCount === 0) {
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

    /**
     * Desbloquear cuenta de administrador
     */
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

            // Desbloquear cuenta
            const success = await this.updateAdmin(username, {
                loginAttempts: 0,
                lockUntil: null
            });

            if (!success) {
                throw new AppError('No se pudo desbloquear la cuenta', 500, 'UNLOCK_FAILED');
            }

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

    /**
     * Obtener estadísticas de administradores
     */
    static async getAdminStats() {
        try {
            const admins = await this.getAllAdmins();
            
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
                    const adminCreated = new Date(admin.createdAt);
                    const oldestCreated = new Date(oldest.createdAt);
                    return adminCreated < oldestCreated ? admin : oldest;
                }, admins[0]),
                newestAccount: admins.reduce((newest, admin) => {
                    const adminCreated = new Date(admin.createdAt);
                    const newestCreated = new Date(newest.createdAt);
                    return adminCreated > newestCreated ? admin : newest;
                }, admins[0])
            };

            // Información adicional del archivo
            const fileStats = await CSVService.getCSVStats(config.FILES.ADMIN);
            
            return {
                ...stats,
                fileInfo: {
                    lastModified: fileStats.lastModified,
                    fileSize: fileStats.fileSize
                },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas de administradores:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al obtener estadísticas', 500, 'ADMIN_STATS_ERROR');
        }
    }

    /**
     * Resetear contraseña de administrador (para recovery)
     */
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

            // Hashear nueva contraseña
            await admin.hashPassword(newPassword);
            
            // Resetear intentos de login y desbloquear
            const success = await this.updateAdmin(username, {
                password: admin.password,
                loginAttempts: 0,
                lockUntil: null,
                updatedAt: admin.updatedAt
            });

            if (!success) {
                throw new AppError('No se pudo resetear la contraseña', 500, 'RESET_FAILED');
            }

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

module.exports = AdminService;