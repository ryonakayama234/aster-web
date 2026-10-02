import { useRef, useState } from "react";

import { AGENT_RECIPE_ID, AsterClient } from "./api/client";
import {
  isTerminal,
  type ExperimentArm,
  type ExperimentBundle,
  type ExperimentCase,
  type ExperimentSummary,
  type JobBundle,
  type Recipe,
} from "./api/contracts";

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
  const [experimentSummaries, setExperimentSummaries] = useState<ExperimentSummary[]>([]);
  const [experiment, setExperiment] = useState<ExperimentBundle | null>(null);
  const [leftArmId, setLeftArmId] = useState("");
  const [rightArmId, setRightArmId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [observatoryBusy, setObservatoryBusy] = useState(false);
  const [observatoryError, setObservatoryError] = useState<string | null>(null);
  const clientRef = useRef<AsterClient | null>(null);
  const generationRef = useRef(0);

  async function connect() {
    generationRef.current += 1;
    setBusy(false);
    setConnection("connecting");
    setConnectionMessage("Service契約を確認中…");
    setRunError(null);
    setObservatoryError(null);
    setExperimentSummaries([]);
    setExperiment(null);
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

      let summaries: ExperimentSummary[] = [];
      let firstExperiment: ExperimentBundle | null = null;
      if (capabilities.includes("research.observe")) {
        summaries = await client.experiments();
        if (summaries.length > 0) {
          firstExperiment = await client.experiment(summaries[0].experiment_id);
        }
      }

      clientRef.current = client;
      setRecipes(availableRecipes);
      setExperimentSummaries(summaries);
      if (firstExperiment !== null) {
        applyExperiment(firstExperiment);
      }
      setConnection("ready");
      setConnectionMessage(
        capabilities.includes("research.observe")
          ? "接続済み — agent.run / research.observe確認済み"
          : "接続済み — agent.run確認済み（research.observe未提供）",
      );
    } catch (error) {
      clientRef.current = null;
      setRecipes([]);
      setExperimentSummaries([]);
      setExperiment(null);
      setConnection("error");
      setConnectionMessage(message(error));
    }
  }

  function applyExperiment(next: ExperimentBundle) {
    setExperiment(next);
    const first = next.arms[0] ?? null;
    const second =
      (first === null
        ? null
        : next.arms.find((arm) => arm.arm_id !== first.arm_id && arm.seed === first.seed)) ??
      next.arms[1] ??
      first;
    const nextLeft = first?.arm_id ?? "";
    const nextRight = second?.arm_id ?? "";
    setLeftArmId(nextLeft);
    setRightArmId(nextRight);
    setCaseId(defaultCaseId(next, nextLeft, nextRight));
  }

  async function loadExperiment(experimentId: string) {
    const client = clientRef.current;
    if (client === null || observatoryBusy) return;
    setObservatoryBusy(true);
    setObservatoryError(null);
    try {
      applyExperiment(await client.experiment(experimentId));
    } catch (error) {
      setObservatoryError(message(error));
    } finally {
      setObservatoryBusy(false);
    }
  }

  function chooseLeftArm(armId: string) {
    setLeftArmId(armId);
    if (experiment !== null) {
      setCaseId(defaultCaseId(experiment, armId, rightArmId));
    }
  }

  function chooseRightArm(armId: string) {
    setRightArmId(armId);
    if (experiment !== null) {
      setCaseId(defaultCaseId(experiment, leftArmId, armId));
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
  const leftArm = experiment?.arms.find((arm) => arm.arm_id === leftArmId) ?? null;
  const rightArm = experiment?.arms.find((arm) => arm.arm_id === rightArmId) ?? null;
  const sharedCases = sharedCaseIds(leftArm, rightArm);
  const leftCase = leftArm?.cases.find((item) => item.case_id === caseId) ?? null;
  const rightCase = rightArm?.cases.find((item) => item.case_id === caseId) ?? null;

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">ASTER / AGENT CONSOLE</p>
          <h1>実行して、失敗の証拠まで辿る。</h1>
          <p className="lede">
            Agent Runと保存済みDecision研究を同じServiceから観測します。WebはAsterのcanonical evidenceを表示し、
            評価やscoreを作り直しません。
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

      <section className="panel research-panel">
        <div className="panel-heading split">
          <div>
            <p className="section-label">RESEARCH OBSERVATORY</p>
            <h2>Saved Decision evidence</h2>
            <p>
              保存済みreportの公開projectionだけを読みます。欠損値は未取得のまま表示し、Webでは補完しません。
            </p>
          </div>
          {experimentSummaries.length > 0 && (
            <label className="compact-select">
              Experiment
              <select
                value={experiment?.experiment_id ?? ""}
                disabled={observatoryBusy}
                onChange={(event) => void loadExperiment(event.target.value)}
              >
                {experimentSummaries.map((item) => (
                  <option key={item.experiment_id} value={item.experiment_id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {observatoryError !== null && <p className="error">{observatoryError}</p>}
        {experiment === null ? (
          <Empty text="research.observe対応Serviceへ接続すると、保存済み実験をここに表示します。" />
        ) : (
          <>
            <div className="facts research-facts">
              <Fact label="Experiment" value={experiment.experiment_id} />
              <Fact label="Arms" value={String(experiment.arms.length)} />
              <Fact label="Curve" value={leftArm?.learning_curve_status ?? "—"} />
              <Fact label="Test" value={leftArm?.test_status ?? "—"} />
            </div>

            <div className="research-controls">
              <label>
                Left arm
                <select value={leftArmId} onChange={(event) => chooseLeftArm(event.target.value)}>
                  {experiment.arms.map((arm) => (
                    <option key={arm.arm_id} value={arm.arm_id}>
                      {arm.arm_id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Right arm
                <select value={rightArmId} onChange={(event) => chooseRightArm(event.target.value)}>
                  {experiment.arms.map((arm) => (
                    <option key={arm.arm_id} value={arm.arm_id}>
                      {arm.arm_id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Shared case
                <select value={caseId} onChange={(event) => setCaseId(event.target.value)}>
                  {sharedCases.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="compare-grid">
              <CaseEvidence title="LEFT" arm={leftArm} item={leftCase} />
              <CaseEvidence title="RIGHT" arm={rightArm} item={rightCase} />
            </div>

            <div className="research-meta">
              <Evidence title="Canonical provenance" value={experiment.evidence} />
              <Evidence title="Scope" value={{ scope: experiment.scope, limitations: experiment.limitations }} />
            </div>
          </>
        )}
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

function CaseEvidence({
  title,
  arm,
  item,
}: {
  title: string;
  arm: ExperimentArm | null;
  item: ExperimentCase | null;
}) {
  if (arm === null || item === null) {
    return (
      <div className="compare-card">
        <p className="section-label">{title}</p>
        <Empty text="同じcaseの保存済み証拠がありません。" />
      </div>
    );
  }
  return (
    <div className="compare-card">
      <p className="section-label">{title}</p>
      <h3>{arm.arm_id}</h3>
      <div className="mini-facts">
        <Fact label="Correct" value={String(item.correct)} />
        <Fact label="Slice" value={item.slice} />
        <Fact label="Seed" value={String(arm.seed)} />
        <Fact label="Scores" value={item.candidate_scores_status} />
      </div>
      <Evidence title="Target action" value={item.target_action} />
      <Evidence title="Selected action" value={item.selected_action} />
      <Evidence title="Target candidate serialization" value={item.target_candidate_serialization} />
      <Evidence title="Target tokenization" value={item.target_tokenization} />
      <Evidence
        title="Candidate scores"
        value={
          item.candidate_scores === null
            ? { status: item.candidate_scores_status }
            : item.candidate_scores
        }
      />
      <Evidence
        title="Arm summary"
        value={{
          checkpoint_id: arm.checkpoint_id,
          source_run_id: arm.source_run_id,
          tokenizer_sha256: arm.tokenizer_sha256,
          suite_sha256: arm.suite_sha256,
          learning_curve_status: arm.learning_curve_status,
          summary: arm.summary,
        }}
      />
    </div>
  );
}

function defaultCaseId(bundle: ExperimentBundle, leftArmId: string, rightArmId: string): string {
  const left = bundle.arms.find((arm) => arm.arm_id === leftArmId) ?? null;
  const right = bundle.arms.find((arm) => arm.arm_id === rightArmId) ?? null;
  const shared = sharedCaseIds(left, right);
  if (left !== null) {
    const firstFailure = left.cases.find((item) => !item.correct && shared.includes(item.case_id));
    if (firstFailure !== undefined) return firstFailure.case_id;
  }
  return shared[0] ?? "";
}

function sharedCaseIds(left: ExperimentArm | null, right: ExperimentArm | null): string[] {
  if (left === null || right === null) return [];
  const rightIds = new Set(right.cases.map((item) => item.case_id));
  return left.cases.map((item) => item.case_id).filter((id) => rightIds.has(id));
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
