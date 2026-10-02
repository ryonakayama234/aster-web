export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JobStatus = "accepted" | "running" | "completed" | "failed" | "interrupted";

export interface Recipe {
  recipe_id: string;
  kind: string;
  input_names: string[];
  parameter_names: string[];
  description: string;
}

export interface JobSummary {
  job_id: string;
  run_id: string | null;
  status: JobStatus;
  kind: string;
  recipe_id: string;
  error?: string;
}

export interface AgentTransition {
  schema_version: "aster-transition-0";
  step: number;
  state_before: Record<string, JsonValue>;
  available_actions: string[];
  action: {
    kind: string;
    name: string | null;
    arguments: Record<string, JsonValue>;
  };
  observation: {
    accepted: boolean;
    ok: boolean;
    output: JsonValue;
    error: Record<string, JsonValue> | null;
  };
  state_after: Record<string, JsonValue>;
  evaluation: Record<string, JsonValue>;
}

export interface AgentBundle {
  schema_version: "aster-agent-bundle-0";
  recipe_id: string;
  policy_id: string;
  task: Record<string, JsonValue>;
  trajectory: AgentTransition[];
  evaluation: Record<string, JsonValue>;
  final_memory: Record<string, JsonValue>;
  summary: Record<string, JsonValue>;
}

export interface JobBundle {
  schema_version: "aster-service-job-bundle-0";
  job: JobSummary;
  run: Record<string, JsonValue> | null;
  events: JsonValue[];
  agent: AgentBundle | null;
}

export interface ExperimentSummary {
  experiment_id: string;
  title: string;
  schema_version: "aster-experiment-bundle-0";
  arm_count: number;
  case_scope: string;
  learning_curve_status: string;
}

export interface ExperimentCase {
  case_id: string;
  slice: string;
  target_action: Record<string, JsonValue>;
  selected_action: Record<string, JsonValue>;
  correct: boolean;
  target_candidate_serialization: string;
  target_tokenization: {
    token_ids: number[];
    pieces: string[];
    length: number;
    unseen_in_anchor_token_occurrences: number;
  };
  candidate_scores: JsonValue;
  candidate_scores_status: string;
}

export interface ExperimentArm {
  arm_id: string;
  seed: number;
  training_arm: string;
  checkpoint_id: string;
  source_run_id: string;
  audit_run_id: string;
  suite_sha256: string;
  tokenizer_sha256: string;
  model_update: boolean;
  new_inference: boolean;
  test_status: string;
  summary: Record<string, JsonValue>;
  learning_curve: JsonValue;
  learning_curve_status: string;
  cases: ExperimentCase[];
}

export interface ExperimentBundle {
  schema_version: "aster-experiment-bundle-0";
  experiment_id: string;
  title: string;
  evidence: Record<string, JsonValue>;
  scope: string;
  limitations: string[];
  comparison: Record<string, JsonValue>;
  arms: ExperimentArm[];
}

const JOB_STATUSES = new Set<JobStatus>([
  "accepted",
  "running",
  "completed",
  "failed",
  "interrupted",
]);

export function parseCapabilities(value: unknown): string[] {
  const data = object(value, "capabilities response");
  schema(data, "aster-capabilities-0");
  return stringArray(data.capabilities, "capabilities");
}

export function parseRecipes(value: unknown): Recipe[] {
  const data = object(value, "recipes response");
  schema(data, "aster-recipes-0");
  if (!Array.isArray(data.recipes)) {
    throw new Error("recipes must be an array");
  }
  return data.recipes.map((item, index) => {
    const recipe = object(item, `recipes[${index}]`);
    return {
      recipe_id: string(recipe.recipe_id, `recipes[${index}].recipe_id`),
      kind: string(recipe.kind, `recipes[${index}].kind`),
      input_names: stringArray(recipe.input_names, `recipes[${index}].input_names`),
      parameter_names: stringArray(recipe.parameter_names, `recipes[${index}].parameter_names`),
      description: string(recipe.description, `recipes[${index}].description`),
    };
  });
}

export function parseAcceptedJob(value: unknown): string {
  const data = object(value, "job response");
  return string(data.job_id, "job_id");
}

