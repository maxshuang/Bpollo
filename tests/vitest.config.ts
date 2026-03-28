import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals:     true,
    environment: "node",
    testTimeout: 180_000,  // containers take time to start
    hookTimeout: 180_000,
    pool:        "forks",
    poolOptions: {
      forks: { singleFork: true }, // reuse containers across tests in a file
    },
  },
})
