import Redis from "ioredis"
import { config } from "./config.js"
import { logger } from "./logger.js"

export const redis = new Redis(config.redisUrl, {
  lazyConnect:         true,
  enableAutoPipelining: true,
})

redis.on("error", (err) => logger.error({ err }, "redis error"))

/** Key: event_type → Set of watch_ids that have an event_match condition for it */
export function watchIndexKey(eventType: string): string {
  return `watch_index:${eventType}`
}

/**
 * Index a watch's event_match trigger conditions into Redis.
 * Called when a watch is created or re-activated.
 */
export async function indexWatch(watchId: string, eventTypes: string[]): Promise<void> {
  if (eventTypes.length === 0) return
  const pipeline = redis.pipeline()
  for (const et of eventTypes) {
    pipeline.sadd(watchIndexKey(et), watchId)
    // TTL is managed by the expiry sweep; 7 days max safety net
    pipeline.expire(watchIndexKey(et), 7 * 24 * 3600)
  }
  await pipeline.exec()
}

/**
 * Remove a watch from all event_type index sets.
 */
export async function deindexWatch(watchId: string, eventTypes: string[]): Promise<void> {
  if (eventTypes.length === 0) return
  const pipeline = redis.pipeline()
  for (const et of eventTypes) {
    pipeline.srem(watchIndexKey(et), watchId)
  }
  await pipeline.exec()
}

/**
 * Look up which watch_ids are registered for a given event_type.
 */
export async function lookupWatches(eventType: string): Promise<string[]> {
  return redis.smembers(watchIndexKey(eventType))
}
