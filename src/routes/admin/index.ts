import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRole } from '../../types';
import { buscarCups2026 } from '../../controllers/admin/cups2026Controller';
import { buscarParametrosNutrabiotics } from '../../controllers/admin/parametrosNutrabioticsController';
import {
  crearCodigo,
  listarCodigos,
  editarCodigo,
  desactivarCodigo
} from '../../controllers/admin/codigoDescuentoAdminController';
import {
  crearLink,
  listarLinks,
  desactivarLink,
  listarReferidos,
  bonificarReferido
} from '../../controllers/admin/linkCaptacionController';

const router = Router();

router.get('/cups2026/search', authenticate, buscarCups2026);
router.get('/parametros-nutrabiotics/search', authenticate, buscarParametrosNutrabiotics);

// Códigos de descuento (administrativo o médico)
router.post('/codigos-descuento', authenticate, authorize(UserRole.ADMINISTRATIVO), crearCodigo);
router.get('/codigos-descuento', authenticate, authorize(UserRole.ADMINISTRATIVO), listarCodigos);
router.put('/codigos-descuento/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), editarCodigo);
router.delete('/codigos-descuento/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), desactivarCodigo);

// Links de captación médica
router.post('/links-captacion', authenticate, authorize(UserRole.ADMINISTRATIVO), crearLink);
router.get('/links-captacion', authenticate, authorize(UserRole.ADMINISTRATIVO), listarLinks);
router.delete('/links-captacion/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), desactivarLink);

// Referidos médicos
router.get('/referidos', authenticate, authorize(UserRole.ADMINISTRATIVO), listarReferidos);
router.post('/referidos/:id/bonificar', authenticate, authorize(UserRole.ADMINISTRATIVO), bonificarReferido);

export default router;
