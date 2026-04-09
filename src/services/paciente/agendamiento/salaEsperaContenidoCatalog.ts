/**
 * Catálogo de contenido educativo para la sala de espera digital (A12).
 * Las etiquetas permiten priorizar ítems según zonas de dolor / contexto del paciente.
 */

export type IconoTipSala = 'heart' | 'beaker' | 'fire' | 'sparkles' | 'lightbulb';

export interface ItemTipSala {
  id: string;
  texto: string;
  icon: IconoTipSala;
  color: string;
  tags: string[];
}

export interface ItemVideoSala {
  id: string;
  titulo: string;
  descripcion: string;
  youtubeId: string;
  duracion: string;
  tags: string[];
}

export const CATALOGO_TIPS_SALA: ItemTipSala[] = [
  {
    id: 't1',
    texto: 'Hidratarte con al menos 2 litros de agua por día reduce la inflamación sistémica.',
    icon: 'heart',
    color: 'text-red-500',
    tags: ['general', 'inflamacion']
  },
  {
    id: 't2',
    texto: 'Tomar Omega-3 en ayunas mejora la absorción y el efecto antiinflamatorio.',
    icon: 'beaker',
    color: 'text-purple-500',
    tags: ['general', 'inflamacion', 'cardio']
  },
  {
    id: 't3',
    texto: '30 minutos de caminata diaria a paso moderado activa el sistema linfático.',
    icon: 'fire',
    color: 'text-orange-500',
    tags: ['general', 'postura', 'cardio']
  },
  {
    id: 't4',
    texto: 'Dormir entre 7 y 9 horas ayuda a regular el cortisol y la respuesta inmune.',
    icon: 'sparkles',
    color: 'text-yellow-500',
    tags: ['general', 'neuro', 'estres']
  },
  {
    id: 't5',
    texto: 'Una alimentación baja en azúcares refinados reduce la carga glucémica en pocas semanas.',
    icon: 'lightbulb',
    color: 'text-blue-500',
    tags: ['general', 'digestivo', 'inflamacion']
  },
  {
    id: 't6',
    texto: '5 minutos de respiración diafragmática activan el nervio vago y reducen el estrés.',
    icon: 'heart',
    color: 'text-pink-500',
    tags: ['general', 'estres', 'neuro']
  },
  {
    id: 't7',
    texto: 'Si notas molestias digestivas, las comidas pequeñas y frecuentes pueden aliviar la carga del estómago.',
    icon: 'beaker',
    color: 'text-emerald-600',
    tags: ['digestivo', 'general']
  },
  {
    id: 't8',
    texto: 'Mantener la alineación de cuello y hombros al usar pantallas reduce la tensión cervical.',
    icon: 'sparkles',
    color: 'text-indigo-500',
    tags: ['postura', 'neuro', 'general']
  },
  {
    id: 't9',
    texto: 'La actividad suave (estiramientos, yoga) puede mejorar la movilidad articular sin sobrecargar.',
    icon: 'fire',
    color: 'text-rose-500',
    tags: ['postura', 'inflamacion', 'general']
  },
  {
    id: 't10',
    texto: 'Limitar sodio y procesados es un apoyo importante cuando hay interés en salud cardiovascular.',
    icon: 'heart',
    color: 'text-red-600',
    tags: ['cardio', 'general', 'inflamacion']
  }
];

export const CATALOGO_VIDEOS_SALA: ItemVideoSala[] = [
  {
    id: 'v1',
    titulo: '¿Qué es la Medicina Funcional?',
    descripcion: 'Una introducción al enfoque que aborda la raíz de las enfermedades crónicas.',
    youtubeId: 'vR75m0yiB5M',
    duracion: '8 min',
    tags: ['general']
  },
  {
    id: 'v2',
    titulo: 'Inflamación: el enemigo silencioso',
    descripcion: 'Cómo la inflamación crónica afecta cada sistema del cuerpo y cómo reducirla.',
    youtubeId: '5C0_GC9FUvE',
    duracion: '12 min',
    tags: ['general', 'inflamacion', 'digestivo']
  },
  {
    id: 'v3',
    titulo: 'Suplementos esenciales en Medicina Funcional',
    descripcion: 'Omega-3, Vitamina D3, Magnesio: por qué son la base de cualquier protocolo.',
    youtubeId: 'GVCFr_qfprs',
    duracion: '6 min',
    tags: ['general', 'inflamacion', 'digestivo']
  }
];
