const config = require('../config/server');
const Administrador = require('../models/Administrador');

const VALIDATION_CODES = {
    MISSING_FIELD: 'MISSING_FIELD',
    INVALID_FORMAT: 'INVALID_FORMAT',
    INVALID_VALUE: 'INVALID_VALUE',
    WEAK_PASSWORD: 'WEAK_PASSWORD',
    INVALID_LIST: 'INVALID_LIST'
};

const sanitizeString = (value) => {
    if (typeof value !== 'string') {
        value = value == null ? '' : String(value);
    }

    return value
        .replace(/<script.*?>.*?<\/script>/gi, '')
        .replace(/[<>]/g, '')
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim();
};

const sanitizeValue = (value) => {
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }

    if (value && typeof value === 'object' && value.constructor === Object) {
        const sanitized = {};
        for (const key of Object.keys(value)) {
            sanitized[key] = sanitizeValue(value[key]);
        }
        return sanitized;
    }

    if (typeof value === 'string' || typeof value === 'number') {
        return sanitizeString(value);
    }

    return value;
};

const sanitizeInput = (req, res, next) => {
    try {
        if (req.body && typeof req.body === 'object') {
            req.body = sanitizeValue(req.body);
        }

        if (req.query && typeof req.query === 'object') {
            req.query = sanitizeValue(req.query);
        }

        if (req.params && typeof req.params === 'object') {
            req.params = sanitizeValue(req.params);
        }

        next();
    } catch (error) {
        console.error('❌ Error sanitizando entrada:', error);
        res.status(400).json({
            success: false,
            error: 'Entrada inválida',
            code: VALIDATION_CODES.INVALID_VALUE
        });
    }
};

const sendValidationError = (res, message, code = VALIDATION_CODES.INVALID_VALUE, status = 400, details = {}) => {
    return res.status(status).json({
        success: false,
        error: message,
        code,
        ...Object.keys(details).length ? { details } : {}
    });
};

const validateAttendance = (req, res, next) => {
    const { matricula } = req.body || {};

    if (!matricula) {
        return sendValidationError(res, 'Matrícula es requerida', VALIDATION_CODES.MISSING_FIELD);
    }

    const normalized = sanitizeString(matricula).toUpperCase().replace(/[\s\-]/g, '');

    if (!/^[A-Z0-9]+$/.test(normalized)) {
        return sendValidationError(res, 'Formato de matrícula inválido', VALIDATION_CODES.INVALID_FORMAT);
    }

    if (normalized.length < 3 || normalized.length > 20) {
        return sendValidationError(res, 'La matrícula debe tener entre 3 y 20 caracteres', VALIDATION_CODES.INVALID_VALUE);
    }

    req.body.matricula = normalized;
    next();
};

const validateAdminLogin = (req, res, next) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
        return sendValidationError(
            res,
            'Usuario y contraseña son requeridos',
            VALIDATION_CODES.MISSING_FIELD
        );
    }

    const normalizedUsername = sanitizeString(username).toLowerCase();

    if (normalizedUsername.length < 3) {
        return sendValidationError(res, 'El usuario debe tener al menos 3 caracteres', VALIDATION_CODES.INVALID_VALUE);
    }

    if (!/^[a-z0-9._-]+$/.test(normalizedUsername)) {
        return sendValidationError(res, 'Formato de usuario inválido', VALIDATION_CODES.INVALID_FORMAT);
    }

    const passwordStr = typeof password === 'string' ? password : String(password || '');

    if (passwordStr.length < config.VALIDATION.MIN_PASSWORD_LENGTH) {
        return sendValidationError(
            res,
            `La contraseña debe tener al menos ${config.VALIDATION.MIN_PASSWORD_LENGTH} caracteres`,
            VALIDATION_CODES.INVALID_VALUE
        );
    }

    req.body.username = normalizedUsername;
    req.body.password = passwordStr;
    next();
};

const validateStudentsList = (req, res, next) => {
    const { students } = req.body || {};

    if (!Array.isArray(students) || students.length === 0) {
        return sendValidationError(
            res,
            'La lista de estudiantes es requerida y debe contener elementos',
            VALIDATION_CODES.INVALID_LIST
        );
    }

    const sanitizedStudents = [];
    const errors = [];

    students.forEach((student, index) => {
        if (!student || typeof student !== 'object') {
            errors.push(`Elemento ${index + 1}: Formato inválido`);
            return;
        }

        const sanitizedStudent = {};

        for (const field of config.VALIDATION.REQUIRED_STUDENT_FIELDS) {
            const value = student[field];

            if (!value || (typeof value === 'string' && value.trim().length === 0)) {
                errors.push(`Elemento ${index + 1}: Campo "${field}" es requerido`);
                continue;
            }

            sanitizedStudent[field] = sanitizeString(value);
        }

        if (sanitizedStudent.matricula) {
            sanitizedStudent.matricula = sanitizedStudent.matricula.toUpperCase().replace(/[\s\-]/g, '');
            if (!/^[A-Z0-9]+$/.test(sanitizedStudent.matricula)) {
                errors.push(`Elemento ${index + 1}: Matrícula con formato inválido`);
            }
        }

        if (sanitizedStudent.grupo) {
            sanitizedStudent.grupo = sanitizedStudent.grupo.toUpperCase();
        }

        sanitizedStudents.push(sanitizedStudent);
    });

    if (errors.length > 0) {
        return sendValidationError(
            res,
            'Errores en la lista de estudiantes',
            VALIDATION_CODES.INVALID_LIST,
            400,
            errors.slice(0, 20)
        );
    }

    req.body.students = sanitizedStudents;
    next();
};

const validatePasswordChange = (req, res, next) => {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
        return sendValidationError(
            res,
            'Contraseña actual y nueva son requeridas',
            VALIDATION_CODES.MISSING_FIELD
        );
    }

    const currentPasswordStr = typeof currentPassword === 'string' ? currentPassword : String(currentPassword);
    const newPasswordStr = typeof newPassword === 'string' ? newPassword : String(newPassword);

    if (currentPasswordStr === newPasswordStr) {
        return sendValidationError(
            res,
            'La nueva contraseña debe ser diferente a la actual',
            VALIDATION_CODES.INVALID_VALUE
        );
    }

    const strength = Administrador.validatePasswordStrength(newPasswordStr);

    if (!strength.isStrong) {
        return sendValidationError(
            res,
            `La nueva contraseña no cumple los requisitos: ${strength.errors.join(', ')}`,
            VALIDATION_CODES.WEAK_PASSWORD
        );
    }

    req.body.currentPassword = currentPasswordStr;
    req.body.newPassword = newPasswordStr;
    next();
};

module.exports = {
    sanitizeInput,
    validateAttendance,
    validateAdminLogin,
    validateStudentsList,
    validatePasswordChange
};
