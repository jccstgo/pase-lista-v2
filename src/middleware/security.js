/**
 * Middleware de headers de seguridad para producción
 */
const securityHeaders = (req, res, next) => {
    // Prevenir sniffing de MIME types
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Prevenir clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Habilitar protección XSS del navegador
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Política de referrer estricta
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Content Security Policy básico
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' https://cdnjs.cloudflare.com",
        "connect-src 'self'",
        "frame-ancestors 'none'"
    ].join('; '));
    
    // Strict Transport Security (solo HTTPS)
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    
    // Permissions Policy (antigua Feature Policy)
    res.setHeader('Permissions-Policy', [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=()',
        'usb=()'
    ].join(', '));
    
    // Remover header de servidor
    res.removeHeader('X-Powered-By');
    
    next();
};

/**
 * Middleware de rate limiting básico
 */
const rateLimitMap = new Map();

const rateLimit = (options = {}) => {
    const {
        windowMs = 15 * 60 * 1000, // 15 minutos
        maxRequests = 100, // máximo 100 requests por ventana
        message = 'Demasiadas solicitudes desde esta IP'
    } = options;
    
    return (req, res, next) => {
        const key = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();
        
        // Limpiar entradas antiguas
        const cutoff = now - windowMs;
        for (const [ip, data] of rateLimitMap.entries()) {
            data.requests = data.requests.filter(time => time > cutoff);
            if (data.requests.length === 0) {
                rateLimitMap.delete(ip);
            }
        }
        
        // Obtener o crear entrada para esta IP
        if (!rateLimitMap.has(key)) {
            rateLimitMap.set(key, { requests: [] });
        }
        
        const ipData = rateLimitMap.get(key);
        
        // Filtrar requests dentro de la ventana
        ipData.requests = ipData.requests.filter(time => time > cutoff);
        
        // Verificar si excede el límite
        if (ipData.requests.length >= maxRequests) {
            console.warn(`⚠️ Rate limit excedido para IP: ${key}`);
            return res.status(429).json({
                success: false,
                error: message,
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }
        
        // Agregar este request
        ipData.requests.push(now);
        
        // Headers informativos
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', maxRequests - ipData.requests.length);
        res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());
        
        next();
    };
};

/**
 * Rate limiting específico para login (más estricto)
 */
const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    maxRequests: 5, // máximo 5 intentos de login por IP
    message: 'Demasiados intentos de login desde esta IP. Intente nuevamente en 15 minutos.'
});

/**
 * Rate limiting para rutas de API (moderado)
 */
const apiRateLimit = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    maxRequests: 30, // 30 requests por minuto
    message: 'Demasiadas solicitudes a la API. Intente nuevamente en un momento.'
});

/**
 * Middleware de validación de IP
 */
const ipWhitelist = (allowedIPs = []) => {
    return (req, res, next) => {
        if (allowedIPs.length === 0) {
            return next(); // Si no hay whitelist, permitir todo
        }
        
        const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
        
        if (!allowedIPs.includes(clientIP)) {
            console.warn(`⚠️ Acceso denegado desde IP no autorizada: ${clientIP}`);
            return res.status(403).json({
                success: false,
                error: 'Acceso denegado desde esta dirección IP',
                code: 'IP_NOT_ALLOWED'
            });
        }
        
        next();
    };
};

/**
 * Middleware de detección de ataques básicos
 */
const attackDetection = (req, res, next) => {
    const suspiciousPatterns = [
        // SQL Injection patterns
        /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/i,
        /(\b(or|and)\s+\d+\s*=\s*\d+)/i,
        /('|\"|;|--|\/\*|\*\/)/,
        
        // XSS patterns
        /(<script[^>]*>.*?<\/script>)/i,
        /(javascript:|vbscript:|onload=|onerror=)/i,
        /(<iframe|<object|<embed)/i,
        
        // Path traversal
        /(\.\.\/|\.\.\\)/,
        /(\/etc\/passwd|\/windows\/system32)/i,
        
        // Command injection
        /(\||&|;|\$\(|\`)/
    ];
    
    const checkString = (str) => {
        if (typeof str !== 'string') return false;
        return suspiciousPatterns.some(pattern => pattern.test(str));
    };
    
    // Verificar parámetros de query
    for (const [key, value] of Object.entries(req.query || {})) {
        if (checkString(key) || checkString(value)) {
            console.warn(`⚠️ Patrón sospechoso detectado en query: ${key}=${value} - IP: ${req.ip}`);
            return res.status(400).json({
                success: false,
                error: 'Solicitud contiene datos sospechosos',
                code: 'SUSPICIOUS_REQUEST'
            });
        }
    }
    
    // Verificar body
    if (req.body) {
        const bodyStr = JSON.stringify(req.body);
        if (checkString(bodyStr)) {
            console.warn(`⚠️ Patrón sospechoso detectado en body - IP: ${req.ip}`);
            return res.status(400).json({
                success: false,
                error: 'Solicitud contiene datos sospechosos',
                code: 'SUSPICIOUS_REQUEST'
            });
        }
    }
    
    // Verificar headers sospechosos
    const userAgent = req.headers['user-agent'] || '';
    if (userAgent.length > 1000 || checkString(userAgent)) {
        console.warn(`⚠️ User-Agent sospechoso: ${userAgent.substring(0, 100)} - IP: ${req.ip}`);
        return res.status(400).json({
            success: false,
            error: 'Headers sospechosos detectados',
            code: 'SUSPICIOUS_HEADERS'
        });
    }
    
    next();
};

/**
 * Middleware de detección de bots básico
 */
const botDetection = (req, res, next) => {
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    
    const commonBots = [
        'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget', 'python-requests',
        'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
        'yandexbot', 'facebookexternalhit', 'twitterbot'
    ];
    
    const isBot = commonBots.some(botPattern => userAgent.includes(botPattern));
    
    if (isBot) {
        console.log(`🤖 Bot detectado: ${userAgent.substring(0, 50)} - IP: ${req.ip}`);
        
        // Para bots legítimos, permitir solo ciertas rutas
        const allowedBotRoutes = ['/api/health', '/robots.txt', '/sitemap.xml'];
        const isAllowedRoute = allowedBotRoutes.some(route => req.path.startsWith(route));
        
        if (!isAllowedRoute) {
            return res.status(403).json({
                success: false,
                error: 'Acceso de bots no permitido en esta ruta',
                code: 'BOT_ACCESS_DENIED'
            });
        }
    }
    
    next();
};

/**
 * Middleware de CORS personalizado para el sistema
 */
const corsHandler = (req, res, next) => {
    const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://sistema-pase-lista.edu.mx' // Dominio de ejemplo
    ];
    
    const origin = req.headers.origin;
    
    // Permitir requests sin origin (como Postman, mobile apps)
    if (!origin || allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 horas
    
    // Responder a preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    
    next();
};

module.exports = {
    securityHeaders,
    rateLimit,
    loginRateLimit,
    apiRateLimit,
    ipWhitelist,
    attackDetection,
    botDetection,
    corsHandler
};
