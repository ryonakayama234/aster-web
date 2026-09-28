import {
  parseAcceptedJob,
  parseCapabilities,
  parseJobBundle,
  parseRecipes,
  type JobBundle,
  type Recipe,
} from "./contracts";

const AGENT_RECIPE_ID = "agent-calculate-store-v0";

export class AsterClient {
  readonly baseUrl: string;
  readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
    if (!this.baseUrl.startsWith("http://127.0.0.1:") && !this.baseUrl.startsWith("http://localhost:")) {
      throw new Error("Initial aster-web only connects to localhost Aster Service");
    }
    if (this.token.length === 0) {
      throw new Error("Bearer token is required");
    }
  }

  async capabilities(signal?: AbortSignal): Promise<string[]> {
    return parseCapabilities(await this.request("/capabilities", { signal }));
  }

  async recipes(signal?: AbortSignal): Promise<Recipe[]> {
    return parseRecipes(await this.request("/recipes", { signal }));
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
