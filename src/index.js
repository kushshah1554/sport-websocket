import express from 'express';
import "dotenv/config";
import { matchRouter } from './routes/matches.js';

const app = express();
const port = 8000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello from express server!');
});

app.use('/matches', matchRouter);

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});                       