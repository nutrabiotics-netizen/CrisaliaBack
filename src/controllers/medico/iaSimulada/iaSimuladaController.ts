import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import { AIService } from '../../../services/ai/AIService';

const ok = <T>(res: Response, data: T) => {
  res.status(200).json({ success: true, data });
};

export const postContrato = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AIService.generarContrato(req.body || {});
    ok(res, data);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error' });
  }
};

export const postAnamnesisMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AIService.analizarAnamnesisMedico(req.body || {});
    ok(res, data);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error' });
  }
};

export const postDiagnosticos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AIService.sugerirDiagnosticos(req.body || {});
    ok(res, data);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error' });
  }
};

export const postEstrategiasTerapeuticas = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AIService.generarEstrategiasTerapeuticas(req.body || {});
    ok(res, data);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error' });
  }
};

export const postTranscripcion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AIService.transcribirConsulta(req.body || {});
    ok(res, data);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error' });
  }
};

export const postParaclinicos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AIService.analizarParaclinicos(req.body || {});
    ok(res, data);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error' });
  }
};

export const postResumenControl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AIService.generarResumenControl(req.body || {});
    ok(res, data);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error' });
  }
};

export const getRepositorioMF = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q || '');
    const data = await AIService.buscarRepositorioMF(q);
    ok(res, data);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error' });
  }
};

export const postOptimizarAgenda = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AIService.optimizarAgenda(req.body || {});
    ok(res, data);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error' });
  }
};

export const getDemoAnamnesisLista = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AIService.listarAnamnesisMedico(req.userId || '');
    ok(res, data);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error' });
  }
};

export const getDemoMetricasImpacto = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AIService.metricasImpacto();
    ok(res, data);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error' });
  }
};

export const getDemoVersiculos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tema = req.query.tema ? String(req.query.tema) : undefined;
    const data = await AIService.versiculos(tema);
    ok(res, data);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error' });
  }
};
