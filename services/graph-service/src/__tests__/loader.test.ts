import { describe, it, expect } from "vitest"
import { writeFileSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { loadGraph } from "../graph/loader.js"

const TEST_YAML = `
version: "1.0"
name: "Test Graph"
nodes:
  - id: step_a
    label: Step A
    event_type: event.a
    description: "First step"
    llm_description: "LLM description for step A"
    sla_hours: 24
    downstream:
      - node: step_b
        label: Step B
        sla_hours: 48
      - node: step_c
        label: Step C
        sla_hours: null

  - id: step_b
    label: Step B
    event_type: event.b
    description: "Second step"
    llm_description: "LLM description for step B"
    sla_hours: 48
    downstream:
      - node: step_c
        label: Step C
        sla_hours: 24

  - id: step_c
    label: Step C
    event_type: null
    description: "Terminal step"
    llm_description: "LLM description for step C"
    sla_hours: null
    downstream: []
`

let yamlPath: string
let tmpDir: string

function writeTempYaml(content: string): string {
  tmpDir = join(tmpdir(), `bpollo-test-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
  yamlPath = join(tmpDir, "test.yaml")
  writeFileSync(yamlPath, content, "utf8")
  return yamlPath
}

describe("loadGraph", () => {
  it("parses graph name and version", () => {
    const { graph } = loadGraph(writeTempYaml(TEST_YAML))
    expect(graph.name).toBe("Test Graph")
    expect(graph.version).toBe("1.0")
  })

  it("loads all nodes", () => {
    const { graph } = loadGraph(yamlPath)
    expect(graph.nodes).toHaveLength(3)
  })

  it("builds byId index for all nodes", () => {
    const { index } = loadGraph(yamlPath)
    expect(index.byId.has("step_a")).toBe(true)
    expect(index.byId.has("step_b")).toBe(true)
    expect(index.byId.has("step_c")).toBe(true)
    expect(index.byId.size).toBe(3)
  })

  it("maps event_type to node in byEventType index", () => {
    const { index } = loadGraph(yamlPath)
    expect(index.byEventType.get("event.a")?.id).toBe("step_a")
    expect(index.byEventType.get("event.b")?.id).toBe("step_b")
  })

  it("does not index nodes with null event_type", () => {
    const { index } = loadGraph(yamlPath)
    expect(index.byEventType.has("null")).toBe(false)
    expect(index.byEventType.size).toBe(2) // only event.a and event.b
  })

  it("builds correct upstreamOf index", () => {
    const { index } = loadGraph(yamlPath)
    // step_b is downstream of step_a → step_a is upstream of step_b
    expect(index.upstreamOf.get("step_b")).toContain("step_a")
    // step_c is downstream of both step_a and step_b
    const upstreamC = index.upstreamOf.get("step_c") ?? []
    expect(upstreamC).toContain("step_a")
    expect(upstreamC).toContain("step_b")
    // step_a has no upstream
    expect(index.upstreamOf.get("step_a")).toEqual([])
  })

  it("includes downstream edges with sla_hours on node", () => {
    const { index } = loadGraph(yamlPath)
    const stepA = index.byId.get("step_a")!
    expect(stepA.downstream).toHaveLength(2)
    const edgeToB = stepA.downstream.find((e) => e.node === "step_b")
    expect(edgeToB?.sla_hours).toBe(48)
    const edgeToC = stepA.downstream.find((e) => e.node === "step_c")
    expect(edgeToC?.sla_hours).toBeNull()
  })

  it("terminal node has empty downstream", () => {
    const { index } = loadGraph(yamlPath)
    const stepC = index.byId.get("step_c")!
    expect(stepC.downstream).toHaveLength(0)
  })

  it("throws on missing YAML file", () => {
    expect(() => loadGraph("/nonexistent/path/graph.yaml")).toThrow()
  })
})
