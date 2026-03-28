export const config = {
  port: Number(process.env.PORT ?? 3001),
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
  kafkaTopic: process.env.KAFKA_TOPIC ?? "bpollo.events.raw",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  dedupTtlSec: Number(process.env.DEDUP_TTL_SEC ?? 86400), // 24h
};
