const bcrypt = require('bcryptjs');
const config = require('../config/server');

/**
 * Modelo para representar un administrador
 */
class Admin {
    constructor(data) {
        this.username = this.normalizeUsername(data.username);
        this.password = data.password || '';
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
        this.lastLogin = data.lastLogin || null;
        this.loginAttempts = data.loginAttempts || 0;
        this.lockUntil = data.lockUntil || null;
    }

    /**
     * Normalizar nombre de usuario
     */
    normalizeUsername(username) {
        if (!username) return '';
        return username.toString().trim().toLowerCase();
    }

    /**
     * Validar si el admin es válido
     */
    isValid() {
        const errors = [];
        
        if (!this.username || this.username.length === 0) {
            errors.push('Nombre de usuario es requerido');
        }
        
        if (this.username.length < 3) {
            errors.push('Nombre de usuario debe tener al menos 3 caracteres');
        }
        
        if (!this.password || this.password.length === 0) {
            errors.push('Contraseña es requerida');
        }
        
        // Validar formato de username (solo letras, números y algunos caracteres especiales)
        const usernameRegex = /^[a-zA-Z0-9._-]+$/;
        if (this.username && !usernameRegex.test(this.username)) {
            errors.push('Formato de nombre de usuario inválido');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Hashear contraseña
     */
    async hashPassword(plainPassword) {
        this.password = await bcrypt.hash(plainPassword, config.SECURITY.BCRYPT_ROUNDS);
        this.updatedAt = new Date().toISOString();
        return this.password;
    }

    /**
     * Verificar contraseña
     */
    async verifyPassword(plainPassword) {
        return await bcrypt.compare(plainPassword, this.password);
    }

    /**
     * Verificar si la cuenta está bloqueada
     */
    isLocked() {
        return this.lockUntil && new Date() < new Date(this.lockUntil);
    }

    /**
     * Registrar intento de login fallido
     */
    recordFailedLogin() {
        this.loginAttempts = (this.loginAttempts || 0) + 1;
        
        if (this.loginAttempts >= config.SECURITY.MAX_LOGIN_ATTEMPTS) {
            this.lockUntil = new Date(Date.now() + config.SECURITY.LOCKOUT_TIME).toISOString();
        }
        
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Registrar login exitoso
     */
    recordSuccessfulLogin() {
        this.loginAttempts = 0;
        this.lockUntil = null;
        this.lastLogin = new Date().toISOString();
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Obtener tiempo restante de bloqueo
     */
    getLockTimeRemaining() {
        if (!this.isLocked()) return 0;
        
        const lockTime = new Date(this.lockUntil);
        const now = new Date();
        return Math.max(0, lockTime.getTime() - now.getTime());
    }

    /**
     * Convertir a objeto plano para CSV
     */
    toCSV() {
        return {
            username: this.username,
            password: this.password
        };
    }

    /**
     * Convertir a objeto JSON (sin contraseña)
     */
    toJSON() {
        return {
            username: this.username,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            lastLogin: this.lastLogin,
            isLocked: this.isLocked(),
            lockTimeRemaining: this.getLockTimeRemaining()
        };
    }

    /**
     * Convertir a objeto JSON seguro (para respuestas de API)
     */
    toSafeJSON() {
        return {
            username: this.username,
            lastLogin: this.lastLogin
        };
    }

    /**
     * Crear admin desde datos de CSV
     */
    static fromCSV(csvData) {
        return new Admin({
            username: csvData.username || '',
            password: csvData.password || ''
        });
    }

    /**
     * Crear múltiples admins desde array de CSV
     */
    static fromCSVArray(csvArray) {
        return csvArray
            .map(data => Admin.fromCSV(data))
            .filter(admin => {
                const validation = admin.isValid();
                return validation.isValid;
            });
    }

    /**
     * Buscar admin por username
     */
    static findByUsername(admins, username) {
        const normalizedUsername = new Admin({ username }).username;
        return admins.find(admin => admin.username === normalizedUsername);
    }

    /**
     * Crear admin por defecto
     */
    static async createDefault() {
        const admin = new Admin({
            username: 'admin',
            createdAt: new Date().toISOString()
        });
        
        await admin.hashPassword('admin123');
        return admin;
    }

    /**
     * Validar fuerza de contraseña
     */
    static validatePasswordStrength(password) {
        const errors = [];
        
        if (password.length < config.VALIDATION.MIN_PASSWORD_LENGTH) {
            errors.push(`Debe tener al menos ${config.VALIDATION.MIN_PASSWORD_LENGTH} caracteres`);
        }
        
        if (!/[A-Z]/.test(password)) {
            errors.push('Debe contener al menos una letra mayúscula');
        }
        
        if (!/[a-z]/.test(password)) {
            errors.push('Debe contener al menos una letra minúscula');
        }
        
        if (!/[0-9]/.test(password)) {
            errors.push('Debe contener al menos un número');
        }
        
        // Para contraseñas más seguras en producción
        if (config.NODE_ENV === 'production') {
            if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
                errors.push('Debe contener al menos un carácter especial');
            }
            
            if (password.length < 8) {
                errors.push('Debe tener al menos 8 caracteres en producción');
            }
        }
        
        return {
            isStrong: errors.length === 0,
            errors
        };
    }
}

module.exports = Admin;