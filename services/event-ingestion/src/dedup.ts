import Redis from "ioredis"
import { config } from "./config.js"

const redis = new Redis(config.redisUrl)

export async function isDuplicate(eventId: string): Promise<boolean> {
  const key = `dedup:${eventId}`
  const result = await redis.set(key, "1", "EX", config.dedupTtlSec, "NX")
  return result === null // null means key already existed
}

export async function disconnectRedis() {
  await redis.quit()
}
