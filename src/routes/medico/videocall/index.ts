import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  debugAWSConfig,
  createMeeting,
  createAttendee,
  getMeeting,
  endMeeting,
  listMeetings
} from '../../../controllers/medico/Videocall/meeting.controller';

const router = Router();

router.get('/debug', authenticate, authorize(UserRole.MEDICO), debugAWSConfig);
router.post('/meetings', authenticate, authorize(UserRole.MEDICO), createMeeting);
router.get('/meetings', authenticate, authorize(UserRole.MEDICO), listMeetings);
router.get('/meetings/:meetingId', authenticate, authorize(UserRole.MEDICO, UserRole.PACIENTE), getMeeting);
router.post('/meetings/:meetingId/attendees', authenticate, authorize(UserRole.MEDICO, UserRole.PACIENTE), createAttendee);
router.delete('/meetings/:meetingId', authenticate, authorize(UserRole.MEDICO), endMeeting);

export default router;
