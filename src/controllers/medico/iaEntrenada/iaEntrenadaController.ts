/**
 * iaEntrenadaController.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * MD-7 — Repositorios inteligentes de Medicina Funcional.
 *
 * GET  /medico/ia-entrenada                 → listar contenido (paginado, por categoría)
 * POST /medico/ia-entrenada/buscar          → búsqueda semántica con IA (Bedrock)
 * GET  /medico/ia-entrenada/categorias      → listado de categorías únicas
 */

import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import RepositorioIA from '../../../models/RepositorioIA';
import { invokeAgent } from '../../../services/ai/bedrock.service';
import { handleError } from '../../../utils/errors';

// Categorías base de Medicina Funcional
const CATEGORIAS_BASE = [
  'Disfunción Mitocondrial',
  'Salud Hormonal',
  'Salud Digestiva',
  'Inflamación Crónica',
  'Estrés y Cortisol',
  'Detoxificación',
  'Sistema Inmune',
  'Neurotransmisores',
  'Metabolismo',
  'Salud Cardiovascular',
  'Salud Ósea',
  'Nutrición Funcional'
];

// ─── Listar contenido ─────────────────────────────────────────────────────────

export const listarContenido = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { categoria, tipo, page = '1', limit = '12' } = req.query;

    const filter: Record<string, unknown> = { activo: true };
    if (categoria) filter.categorias = categoria;
    if (tipo) filter.tipo = tipo;

    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));

    const [contenido, total] = await Promise.all([
      RepositorioIA.find(filter)
        .sort({ visualizaciones: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(String(limit)))
        .select('-transcripcion') // La transcripción completa solo en detalle
        .lean(),
      RepositorioIA.countDocuments(filter)
    ]);

    // Si no hay contenido en DB, devolver ejemplos seed para que la UI no quede vacía
    const data = contenido.length > 0 ? contenido : seedEjemplos(categoria as string | undefined);

    res.json({
      success: true,
      data: {
        contenido: data,
        pagination: {
          total: contenido.length > 0 ? total : seedEjemplos().length,
          page: parseInt(String(page)),
          limit: parseInt(String(limit))
        }
      }
    });
  } catch (err: any) {
    handleError(err, res);
  }
};

// ─── Buscar con IA ────────────────────────────────────────────────────────────

export const buscarContenido = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { query, pacienteContexto } = req.body;

    if (!query || String(query).trim().length < 3) {
      res.status(400).json({ success: false, message: 'La búsqueda debe tener al menos 3 caracteres.' });
      return;
    }

    // 1. Búsqueda fulltext en MongoDB
    let resultadosDB: unknown[] = [];
    try {
      resultadosDB = await RepositorioIA.find(
        { $text: { $search: String(query) }, activo: true },
        { score: { $meta: 'textScore' } }
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(5)
        .select('-transcripcion')
        .lean();
    } catch { /* índice de texto puede no existir aún */ }

    // 2. Sugerencias IA con Bedrock
    const contextoExtra = pacienteContexto
      ? `Contexto del paciente: ${pacienteContexto}`
      : '';

    const prompt = `
Eres un experto en Medicina Funcional. Un médico está buscando material educativo sobre: "${query}".
${contextoExtra}

Genera exactamente 3 sugerencias de contenido de alta relevancia clínica. Para cada sugerencia incluye:
- Un título concreto de conferencia/artículo/protocolo
- El autor o institución
- Por qué es relevante para esta búsqueda (máx. 1 oración)

Retorna ÚNICAMENTE un array JSON con este formato:
[{"titulo":"...","autor":"...","relevancia":"...","tipo":"conferencia"}]
Sin texto adicional.
`.trim();

    let sugerenciasIA: unknown[] = [];
    try {
      const raw = await invokeAgent(prompt);
      const cleaned = raw.trim().replace(/^```json?|```$/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) sugerenciasIA = parsed;
    } catch { /* fallo silencioso, devolver solo DB results */ }

    res.json({
      success: true,
      data: {
        resultadosDB,
        sugerenciasIA,
        query
      }
    });
  } catch (err: any) {
    handleError(err, res);
  }
};

