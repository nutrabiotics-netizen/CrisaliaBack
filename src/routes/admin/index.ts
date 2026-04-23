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

const router = Router();

router.get('/cups2026/search', authenticate, buscarCups2026);
router.get('/parametros-nutrabiotics/search', authenticate, buscarParametrosNutrabiotics);

// Códigos de descuento (administrativo o médico)
router.post('/codigos-descuento', authenticate, authorize(UserRole.ADMINISTRATIVO), crearCodigo);
router.get('/codigos-descuento', authenticate, authorize(UserRole.ADMINISTRATIVO), listarCodigos);
router.put('/codigos-descuento/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), editarCodigo);
router.delete('/codigos-descuento/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), desactivarCodigo);

export default router;
