import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { householdRouter } from './routes/household';
import { shoppingRouter } from './routes/shopping';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/households', householdRouter);
app.use('/api/shopping', shoppingRouter);

app.listen(PORT, () => {
  console.log(`Veckis backend running on port ${PORT}`);
});
