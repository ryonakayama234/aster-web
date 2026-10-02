import { describe, expect, it } from "vitest";

import { isTerminal, parseExperimentBundle, parseExperimentIndex, parseJobBundle, parseRecipes } from "./contracts";

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
  it("parses saved research evidence without inventing missing scores", () => {
    const index = parseExperimentIndex({
      schema_version: "aster-experiment-index-0",
      experiments: [
        {
          experiment_id: "decision-failure-audit-v0",
          title: "Decision failure audit v0",
          schema_version: "aster-experiment-bundle-0",
          arm_count: 2,
          case_scope: "phase-zero shared tokenization cases",
          learning_curve_status: "unavailable_from_committed_evidence",
        },
      ],
    });
    expect(index[0].arm_count).toBe(2);

    const arm = {
      arm_id: "seed-42--eight-fixed",
      seed: 42,
      training_arm: "eight-fixed",
      checkpoint_id: "decision_fit:abc",
      source_run_id: "a".repeat(32),
      audit_run_id: "b".repeat(32),
      suite_sha256: "c".repeat(64),
      tokenizer_sha256: "d".repeat(64),
      model_update: false,
      new_inference: false,
      test_status: "sealed",
      summary: { correct_by_slice: { key_shift: 1 } },
      learning_curve: null,
      learning_curve_status: "unavailable_from_committed_evidence",
      cases: [
        {
          case_id: "subtract/numbers/phase-0/delay-0",
          slice: "numeric_shift",
          target_action: { kind: "tool", name: "calculator", arguments: {} },
          selected_action: { kind: "tool", name: "memory.get", arguments: {} },
          correct: false,
          target_candidate_serialization: "{...}",
          target_tokenization: {
            token_ids: [512, 453, 513],
            pieces: ["<bos>", "...", "<eos>"],
            length: 3,
            unseen_in_anchor_token_occurrences: 1,
          },
          candidate_scores: null,
          candidate_scores_status: "unavailable_from_committed_evidence",
        },
      ],
    };
    const bundle = parseExperimentBundle({
      schema_version: "aster-experiment-bundle-0",
      experiment_id: "decision-failure-audit-v0",
      title: "Decision failure audit v0",
      evidence: { source_sha256: "e".repeat(64) },
      scope: "saved evidence",
      limitations: ["scores unavailable"],
      comparison: { case_join: "case_id" },
      arms: [arm, { ...arm, arm_id: "seed-42--eight-shuffle", training_arm: "eight-shuffle" }],
    });

    expect(bundle.arms[0].cases[0].correct).toBe(false);
    expect(bundle.arms[0].cases[0].candidate_scores).toBeNull();
    expect(bundle.arms[0].cases[0].target_tokenization.token_ids).toEqual([512, 453, 513]);
  });

});
