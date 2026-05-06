import 'dotenv/config';
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

if(!process.env.DATABASE_URL) {
  throw new Error("Database_URL is not defined in .env file");
}
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle({ client: pool });
