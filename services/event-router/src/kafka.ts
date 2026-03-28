import { Kafka, type Producer, type Consumer } from "kafkajs";
import { config } from "./config.js";

const kafka = new Kafka({
  clientId: "event-router",
  brokers: config.kafkaBrokers,
});

export const producer: Producer = kafka.producer();
export const consumer: Consumer = kafka.consumer({
  groupId: config.consumerGroup,
});

export async function connect() {
  await producer.connect();
  await consumer.connect();
}

export async function disconnect() {
  await consumer.disconnect();
  await producer.disconnect();
}
