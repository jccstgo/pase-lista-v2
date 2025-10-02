const { AppError } = require('./errorHandler');

const sanitizeValue = (value) => {
    if (typeof value === 'string') {
        return value.trim();
    }

    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }

    if (value && typeof value === 'object') {
        return Object.entries(value).reduce((acc, [key, val]) => {
            acc[key] = sanitizeValue(val);
            return acc;
        }, {});
    }

    return value;
};

const sanitizeInput = (req, res, next) => {
    if (req.body && Object.keys(req.body).length > 0) {
        req.body = sanitizeValue(req.body);
    }

    if (req.query && Object.keys(req.query).length > 0) {
        req.query = sanitizeValue(req.query);
    }

    if (req.params && Object.keys(req.params).length > 0) {
        req.params = sanitizeValue(req.params);
    }

    next();
};

const validateAdminLogin = (req, res, next) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
        return next(new AppError('Usuario y contraseña son requeridos', 400, 'MISSING_CREDENTIALS'));
    }

    next();
};

const validatePasswordChange = (req, res, next) => {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
        return next(new AppError('Contraseña actual y nueva son requeridas', 400, 'MISSING_PASSWORD_FIELDS'));
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
        return next(new AppError('La nueva contraseña debe tener al menos 6 caracteres', 400, 'WEAK_PASSWORD'));
    }

    next();
};

const validateStudentsList = (req, res, next) => {
    const { students } = req.body || {};

    if (!Array.isArray(students) || students.length === 0) {
        return next(new AppError('Se requiere un arreglo de estudiantes', 400, 'INVALID_STUDENTS_LIST'));
    }

    const invalidEntries = students.filter(student => {
        if (!student || typeof student !== 'object') {
            return true;
        }

        const { matricula, nombre, grupo } = student;
        return !matricula || !nombre || !grupo;
    });

    if (invalidEntries.length > 0) {
        return next(new AppError('Existen estudiantes con datos incompletos', 400, 'INVALID_STUDENT_DATA'));
    }

    next();
};

const validateAttendance = (req, res, next) => {
    const { matricula } = req.body || {};

    if (!matricula) {
        return next(new AppError('La matrícula es requerida', 400, 'MISSING_MATRICULA'));
    }

    next();
};

module.exports = {
    sanitizeInput,
    validateAdminLogin,
    validatePasswordChange,
    validateStudentsList,
    validateAttendance
};
