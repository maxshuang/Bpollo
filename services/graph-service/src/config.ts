export const config = {
  port: Number(process.env.PORT ?? 3002),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://bpollo:bpollo@localhost:5432/bpollo",
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
  kafkaTopic: process.env.KAFKA_TOPIC ?? "bpollo.events.graph",
  consumerGroup: process.env.KAFKA_CONSUMER_GROUP ?? "graph-service",
  graphYamlPath:
    process.env.GRAPH_YAML_PATH ??
    new URL("../graph/global.yaml", import.meta.url).pathname,
} as const;
