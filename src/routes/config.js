const express = require('express');
const ConfigService = require('../services/configService');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Obtener configuración pública del sistema (para clientes)
router.get('/', asyncHandler(async (req, res) => {
    const systemConfig = await ConfigService.getPublicConfig();
    res.status(200).json(systemConfig);
}));

module.exports = router;

