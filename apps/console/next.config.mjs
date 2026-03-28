/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    GRAPH_SERVICE_URL: process.env.GRAPH_SERVICE_URL ?? "http://localhost:3002",
  },
}

export default nextConfig
