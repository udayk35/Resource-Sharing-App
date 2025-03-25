import { Router } from 'express';
import { handleHeartbeat, getAllProviders, getProviderByProviderId, startContainer, stopContainer, pullImage, createContainer, getSystemInfo, readFile,writeFile,listFiles,attachTerminal,fileUpload} from '../controllers/providerController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import expressws from 'express-ws';
import multer from 'multer';

const router = Router();
const upload = multer({storage:multer.memoryStorage()});
expressws(router);
router.post('/heartbeat', handleHeartbeat);
router.get('/', getAllProviders);
router.get('/:providerId',authMiddleware, getProviderByProviderId);
router.post('/containers/:containerId/start', authMiddleware, startContainer);
router.post('/containers/:containerId/stop', authMiddleware, stopContainer);

router.post('/containers/:containerId/upload',authMiddleware,upload.single('file'),fileUpload);
router.post('/images/pull', authMiddleware, pullImage);
router.post('/containers/create', authMiddleware, createContainer);
router.post('/getsysteminfo', getSystemInfo);

// File operations
router.post('/files/read', authMiddleware, readFile);
router.post('/files/write', authMiddleware, writeFile);
router.post('/files/list', authMiddleware, listFiles);

//Terminal access
router.ws('/provider/:providerID/:containerID/terminal',attachTerminal);

export default router;