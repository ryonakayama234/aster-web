import { useRef, useState } from "react";

import { AGENT_RECIPE_ID, AsterClient } from "./api/client";
import { isTerminal, type JobBundle, type Recipe } from "./api/contracts";

const DEFAULT_SERVICE_URL = "http://127.0.0.1:8765";

function App() {
  const [serviceUrl, setServiceUrl] = useState(DEFAULT_SERVICE_URL);
  const [token, setToken] = useState("");
  const [connection, setConnection] = useState<"idle" | "connecting" | "ready" | "error">("idle");
  const [connectionMessage, setConnectionMessage] = useState("未接続");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [bundle, setBundle] = useState<JobBundle | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const clientRef = useRef<AsterClient | null>(null);
  const generationRef = useRef(0);

  async function connect() {
    generationRef.current += 1;
    setBusy(false);
    setConnection("connecting");
    setConnectionMessage("Service契約を確認中…");
    setRunError(null);
    try {
      const client = new AsterClient(serviceUrl, token);
      const [capabilities, availableRecipes] = await Promise.all([
        client.capabilities(),
        client.recipes(),
      ]);
      if (!capabilities.includes("agent.run")) {
        throw new Error("Aster Service does not expose agent.run");
      }
      const agentRecipe = availableRecipes.find((recipe) => recipe.recipe_id === AGENT_RECIPE_ID);
      if (agentRecipe === undefined || agentRecipe.kind !== "agent") {
        throw new Error(`${AGENT_RECIPE_ID} is not available`);
      }
      if (agentRecipe.input_names.length !== 0 || agentRecipe.parameter_names.length !== 0) {
        throw new Error("Fixed Agent recipe contract does not match aster-web");
      }
      clientRef.current = client;
      setRecipes(availableRecipes);
      setConnection("ready");
      setConnectionMessage("接続済み — agent.run / fixed recipe確認済み");
    } catch (error) {
      clientRef.current = null;
      setRecipes([]);
      setConnection("error");
      setConnectionMessage(message(error));
    }
  }

  async function runAgent() {
    const client = clientRef.current;
    if (client === null) {
      setRunError("先にAster Serviceへ接続してください。");
      return;
    }
    if (busy) return;

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setBusy(true);
    setBundle(null);
    setActiveJobId(null);
    setRunError(null);

    try {
      const jobId = await client.startAgent();
      if (generation !== generationRef.current) return;
      setActiveJobId(jobId);

      while (generation === generationRef.current) {
        const next = await client.job(jobId);
        if (generation !== generationRef.current) return;
        setBundle(next);
        if (isTerminal(next.job.status)) return;
        await delay(900);
      }
    } catch (error) {
      if (generation === generationRef.current) {
        setRunError(message(error));
      }
    } finally {
      if (generation === generationRef.current) {
        setBusy(false);
      }
    }
  }

  const agentRecipe = recipes.find((recipe) => recipe.recipe_id === AGENT_RECIPE_ID);
  const summary = bundle?.agent?.summary ?? null;

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">ASTER / AGENT CONSOLE</p>
          <h1>実行して、状態変化を観測する。</h1>
          <p className="lede">
            最初の縦切りは固定calculate-and-store。WebはAsterの実測trajectoryを表示し、評価を作り直しません。
          </p>
        </div>
        <span className={`status-dot status-${connection}`}>{connectionMessage}</span>
      </header>

      <section className="panel connection-panel">
        <div className="panel-heading">
          <div>
            <p className="section-label">CONNECTION</p>
            <h2>Aster Service</h2>
          </div>
        </div>
        <div className="connection-grid">
          <label>
            Service URL
            <input
              value={serviceUrl}
              onChange={(event) => setServiceUrl(event.target.value)}
              spellCheck={false}
            />
          </label>
          <label>
            Bearer token
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Service起動時の接続キー"
              autoComplete="off"
            />
          </label>
          <button className="secondary" onClick={connect} disabled={connection === "connecting" || busy}>
            {connection === "connecting" ? "確認中…" : "Connect"}
          </button>
        </div>
        <p className="hint">tokenはこのページのReact stateだけに保持し、localStorageへ保存しません。</p>
      </section>

      <section className="panel run-panel">
        <div className="panel-heading split">
          <div>
            <p className="section-label">RUN</p>
            <h2>{AGENT_RECIPE_ID}</h2>
            <p>{agentRecipe?.description ?? "Service接続後にrecipeを検査します。"}</p>
          </div>
          <button className="primary" onClick={runAgent} disabled={connection !== "ready" || busy}>
            {busy ? "Running…" : "Run Aster"}
          </button>
        </div>
        <div className="facts">
          <Fact label="Job ID" value={activeJobId ?? "—"} />
          <Fact label="Run ID" value={bundle?.job.run_id ?? "—"} />
          <Fact label="Job status" value={bundle?.job.status ?? "—"} />
          <Fact label="Task success" value={summary === null ? "—" : String(summary.task_success ?? "—")} />
        </div>
        {runError !== null && <p className="error">{runError}</p>}
        {bundle?.job.error !== undefined && <p className="error">{bundle.job.error}</p>}
      </section>

      <section className="workspace">
        <div className="panel timeline-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">TRAJECTORY</p>
              <h2>Action → Observation → State</h2>
            </div>
          </div>
          {bundle?.agent === null || bundle?.agent === undefined ? (
            <Empty text="Agent evidenceはまだありません。Runを開始するとpersist済みtrajectoryを表示します。" />
          ) : (
            <ol className="timeline">
              {bundle.agent.trajectory.map((transition) => {
                const actionName = transition.action.name ?? transition.action.kind;
                return (
                  <li key={transition.step} className="step-card">
                    <div className="step-title">
                      <span>STEP {transition.step}</span>
                      <strong>{actionName}</strong>
                      <span className={transition.observation.ok ? "ok" : "bad"}>
                        {transition.observation.ok ? "execution ok" : "execution failed"}
                      </span>
                    </div>
                    <div className="step-grid">
                      <Evidence title="Action" value={transition.action} />
                      <Evidence title="Observation" value={transition.observation} />
                      <Evidence title="State before" value={transition.state_before} />
                      <Evidence title="State after" value={transition.state_after} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <aside className="panel evidence-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">EVALUATION</p>
              <h2>Canonical evidence</h2>
            </div>
          </div>
          {bundle?.agent === null || bundle?.agent === undefined ? (
            <Empty text="evaluationはAster側でpersist済みtrajectoryから生成されます。" />
          ) : (
            <>
              <Evidence title="Summary" value={bundle.agent.summary} />
              <Evidence title="Final memory" value={bundle.agent.final_memory} />
              <Evidence title="Evaluation artifact" value={bundle.agent.evaluation} />
            </>
          )}
        </aside>
      </section>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Evidence({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="evidence">
      <h3>{title}</h3>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default App;
