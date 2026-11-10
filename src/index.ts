import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'healthy', 
    service: 'grist-mailchimp-sync',
    timestamp: new Date().toISOString() 
  });
});

app.listen(port, () => {
  console.log(`[Sync Microservice] Infrastructure layer online and listening on port ${port}`);
});
