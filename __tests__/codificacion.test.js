const fs = require('fs');
const path = require('path');

const {
    decodificarTextoPotencialmenteIncorrecto,
    tieneArtefactosCodificacion
} = require('../src/utils/codificacion');
const Estudiante = require('../src/models/Estudiante');
const ServicioCsv = require('../src/services/servicioCsv');

describe('utilidades de codificación', () => {
    test('detecta artefactos de codificación', () => {
        expect(tieneArtefactosCodificacion('Jos\uFFFD')).toBe(true);
        expect(tieneArtefactosCodificacion('JosÃ©')).toBe(true);
        expect(tieneArtefactosCodificacion('José')).toBe(false);
    });

    test('decodifica texto mal codificado a UTF-8', () => {
        const original = 'José López';
        const misencoded = Buffer.from(original, 'utf8').toString('latin1');

        expect(misencoded).not.toBe(original);
        const decoded = decodificarTextoPotencialmenteIncorrecto(misencoded);
        expect(decoded).toBe(original);
    });
});

describe('Normalización de codificación en estudiantes', () => {
    test('normaliza y decodifica nombres y grupos mal codificados', () => {
        const data = {
            matricula: 'abc123',
            nombre: Buffer.from('María-José', 'utf8').toString('latin1'),
            grupo: Buffer.from('Información', 'utf8').toString('latin1')
        };

        const student = new Estudiante(data);

        expect(student.matricula).toBe('ABC123');
        expect(student.nombre).toBe('María-José');
        expect(student.grupo).toBe('INFORMACIÓN');
    });
});

describe('Manejo de codificación en ServicioCsv', () => {
    const tempDir = path.join(__dirname, 'tmp');
    const tempFile = path.join(tempDir, 'encoding.csv');

    beforeAll(async () => {
        await fs.promises.mkdir(tempDir, { recursive: true });
    });

    afterAll(async () => {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    });

    test('lee archivos CSV con valores mal codificados', async () => {
        const csvContent = 'matricula,nombre,grupo\n'
            + '001,José,Infantería\n'
            + '002,Ana María,Informática\n';

        const latin1Buffer = Buffer.from(csvContent, 'latin1');
        await fs.promises.writeFile(tempFile, latin1Buffer);

        const rows = await ServicioCsv.leerCSV(tempFile);

        expect(rows).toHaveLength(2);
        expect(rows[0].nombre).toBe('José');
        expect(rows[0].grupo).toBe('Infantería');
        expect(rows[1].nombre).toBe('Ana María');
        expect(rows[1].grupo).toBe('Informática');
    });
});
