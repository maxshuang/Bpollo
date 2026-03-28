import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "../config.js";

const sql = postgres(config.databaseUrl);
export const db = drizzle(sql);