export function parseJobBundle(value: unknown): JobBundle {
  const data = object(value, "job bundle");
  schema(data, "aster-service-job-bundle-0");
  const jobData = object(data.job, "job");
  const rawStatus = string(jobData.status, "job.status");
  if (!JOB_STATUSES.has(rawStatus as JobStatus)) {
    throw new Error(`unsupported job status: ${rawStatus}`);
  }
  const runId = jobData.run_id;
  if (runId !== null && typeof runId !== "string") {
    throw new Error("job.run_id must be string or null");
  }
  const job: JobSummary = {
    job_id: string(jobData.job_id, "job.job_id"),
    run_id: runId,
    status: rawStatus as JobStatus,
    kind: string(jobData.kind, "job.kind"),
    recipe_id: string(jobData.recipe_id, "job.recipe_id"),
  };
  if (jobData.error !== undefined) {
    job.error = string(jobData.error, "job.error");
  }

  const run = data.run === null ? null : jsonObject(data.run, "run");
  if (!Array.isArray(data.events)) {
    throw new Error("events must be an array");
  }
  const agentValue = data.agent ?? object(data.outputs, "outputs").agent ?? null;

  return {
    schema_version: "aster-service-job-bundle-0",
    job,
    run,
    events: data.events.map((event, index) => json(event, `events[${index}]`)),
    agent: agentValue === null ? null : parseAgentBundle(agentValue),
  };
}

export function parseAgentBundle(value: unknown): AgentBundle {
  const data = object(value, "agent bundle");
  schema(data, "aster-agent-bundle-0");
  if (!Array.isArray(data.trajectory)) {
    throw new Error("agent.trajectory must be an array");
  }
  return {
    schema_version: "aster-agent-bundle-0",
    recipe_id: string(data.recipe_id, "agent.recipe_id"),
    policy_id: string(data.policy_id, "agent.policy_id"),
    task: jsonObject(data.task, "agent.task"),
    trajectory: data.trajectory.map(parseTransition),
    evaluation: jsonObject(data.evaluation, "agent.evaluation"),
    final_memory: jsonObject(data.final_memory, "agent.final_memory"),
    summary: jsonObject(data.summary, "agent.summary"),
  };
}

export function parseExperimentIndex(value: unknown): ExperimentSummary[] {
  const data = object(value, "experiment index");
  schema(data, "aster-experiment-index-0");
  if (!Array.isArray(data.experiments)) {
    throw new Error("experiments must be an array");
  }
  return data.experiments.map((item, index) => {
    const experiment = object(item, `experiments[${index}]`);
    if (experiment.schema_version !== "aster-experiment-bundle-0") {
      throw new Error(`unsupported experiment bundle schema at experiments[${index}]`);
    }
    return {
      experiment_id: string(experiment.experiment_id, `experiments[${index}].experiment_id`),
      title: string(experiment.title, `experiments[${index}].title`),
      schema_version: "aster-experiment-bundle-0",
      arm_count: number(experiment.arm_count, `experiments[${index}].arm_count`),
      case_scope: string(experiment.case_scope, `experiments[${index}].case_scope`),
      learning_curve_status: string(
        experiment.learning_curve_status,
        `experiments[${index}].learning_curve_status`,
      ),
    };
  });
}

export function parseExperimentBundle(value: unknown): ExperimentBundle {
  const data = object(value, "experiment bundle");
  schema(data, "aster-experiment-bundle-0");
  if (!Array.isArray(data.arms)) {
    throw new Error("experiment.arms must be an array");
  }
  return {
    schema_version: "aster-experiment-bundle-0",
    experiment_id: string(data.experiment_id, "experiment.experiment_id"),
    title: string(data.title, "experiment.title"),
    evidence: jsonObject(data.evidence, "experiment.evidence"),
    scope: string(data.scope, "experiment.scope"),
    limitations: stringArray(data.limitations, "experiment.limitations"),
    comparison: jsonObject(data.comparison, "experiment.comparison"),
    arms: data.arms.map(parseExperimentArm),
  };
}

function parseExperimentArm(value: unknown, index: number): ExperimentArm {
  const data = object(value, `experiment.arms[${index}]`);
  if (!Array.isArray(data.cases)) {
    throw new Error(`experiment.arms[${index}].cases must be an array`);
  }
  return {
    arm_id: string(data.arm_id, `experiment.arms[${index}].arm_id`),
    seed: number(data.seed, `experiment.arms[${index}].seed`),
    training_arm: string(data.training_arm, `experiment.arms[${index}].training_arm`),
    checkpoint_id: string(data.checkpoint_id, `experiment.arms[${index}].checkpoint_id`),
    source_run_id: string(data.source_run_id, `experiment.arms[${index}].source_run_id`),
    audit_run_id: string(data.audit_run_id, `experiment.arms[${index}].audit_run_id`),
    suite_sha256: string(data.suite_sha256, `experiment.arms[${index}].suite_sha256`),
    tokenizer_sha256: string(data.tokenizer_sha256, `experiment.arms[${index}].tokenizer_sha256`),
    model_update: boolean(data.model_update, `experiment.arms[${index}].model_update`),
    new_inference: boolean(data.new_inference, `experiment.arms[${index}].new_inference`),
    test_status: string(data.test_status, `experiment.arms[${index}].test_status`),
    summary: jsonObject(data.summary, `experiment.arms[${index}].summary`),
    learning_curve: json(data.learning_curve, `experiment.arms[${index}].learning_curve`),
    learning_curve_status: string(
      data.learning_curve_status,
      `experiment.arms[${index}].learning_curve_status`,
    ),
    cases: data.cases.map((item, caseIndex) => parseExperimentCase(item, index, caseIndex)),
  };
}

