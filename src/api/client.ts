import {
  parseAcceptedJob,
  parseCapabilities,
  parseExperimentBundle,
  parseExperimentIndex,
  parseJobBundle,
  parseRecipes,
  type ExperimentBundle,
  type ExperimentSummary,
  type JobBundle,
  type Recipe,
} from "./contracts";

const AGENT_RECIPE_ID = "agent-calculate-store-v0";

export class AsterClient {
  readonly baseUrl: string;
  readonly token: string;

  constructor(baseUrl: string, token: string) {
    const url = new URL(baseUrl);
    const isLocalhost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (
      url.protocol !== "http:" ||
      !isLocalhost ||
      url.username.length !== 0 ||
      url.password.length !== 0 ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search.length !== 0 ||
      url.hash.length !== 0
    ) {
      throw new Error("Initial aster-web only connects to a plain localhost Aster Service origin");
    }
    if (token.length === 0) {
      throw new Error("Bearer token is required");
    }
    this.baseUrl = url.origin;
    this.token = token;
  }

  async capabilities(signal?: AbortSignal): Promise<string[]> {
    return parseCapabilities(await this.request("/capabilities", { signal }));
  }

  async recipes(signal?: AbortSignal): Promise<Recipe[]> {
    return parseRecipes(await this.request("/recipes", { signal }));
  }

  async experiments(signal?: AbortSignal): Promise<ExperimentSummary[]> {
    return parseExperimentIndex(await this.request("/experiments", { signal }));
  }

  async experiment(experimentId: string, signal?: AbortSignal): Promise<ExperimentBundle> {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(experimentId)) {
      throw new Error("Invalid experiment ID");
    }
    return parseExperimentBundle(
      await this.request(`/experiments/${experimentId}`, { signal }),
    );
  }

  async startAgent(signal?: AbortSignal): Promise<string> {
    const body = {
      schema_version: "aster-job-spec-0",
      kind: "agent",
      recipe_id: AGENT_RECIPE_ID,
      inputs: {},
      parameters: {},
    };
    return parseAcceptedJob(
      await this.request("/jobs", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  async job(jobId: string, signal?: AbortSignal): Promise<JobBundle> {
    if (!/^[0-9a-f]{32}$/.test(jobId)) {
      throw new Error("Invalid Job ID");
    }
    return parseJobBundle(await this.request(`/jobs/${jobId}`, { signal }));
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : `Aster Service returned HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload;
  }
}

export { AGENT_RECIPE_ID };
