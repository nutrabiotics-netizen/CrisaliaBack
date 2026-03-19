import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import * as agenda from '../../../controllers/administrativo/agenda/agendaController';
import * as boxes from '../../../controllers/administrativo/agenda/boxController';
import * as reglas from '../../../controllers/administrativo/agenda/reglasController';

const router = Router();

// Panel analítico
router.get('/citas', authenticate, authorize(UserRole.ADMINISTRATIVO), agenda.listarCitas);

// Boxes
router.get('/boxes', authenticate, authorize(UserRole.ADMINISTRATIVO), boxes.listarBoxes);
router.post('/boxes', authenticate, authorize(UserRole.ADMINISTRATIVO), boxes.crearBox);
router.put('/boxes/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), boxes.actualizarBox);
router.delete('/boxes/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), boxes.eliminarBox);

// Asignaciones
router.get('/asignaciones', authenticate, authorize(UserRole.ADMINISTRATIVO), boxes.listarAsignacionesDia);
router.get('/mapa-ocupacion', authenticate, authorize(UserRole.ADMINISTRATIVO), boxes.obtenerMapaOcupacion);
router.post('/boxes/:idBox/asignaciones', authenticate, authorize(UserRole.ADMINISTRATIVO), boxes.asignarMedico);
router.delete('/asignaciones/:idAsig', authenticate, authorize(UserRole.ADMINISTRATIVO), boxes.eliminarAsignacion);

// Reglas (Promociones/Multas)
router.get('/reglas', authenticate, authorize(UserRole.ADMINISTRATIVO), reglas.listarReglas);
router.post('/reglas', authenticate, authorize(UserRole.ADMINISTRATIVO), reglas.crearRegla);
router.put('/reglas/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), reglas.actualizarRegla);
router.delete('/reglas/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), reglas.eliminarRegla);

export default router;
