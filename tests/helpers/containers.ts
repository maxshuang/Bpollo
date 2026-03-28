import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers"
import { KafkaContainer, type StartedKafkaContainer } from "@testcontainers/kafka"
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"

export type { StartedTestContainer, StartedKafkaContainer, StartedPostgreSqlContainer }

// The external (client-facing) port exposed by the testcontainers Kafka image
const KAFKA_EXTERNAL_PORT = 9093

export async function startRedis(): Promise<StartedTestContainer> {
  return new GenericContainer("redis:7-alpine")
    .withExposedPorts(6379)
    .withCommand(["redis-server", "--save", "", "--appendonly", "no"])
    .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
    .start()
}

export async function startKafka(): Promise<StartedKafkaContainer> {
  return new KafkaContainer("confluentinc/cp-kafka:7.6.0")
    .withKraft()
    .start()
}

export async function startPostgres(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("bpollo")
    .withUsername("bpollo")
    .withPassword("bpollo")
    .start()
}

export function redisUrl(container: StartedTestContainer): string {
  return `redis://localhost:${container.getMappedPort(6379)}`
}

/** Returns "host:port" broker string for kafkajs */
export function kafkaBrokers(container: StartedKafkaContainer): string {
  return `${container.getHost()}:${container.getMappedPort(KAFKA_EXTERNAL_PORT)}`
}

export function postgresUrl(container: StartedPostgreSqlContainer): string {
  return container.getConnectionUri()
}
