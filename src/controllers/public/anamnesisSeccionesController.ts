import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const SECTIONS_DIR = path.join(__dirname, '../../data/anamnesis_sections');

const VALID_IDS = new Set([
  's01','s02','s03','s04','s05','s06','s07','s08','s09','s10',
  's11','s12','s13','s14','s15','s16','s17','s18','s19','s20',
  's21','s22','s23','s24','s25','s26','s27','s28','s29','s30',
  's31','s32','s33','s34','s35','s36','s37',
  'annex_a','annex_b','annex_c','index',
]);

export const obtenerSecciones = (req: Request, res: Response): void => {
  try {
    const idsParam = req.query.ids as string | undefined;
    const ids = idsParam
      ? idsParam.split(',').map(s => s.trim()).filter(s => VALID_IDS.has(s))
      : ['s01','s02','s03','s04','s05'];

    const secciones: Record<string, any> = {};
    for (const id of ids) {
      const filePath = path.join(SECTIONS_DIR, `${id}.json`);
      if (fs.existsSync(filePath)) {
        secciones[id] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    }

    res.json({ success: true, data: secciones });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Error al cargar secciones', error: err.message });
  }
};