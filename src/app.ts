import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config } from './config';
import { requireSameOrigin } from './middleware';
import authRouter from './routes/auth';
import categoriesRouter from './routes/categories';
import membersRouter from './routes/members';
import adminRouter from './routes/admin';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá 15 minutos e intentá de nuevo.' },
});

app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    requireSameOrigin(req, res, next);
    return;
  }
  next();
});
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRouter);
app.use('/api/categorias', categoriesRouter);
app.use('/api/socios', membersRouter);
app.use('/api/admin', adminRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use(express.static(path.resolve(__dirname, '../public')));

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error?.code === 'ER_DUP_ENTRY') {
    res.status(409).json({ error: 'Ya existe un registro con esos datos.' });
    return;
  }
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
    res.status(400).json({ error: 'La categoría seleccionada no existe.' });
    return;
  }
  console.error('Error interno del servidor:', error instanceof Error ? error.message : 'Error desconocido');
  res.status(500).json({ error: 'Ocurrió un error interno. Revisá la configuración del servidor.' });
};
app.use(errorHandler);

if (config.NODE_ENV === 'production' && !config.APP_ORIGIN.startsWith('https://')) {
  throw new Error('En producción, APP_ORIGIN debe usar HTTPS.');
}
