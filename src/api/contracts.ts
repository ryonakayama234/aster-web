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
