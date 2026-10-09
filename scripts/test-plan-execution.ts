/**
 * Test plan execution engine — dynamically resolves and evaluates per-plan
 * exit criteria DMN tables (bean `folio-assistant-4iey`, follow-up from `3o5b`).
 *
 * `test-plan/v1` allows a plan to declare its own `exitCriteria.decision`
 * table reference (e.g. `path/to/custom.dmn#Decision_Custom`).
 * `GW_ExitCriteria` in `processes/sdlc/test-plan-execution.bpmn` evaluates that
 * decision table dynamically rather than always using the platform default.
 *
 * Rules:
 * 1. If `plan.exitCriteria` names a decision table, resolve it dynamically
 *    relative to provided bases (instance root, workflow directory, etc.).
 * 2. If unresolvable (file does not exist, malformed reference, or decision
 *    not found in the DMN), return state "unknown" / could-not-determine and
 *    route the gateway to "undetermined". NEVER silently fall back to the default!
 * 3. When specified and resolvable, evaluate using that table and route
 *    by the table's outcomes.
 *
 * @module scripts/test-plan-execution
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadDecisionTable, evaluate, type DecisionTable } from "../src/workflow/decision-table.js";
import { complete, type InstanceState, type AuthzOptions } from "../src/workflow/instance.js";
import type { ProcessModel } from "../src/workflow/process-model.js";
import type { TestPlan } from "@litlfred/cat-harness/schemas/test-plan.js";

export interface ResolvedPlanDmn {
  ok: true;
  table: DecisionTable;
  ref: string;
}

export interface UnresolvedPlanDmn {
  ok: false;
  error: string;
  ref: string;
  state: "unknown";
}

export type ResolvePlanDmnResult = ResolvedPlanDmn | UnresolvedPlanDmn;

export interface PlanExitCriteriaEvaluation {
  outcome: string;
  rule?: string;
  ruleDescription?: string;
  state?: "unknown";
  table?: DecisionTable;
  note: string;
}

/**
 * Resolve the DMN decision table named by `plan.exitCriteria.decision`.
 *
 * Resolves against candidate base directories.
 * Returns `{ ok: true, table, ref }` when found and parsed.
 * Returns `{ ok: false, error, ref, state: "unknown" }` when unresolvable.
 */
export async function resolvePlanExitCriteriaDmn(
  plan: TestPlan | { exitCriteria?: { decision?: string } },
  bases: readonly string[],
): Promise<ResolvePlanDmnResult> {
  const ref = plan.exitCriteria?.decision;
  if (!ref) {
    return {
      ok: false,
      error: "Plan carries no exitCriteria.decision",
      ref: "",
      state: "unknown",
    };
  }

  const [file, decisionId] = ref.split("#");
  if (!file || !decisionId) {
    return {
      ok: false,
      error: `Malformed DMN reference "${ref}": expected "file.dmn#Decision_Id"`,
      ref,
      state: "unknown",
    };
  }

  for (const base of bases) {
    const candidate = resolve(base, file);
    if (!existsSync(candidate)) continue;
    try {
      const table = await loadDecisionTable(candidate, decisionId);
      return { ok: true, table, ref };
    } catch (e) {
      return {
        ok: false,
        error: `Failed to load decision "${decisionId}" from ${candidate}: ${e instanceof Error ? e.message : String(e)}`,
        ref,
        state: "unknown",
      };
    }
  }

  return {
    ok: false,
    error: `DMN file "${file}" not found in bases: ${bases.join(", ")}`,
    ref,
    state: "unknown",
  };
}

/**
 * Evaluate facts against the plan's exit criteria decision table.
 *
 * If the table is unresolvable, returns `outcome: "undetermined"`, `state: "unknown"`.
 * It NEVER silently falls back to the default!
 */
export async function evaluatePlanExitCriteria(
  plan: TestPlan | { exitCriteria?: { decision?: string } },
  facts: Record<string, unknown>,
  bases: readonly string[],
): Promise<PlanExitCriteriaEvaluation> {
  const resolution = await resolvePlanExitCriteriaDmn(plan, bases);
  if (!resolution.ok) {
    return {
      outcome: "undetermined",
      state: "unknown",
      note: `could-not-determine: exitCriteria "${resolution.ref}" unresolvable (${resolution.error})`,
    };
  }

  const result = evaluate(resolution.table, facts);
  return {
    outcome: String(result.outcome),
    rule: result.rule,
    ruleDescription: result.ruleDescription,
    table: resolution.table,
    note: `${resolution.table.id} → ${result.outcome} by ${result.rule}` +
      (result.ruleDescription ? ` (${result.ruleDescription})` : ""),
  };
}

/**
 * Complete the GW_ExitCriteria gateway using the plan's own decision table.
 *
 * If the plan's table is resolvable, evaluates it and routes by its outcome.
 * If unresolvable, routes to "undetermined" (could-not-determine, state: "unknown"),
 * NEVER silently falling back to the default table.
 */
export async function completeExitCriteriaGateway(
  model: ProcessModel,
  state: InstanceState,
  plan: TestPlan | { exitCriteria?: { decision?: string } },
  facts: Record<string, unknown>,
  bases: readonly string[],
  opts: { actor?: string; authz?: AuthzOptions } = {},
): Promise<InstanceState> {
  const resolution = await resolvePlanExitCriteriaDmn(plan, bases);
  if (!resolution.ok) {
    return complete(model, state, "GW_ExitCriteria", {
      decisionTable: null,
      decisionTableError: resolution.error,
      facts,
      actor: opts.actor,
      authz: opts.authz,
      note: `could-not-determine: exitCriteria "${resolution.ref}" unresolvable (${resolution.error})`,
    });
  }

  return complete(model, state, "GW_ExitCriteria", {
    decisionTable: resolution.table,
    facts,
    actor: opts.actor,
    authz: opts.authz,
  });
}
