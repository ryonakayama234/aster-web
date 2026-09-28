import { describe, expect, it } from "vitest";

import { isTerminal, parseJobBundle, parseRecipes } from "./contracts";

describe("service contract parsing", () => {
  it("keeps Job and Run identities distinct and parses Agent evidence", () => {
    const bundle = parseJobBundle({
      schema_version: "aster-service-job-bundle-0",
      job: {
        job_id: "a".repeat(32),
        run_id: "b".repeat(32),
        status: "completed",
        kind: "agent",
        recipe_id: "agent-calculate-store-v0",
      },
      run: {
        schema_version: "aster-run-0",
        run_id: "b".repeat(32),
        kind: "agent",
        status: "completed",
      },
      events: [],
      outputs: {},
      agent: {
        schema_version: "aster-agent-bundle-0",
        recipe_id: "agent-calculate-store-v0",
        policy_id: "rule-calculate-store-v0",
        task: { kind: "calculate_and_store" },
        trajectory: [
          {
            schema_version: "aster-transition-0",
            step: 0,
            state_before: { memory: {} },
            available_actions: ["calculator", "memory.put", "memory.get", "stop"],
            action: {
              kind: "tool",
              name: "calculator",
              arguments: { operation: "add", left: 40, right: 2 },
            },
            observation: { accepted: true, ok: true, output: 42, error: null },
            state_after: { memory: {} },
            evaluation: { goal_satisfied: false },
          },
        ],
        evaluation: { schema_version: "aster-episode-evaluation-0" },
        final_memory: { total: 42 },
        summary: { task_success: true, steps: 4 },
      },
    });

    expect(bundle.job.job_id).not.toBe(bundle.job.run_id);
    expect(bundle.agent?.trajectory[0].observation.output).toBe(42);
    expect(bundle.agent?.trajectory[0].state_after.memory).toEqual({});
    expect(bundle.agent?.final_memory).toEqual({ total: 42 });
    expect(isTerminal(bundle.job.status)).toBe(true);
  });

  it("rejects an unknown response schema instead of guessing", () => {
    expect(() =>
      parseRecipes({ schema_version: "aster-recipes-999", recipes: [] }),
    ).toThrow(/unsupported schema/);
  });

  it("only treats explicit terminal states as terminal", () => {
    expect(isTerminal("accepted")).toBe(false);
    expect(isTerminal("running")).toBe(false);
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("interrupted")).toBe(true);
  });
});
