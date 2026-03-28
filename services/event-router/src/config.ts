export const config = {
  healthPort: Number(process.env.HEALTH_PORT ?? 3003),
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
  inboundTopic: process.env.KAFKA_INBOUND_TOPIC ?? "bpollo.events.raw",
  graphTopic: process.env.KAFKA_GRAPH_TOPIC ?? "bpollo.events.graph",
  patternTopic: process.env.KAFKA_PATTERN_TOPIC ?? "bpollo.events.pattern",
  watchTopic: process.env.KAFKA_WATCH_TOPIC ?? "bpollo.events.watch",
  consumerGroup: process.env.KAFKA_CONSUMER_GROUP ?? "event-router",
} as const;
