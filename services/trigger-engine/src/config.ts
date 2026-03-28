export const config = {
  port: Number(process.env.PORT ?? 3006),
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
  kafkaTopic: process.env.KAFKA_INBOUND_TOPIC ?? "bpollo.events.pattern",
  consumerGroup: process.env.KAFKA_CONSUMER_GROUP ?? "trigger-engine",
  graphServiceUrl: process.env.GRAPH_SERVICE_URL ?? "http://localhost:3002",
  watchManagerUrl: process.env.WATCH_MANAGER_URL ?? "http://localhost:3004",
} as const;
