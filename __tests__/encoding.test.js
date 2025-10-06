const fs = require('fs');
const path = require('path');

const { decodePotentiallyMisencodedText, hasEncodingArtifacts } = require('../src/utils/encoding');
const Student = require('../src/models/Student');
const CSVService = require('../src/services/csvService');

describe('encoding utilities', () => {
    test('detects encoding artifacts', () => {
        expect(hasEncodingArtifacts('Jos\uFFFD')).toBe(true);
        expect(hasEncodingArtifacts('JosÃ©')).toBe(true);
        expect(hasEncodingArtifacts('José')).toBe(false);
    });

    test('decodes misencoded text back to UTF-8', () => {
        const original = 'José López';
        const misencoded = Buffer.from(original, 'utf8').toString('latin1');

        expect(misencoded).not.toBe(original);
        const decoded = decodePotentiallyMisencodedText(misencoded);
        expect(decoded).toBe(original);
    });
});

describe('Student encoding normalization', () => {
    test('normalizes and decodes misencoded names and groups', () => {
        const data = {
            matricula: 'abc123',
            nombre: Buffer.from('María-José', 'utf8').toString('latin1'),
            grupo: Buffer.from('Información', 'utf8').toString('latin1')
        };

        const student = new Student(data);

        expect(student.matricula).toBe('ABC123');
        expect(student.nombre).toBe('María-José');
        expect(student.grupo).toBe('INFORMACIÓN');
    });
});

describe('CSVService encoding handling', () => {
    const tempDir = path.join(__dirname, 'tmp');
    const tempFile = path.join(tempDir, 'encoding.csv');

    beforeAll(async () => {
        await fs.promises.mkdir(tempDir, { recursive: true });
    });

    afterAll(async () => {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    });

    test('reads CSV files containing misencoded values', async () => {
        const csvContent = 'matricula,nombre,grupo\n'
            + '001,José,Infantería\n'
            + '002,Ana María,Informática\n';

        const latin1Buffer = Buffer.from(csvContent, 'latin1');
        await fs.promises.writeFile(tempFile, latin1Buffer);

        const rows = await CSVService.readCSV(tempFile);

        expect(rows).toHaveLength(2);
        expect(rows[0].nombre).toBe('José');
        expect(rows[0].grupo).toBe('Infantería');
        expect(rows[1].nombre).toBe('Ana María');
        expect(rows[1].grupo).toBe('Informática');
    });
});
