import app from './app';
import { connectDB } from './config/db';
import { env } from './config/env';

connectDB()
  .then(() => app.listen(env.PORT, () => console.log(`Server running on http://localhost:${env.PORT}`)))
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
