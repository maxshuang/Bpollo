import { spawn, type ChildProcess } from "child_process"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(__dirname, "../..")

export interface ServiceHandle {
  kill: () => void
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError  = ""
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch (e) {
      lastError = String(e)
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`Service at ${url} did not become healthy within ${timeoutMs}ms. Last error: ${lastError}`)
}

/**
 * Spawn a service using tsx from the repo root.
 * Waits until the health endpoint returns 200.
 */
export async function spawnService(
  relativeEntry: string,
  env: Record<string, string>,
  healthUrl: string,
  readyTimeoutMs = 40_000,
): Promise<ServiceHandle> {
  const tsxBin   = resolve(REPO_ROOT, "node_modules/.bin/tsx")
  const entry    = resolve(REPO_ROOT, relativeEntry)

  const proc: ChildProcess = spawn(tsxBin, [entry], {
    env:   { ...process.env, NODE_ENV: "test", ...env },
    stdio: ["ignore", "pipe", "pipe"],
    cwd:   REPO_ROOT,
  })

  // Forward service logs with a prefix so they're visible in test output
  const prefix = `[${relativeEntry.split("/")[1]}]`
  proc.stdout?.on("data", (d: Buffer) => process.stdout.write(`${prefix} ${d}`))
  proc.stderr?.on("data", (d: Buffer) => process.stderr.write(`${prefix} ${d}`))

  proc.on("error", (err) => {
    throw new Error(`Failed to spawn ${relativeEntry}: ${err.message}`)
  })

  await waitForHealth(healthUrl, readyTimeoutMs)

  return {
    kill: () => { proc.kill("SIGTERM") },
  }
}
