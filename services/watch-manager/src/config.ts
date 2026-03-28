export const config = {
  port: Number(process.env.PORT ?? 3004),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://bpollo:bpollo@localhost:5432/bpollo",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
  kafkaTopic: process.env.KAFKA_TOPIC ?? "bpollo.events.watch",
  consumerGroup: process.env.KAFKA_CONSUMER_GROUP ?? "watch-manager",
} as const;
