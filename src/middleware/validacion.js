const config = require('../config/server');
const Administrador = require('../models/Administrador');

const CODIGOS_VALIDACION = {
    MISSING_FIELD: 'MISSING_FIELD',
    INVALID_FORMAT: 'INVALID_FORMAT',
    INVALID_VALUE: 'INVALID_VALUE',
    WEAK_PASSWORD: 'WEAK_PASSWORD',
    INVALID_LIST: 'INVALID_LIST'
};

const sanitizarCadena = (valor) => {
    if (typeof valor !== 'string') {
        valor = valor == null ? '' : String(valor);
    }

    return valor
        .replace(/<script.*?>.*?<\/script>/gi, '')
        .replace(/[<>]/g, '')
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim();
};

const sanitizarValor = (valor) => {
    if (Array.isArray(valor)) {
        return valor.map(sanitizarValor);
    }

    if (valor && typeof valor === 'object' && valor.constructor === Object) {
        const valoresSanitizados = {};
        for (const clave of Object.keys(valor)) {
            valoresSanitizados[clave] = sanitizarValor(valor[clave]);
        }
        return valoresSanitizados;
    }

    if (typeof valor === 'string' || typeof valor === 'number') {
        return sanitizarCadena(valor);
    }

    return valor;
};

const sanitizarEntrada = (req, res, next) => {
    try {
        if (req.body && typeof req.body === 'object') {
            req.body = sanitizarValor(req.body);
        }

        if (req.query && typeof req.query === 'object') {
            req.query = sanitizarValor(req.query);
        }

        if (req.params && typeof req.params === 'object') {
            req.params = sanitizarValor(req.params);
        }

        next();
    } catch (error) {
        console.error('❌ Error sanitizando entrada:', error);
        res.status(400).json({
            success: false,
            error: 'Entrada inválida',
            code: CODIGOS_VALIDACION.INVALID_VALUE
        });
    }
};

const enviarErrorValidacion = (res, mensaje, codigo = CODIGOS_VALIDACION.INVALID_VALUE, estado = 400, detalles = {}) => {
    return res.status(estado).json({
        success: false,
        error: mensaje,
        code: codigo,
        ...Object.keys(detalles).length ? { details: detalles } : {}
    });
};

const validarAsistencia = (req, res, next) => {
    const { matricula } = req.body || {};

    if (!matricula) {
        return enviarErrorValidacion(res, 'Matrícula es requerida', CODIGOS_VALIDACION.MISSING_FIELD);
    }

    const matriculaNormalizada = sanitizarCadena(matricula).toUpperCase().replace(/[\s\-]/g, '');

    if (!/^[A-Z0-9]+$/.test(matriculaNormalizada)) {
        return enviarErrorValidacion(res, 'Formato de matrícula inválido', CODIGOS_VALIDACION.INVALID_FORMAT);
    }

    if (matriculaNormalizada.length < 3 || matriculaNormalizada.length > 20) {
        return enviarErrorValidacion(res, 'La matrícula debe tener entre 3 y 20 caracteres', CODIGOS_VALIDACION.INVALID_VALUE);
    }

    req.body.matricula = matriculaNormalizada;
    next();
};

const validarInicioSesionAdmin = (req, res, next) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
        return enviarErrorValidacion(
            res,
            'Usuario y contraseña son requeridos',
            CODIGOS_VALIDACION.MISSING_FIELD
        );
    }

    const usuarioNormalizado = sanitizarCadena(username).toLowerCase();

    if (usuarioNormalizado.length < 3) {
        return enviarErrorValidacion(res, 'El usuario debe tener al menos 3 caracteres', CODIGOS_VALIDACION.INVALID_VALUE);
    }

    if (!/^[a-z0-9._-]+$/.test(usuarioNormalizado)) {
        return enviarErrorValidacion(res, 'Formato de usuario inválido', CODIGOS_VALIDACION.INVALID_FORMAT);
    }

    const contrasenaCadena = typeof password === 'string' ? password : String(password || '');

    if (contrasenaCadena.length < config.VALIDATION.MIN_PASSWORD_LENGTH) {
        return enviarErrorValidacion(
            res,
            `La contraseña debe tener al menos ${config.VALIDATION.MIN_PASSWORD_LENGTH} caracteres`,
            CODIGOS_VALIDACION.INVALID_VALUE
        );
    }

    req.body.username = usuarioNormalizado;
    req.body.password = contrasenaCadena;
    next();
};

