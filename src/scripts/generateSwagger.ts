import fs from 'fs';
import path from 'path';
import { swaggerSpec } from '../config/swagger';

const outputPath = path.join(__dirname, '../config/swagger-spec.json');
fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2), 'utf-8');
console.log(`✅ swagger-spec.json generado en ${outputPath}`);
