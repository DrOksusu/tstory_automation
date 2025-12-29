import express from 'express';
import cors from 'cors';
import { config } from './config';
import blogRoutes from './routes/blogRoutes';
import authRoutes from './routes/authRoutes';

// Unhandled error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

const app = express();

// CORS 설정
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3600',
  'https://tstory-automation.vercel.app',
];

app.use(cors({
  origin: (origin, callback) => {
    // origin이 없는 경우 (서버 간 요청, Postman 등) 허용
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`CORS blocked origin: ${origin}`);
      callback(null, true); // 일단 허용 (디버깅 후 false로 변경 가능)
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/blog', blogRoutes);
app.use('/auth', authRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
);

// Start server
const PORT = Number(config.port);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Server address:`, server.address());
  console.log(`Browserbase enabled: ${config.browserbase?.enabled}`);
  console.log(`Browserbase API Key: ${config.browserbase?.apiKey ? 'SET' : 'NOT SET'}`);
  console.log(`Browserbase Project ID: ${config.browserbase?.projectId ? 'SET' : 'NOT SET'}`);
});

server.on('error', (error) => {
  console.error('Server error:', error);
});

// Increase timeout for long-running requests (Puppeteer publishing)
server.timeout = 300000; // 5 minutes
server.keepAliveTimeout = 300000;

// Keep the process alive
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    process.exit(0);
  });
});

export default app;
