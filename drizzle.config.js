import "dotenv/config";
import { defineConfig } from "drizzle-kit";

console.log("DB URL:", process.env.DATABASE_URL); 

if(!process.env.DATABASE_URL) {
  throw new Error("Database_URL is not defined in .env file");
}

export default defineConfig({
  schema: "./src/DataBase/schema.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});