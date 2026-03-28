import { drizzle } from "drizzle-orm/postgres-js"
import postgresJs from "postgres"
import { config } from "../config.js"
import * as schema from "./schema.js"

const sql = postgresJs(config.databaseUrl)
export const db = drizzle(sql, { schema })
