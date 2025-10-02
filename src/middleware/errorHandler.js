const { errorLogger } = require('./logger');

class AppError extends Error {
    constructor(message, statusCode = 500, code = 'SERVER_ERROR', details = null) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;

        Error.captureStackTrace(this, this.constructor);
    }
}

const asyncHandler = (handler) => {
    if (typeof handler !== 'function') {
        throw new TypeError('asyncHandler requiere una función');
    }

    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
};

/**
 * Middleware global para manejo de errores.
 * Debe colocarse al final de la cadena de middlewares.
 */
const globalErrorHandler = (err, req, res, next) => {
    const error = err instanceof AppError ? err : new AppError(
        err.message || 'Error interno del servidor',
        err.statusCode || 500,
        err.code || 'SERVER_ERROR',
        err.details || null
    );

    // Registrar el error con el logger centralizado
    errorLogger(error, req);

    const response = {
        success: false,
        error: error.message,
        code: error.code
    };

    // Incluir detalles solo en desarrollo para evitar exponer información sensible
    if (process.env.NODE_ENV === 'development') {
        response.details = error.details;
        response.stack = error.stack;
    }

    res.status(error.statusCode).json(response);
};

module.exports = {
    AppError,
    asyncHandler,
    globalErrorHandler
};