const validarListaEstudiantes = (req, res, next) => {
    const { students } = req.body || {};

    if (!Array.isArray(students) || students.length === 0) {
        return enviarErrorValidacion(
            res,
            'La lista de estudiantes es requerida y debe contener elementos',
            CODIGOS_VALIDACION.INVALID_LIST
        );
    }

    const estudiantesSanitizados = [];
    const errores = [];

    students.forEach((estudiante, indice) => {
        if (!estudiante || typeof estudiante !== 'object') {
            errores.push(`Elemento ${indice + 1}: Formato inválido`);
            return;
        }

        const estudianteSanitizado = {};

        for (const campo of config.VALIDATION.REQUIRED_STUDENT_FIELDS) {
            const valor = estudiante[campo];

            if (!valor || (typeof valor === 'string' && valor.trim().length === 0)) {
                errores.push(`Elemento ${indice + 1}: Campo "${campo}" es requerido`);
                continue;
            }

            estudianteSanitizado[campo] = sanitizarCadena(valor);
        }

        if (estudianteSanitizado.matricula) {
            estudianteSanitizado.matricula = estudianteSanitizado.matricula.toUpperCase().replace(/[\s\-]/g, '');
            if (!/^[A-Z0-9]+$/.test(estudianteSanitizado.matricula)) {
                errores.push(`Elemento ${indice + 1}: Matrícula con formato inválido`);
            }
        }

        if (estudianteSanitizado.grupo) {
            estudianteSanitizado.grupo = estudianteSanitizado.grupo.toUpperCase();
        }

        estudiantesSanitizados.push(estudianteSanitizado);
    });

    if (errores.length > 0) {
        return enviarErrorValidacion(
            res,
            'Errores en la lista de estudiantes',
            CODIGOS_VALIDACION.INVALID_LIST,
            400,
            errores.slice(0, 20)
        );
    }

    req.body.students = estudiantesSanitizados;
    next();
};

const validarCambioContrasena = (req, res, next) => {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
        return enviarErrorValidacion(
            res,
            'Contraseña actual y nueva son requeridas',
            CODIGOS_VALIDACION.MISSING_FIELD
        );
    }

    const contrasenaActualCadena = typeof currentPassword === 'string' ? currentPassword : String(currentPassword);
    const nuevaContrasenaCadena = typeof newPassword === 'string' ? newPassword : String(newPassword);

    if (contrasenaActualCadena === nuevaContrasenaCadena) {
        return enviarErrorValidacion(
            res,
            'La nueva contraseña debe ser diferente a la actual',
            CODIGOS_VALIDACION.INVALID_VALUE
        );
    }

    const fortaleza = Administrador.validatePasswordStrength(nuevaContrasenaCadena);

    if (!fortaleza.isStrong) {
        return enviarErrorValidacion(
            res,
            `La nueva contraseña no cumple los requisitos: ${fortaleza.errors.join(', ')}`,
            CODIGOS_VALIDACION.WEAK_PASSWORD
        );
    }

    req.body.currentPassword = contrasenaActualCadena;
    req.body.newPassword = nuevaContrasenaCadena;
    next();
};

module.exports = {
    sanitizarEntrada,
    validarAsistencia,
    validarInicioSesionAdmin,
    validarListaEstudiantes,
    validarCambioContrasena,
    CODIGOS_VALIDACION
};
