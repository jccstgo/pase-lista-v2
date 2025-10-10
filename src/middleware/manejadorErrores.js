const { registradorErrores } = require('./registro');

class ErrorAplicacion extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details = null) {
        super(message);
        this.name = 'ErrorAplicacion';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

const manejadorAsincrono = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const manejadorErroresGlobal = (err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (res.headersSent) {
        return next(err);
    }

    const statusCode = err.statusCode || 500;
    const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
    const isOperational = err instanceof ErrorAplicacion || err.isOperational;

    registradorErrores(err, req, {
        code: errorCode,
        statusCode,
        isOperational,
        details: err.details
    });

    const response = {
        success: false,
        error: err.message || 'Error interno del servidor',
        code: errorCode,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
        method: req.method
    };

    if (err.details) {
        response.details = err.details;
    }

    if (process.env.NODE_ENV === 'development' && err.stack) {
        response.stack = err.stack;
    }

    res.status(statusCode).json(response);
};

module.exports = {
    ErrorAplicacion,
    manejadorAsincrono,
    manejadorErroresGlobal
};
