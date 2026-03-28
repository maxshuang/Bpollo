export const config = {
  port: Number(process.env.PORT ?? 3006),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://bpollo:bpollo@localhost:5432/bpollo",
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
  kafkaTriggeredTopic:
    process.env.KAFKA_TRIGGERED_TOPIC ?? "bpollo.watches.triggered",
  consumerGroup: process.env.KAFKA_CONSUMER_GROUP ?? "llm-orchestrator",
  // Upstream service URLs
  graphServiceUrl: process.env.GRAPH_SERVICE_URL ?? "http://localhost:3002",
  watchManagerUrl: process.env.WATCH_MANAGER_URL ?? "http://localhost:3004",
  alertServiceUrl: process.env.ALERT_SERVICE_URL ?? "http://localhost:3005",
  // LLM
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "claude-opus-4-6",
  // Max steps the agent may take per reasoning cycle
  agentMaxSteps: Number(process.env.AGENT_MAX_STEPS ?? 5),
  // Watch extension limits
  maxExtensionDays: Number(process.env.MAX_EXTENSION_DAYS ?? 7),
  maxExtensions: Number(process.env.MAX_EXTENSIONS ?? 3),
  // Alert rate limit: max 1 alert per entity per window (ms)
  alertRateLimitMs: Number(process.env.ALERT_RATE_LIMIT_MS ?? 3_600_000),
  // Max spawn depth for child watches
  maxSpawnDepth: Number(process.env.MAX_SPAWN_DEPTH ?? 3),
} as const;