function parseExperimentCase(value: unknown, armIndex: number, caseIndex: number): ExperimentCase {
  const label = `experiment.arms[${armIndex}].cases[${caseIndex}]`;
  const data = object(value, label);
  const tokenization = object(data.target_tokenization, `${label}.target_tokenization`);
  return {
    case_id: string(data.case_id, `${label}.case_id`),
    slice: string(data.slice, `${label}.slice`),
    target_action: jsonObject(data.target_action, `${label}.target_action`),
    selected_action: jsonObject(data.selected_action, `${label}.selected_action`),
    correct: boolean(data.correct, `${label}.correct`),
    target_candidate_serialization: string(
      data.target_candidate_serialization,
      `${label}.target_candidate_serialization`,
    ),
    target_tokenization: {
      token_ids: numberArray(tokenization.token_ids, `${label}.target_tokenization.token_ids`),
      pieces: stringArray(tokenization.pieces, `${label}.target_tokenization.pieces`),
      length: number(tokenization.length, `${label}.target_tokenization.length`),
      unseen_in_anchor_token_occurrences: number(
        tokenization.unseen_in_anchor_token_occurrences,
        `${label}.target_tokenization.unseen_in_anchor_token_occurrences`,
      ),
    },
    candidate_scores: json(data.candidate_scores, `${label}.candidate_scores`),
    candidate_scores_status: string(
      data.candidate_scores_status,
      `${label}.candidate_scores_status`,
    ),
  };
}

export function isTerminal(status: JobStatus): boolean {
  return status === "completed" || status === "failed" || status === "interrupted";
}

function parseTransition(value: unknown, index: number): AgentTransition {
  const data = object(value, `trajectory[${index}]`);
  schema(data, "aster-transition-0");
  const action = object(data.action, `trajectory[${index}].action`);
  const observation = object(data.observation, `trajectory[${index}].observation`);
  const name = action.name;
  if (name !== null && typeof name !== "string") {
    throw new Error(`trajectory[${index}].action.name must be string or null`);
  }
  return {
    schema_version: "aster-transition-0",
    step: number(data.step, `trajectory[${index}].step`),
    state_before: jsonObject(data.state_before, `trajectory[${index}].state_before`),
    available_actions: stringArray(data.available_actions, `trajectory[${index}].available_actions`),
    action: {
      kind: string(action.kind, `trajectory[${index}].action.kind`),
      name,
      arguments: jsonObject(action.arguments, `trajectory[${index}].action.arguments`),
    },
    observation: {
      accepted: boolean(observation.accepted, `trajectory[${index}].observation.accepted`),
      ok: boolean(observation.ok, `trajectory[${index}].observation.ok`),
      output: json(observation.output, `trajectory[${index}].observation.output`),
      error:
        observation.error === null
          ? null
          : jsonObject(observation.error, `trajectory[${index}].observation.error`),
    },
    state_after: jsonObject(data.state_after, `trajectory[${index}].state_after`),
    evaluation: jsonObject(data.evaluation, `trajectory[${index}].evaluation`),
  };
}

function schema(data: Record<string, unknown>, expected: string): void {
  if (data.schema_version !== expected) {
    throw new Error(`unsupported schema: expected ${expected}`);
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function numberArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    throw new Error(`${label} must be a finite number array`);
  }
  return [...value];
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be a string array`);
  }
  return [...value];
}

function jsonObject(value: unknown, label: string): Record<string, JsonValue> {
  const data = object(value, label);
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(data)) {
    result[key] = json(item, `${label}.${key}`);
  }
  return result;
}

function json(value: unknown, label: string): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => json(item, `${label}[${index}]`));
  }
  if (typeof value === "object" && value !== null) {
    return jsonObject(value, label);
  }
  throw new Error(`${label} is not valid JSON`);
}
