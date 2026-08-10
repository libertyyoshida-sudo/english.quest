import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
import questionsRouter from './routes/questions.js';
import playerRouter from './routes/player.js';
import battleRouter from './routes/battle.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/player', playerRouter);
app.use('/api/battle', battleRouter);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`⚔️ Language Quest Backend API Server running at http://localhost:${PORT}`);
});
