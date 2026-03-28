export const config = {
  port:        Number(process.env.PORT ?? 3005),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://bpollo:bpollo@localhost:5432/bpollo",
} as const
