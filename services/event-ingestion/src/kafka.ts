import { Kafka } from "kafkajs";
import { config } from "./config.js";

const kafka = new Kafka({
  clientId: "event-ingestion",
  brokers: config.kafkaBrokers,
});

export const producer = kafka.producer();

export async function connectProducer() {
  await producer.connect();
}

export async function disconnectProducer() {
  await producer.disconnect();
}