// ─── Categorías ───────────────────────────────────────────────────────────────

export const getCategorias = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Combinar categorías de DB con las base
    const dbCats = await RepositorioIA.distinct('categorias', { activo: true });
    const todas = Array.from(new Set([...CATEGORIAS_BASE, ...dbCats])).sort();

    res.json({ success: true, data: todas });
  } catch (err: any) {
    handleError(err, res);
  }
};

// ─── Seed de ejemplos (cuando DB está vacía) ──────────────────────────────────

function seedEjemplos(categoria?: string) {
  const todos = [
    {
      _id: 'seed-1',
      titulo: 'Disfunción Mitocondrial en Medicina Funcional',
      autor: 'Dr. Mark Hyman',
      tipo: 'conferencia',
      categorias: ['Disfunción Mitocondrial', 'Metabolismo'],
      descripcion: 'Protocolo avanzado para identificar y tratar la disfunción mitocondrial en pacientes con fatiga crónica.',
      duracion: '45 min',
      tags: ['mitocondria', 'fatiga', 'energía'],
      visualizaciones: 120,
      activo: true
    },
    {
      _id: 'seed-2',
      titulo: 'Estrategias Terapéuticas para Inflamación Crónica',
      autor: 'Dr. Amy Myers',
      tipo: 'charla',
      categorias: ['Inflamación Crónica', 'Sistema Inmune'],
      descripcion: 'Intervenciones nutricionales y suplementación para modular la respuesta inflamatoria sistémica.',
      duracion: '30 min',
      tags: ['inflamación', 'dieta', 'omega3'],
      visualizaciones: 98,
      activo: true
    },
    {
      _id: 'seed-3',
      titulo: 'Optimización Hormonal con Enfoque Funcional',
      autor: 'Dr. Sara Gottfried',
      tipo: 'webinar',
      categorias: ['Salud Hormonal', 'Estrés y Cortisol'],
      descripcion: 'Evaluación y tratamiento del desequilibrio hormonal usando medicina de precisión.',
      duracion: '60 min',
      tags: ['hormonas', 'cortisol', 'tiroides'],
      visualizaciones: 87,
      activo: true
    },
    {
      _id: 'seed-4',
      titulo: 'Protocolo de Detoxificación Hepática',
      autor: 'Dr. Jeffrey Bland',
      tipo: 'protocolo',
      categorias: ['Detoxificación', 'Salud Digestiva'],
      descripcion: 'Programa de 21 días para soporte de las fases I y II de detoxificación hepática.',
      duracion: '25 min',
      tags: ['detox', 'hígado', 'glutatión'],
      visualizaciones: 75,
      activo: true
    },
    {
      _id: 'seed-5',
      titulo: 'Microbioma y Salud Mental: Conexión Intestino-Cerebro',
      autor: 'Dr. David Perlmutter',
      tipo: 'conferencia',
      categorias: ['Salud Digestiva', 'Neurotransmisores'],
      descripcion: 'Evidencia científica del eje intestino-cerebro y estrategias para optimizar el microbioma.',
      duracion: '55 min',
      tags: ['microbioma', 'probióticos', 'serotonina'],
      visualizaciones: 143,
      activo: true
    },
    {
      _id: 'seed-6',
      titulo: 'Nutrición Funcional: Más allá de las calorías',
      autor: 'Dra. Terry Wahls',
      tipo: 'webinar',
      categorias: ['Nutrición Funcional', 'Inflamación Crónica'],
      descripcion: 'El protocolo Wahls y la importancia de la densidad nutricional en enfermedades autoinmunes.',
      duracion: '40 min',
      tags: ['nutrición', 'autoinmune', 'fitoquímicos'],
      visualizaciones: 64,
      activo: true
    }
  ];

  if (categoria) return todos.filter(t => t.categorias.includes(categoria));
  return todos;
}
