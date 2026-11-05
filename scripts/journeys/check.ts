/**
 * Every reference a journey or a workshop names resolves: the gate behind
 * `check:journey-refs`.
 *
 * @module scripts/journeys/check
 * @covers user-scenario, workshop, building-blocks
 *
 * ## One resolver, two readers
 *
 * The journeys viewer draws a reference that resolves to nothing as
 * unresolved, so a reader sees it; this check fails on it, so a pull request
 * does. Both read the checkout through {@link readJourneyCorpus} and resolve
 * an edge with the same functions (`lookup`, `blockFor`, `journeyById`,
 * `requirementFor`, `processElementIds`, `instanceFile`, and the viewer's
 * `siteLinks` for an ArchiMate view), so what the page draws as resolved is
 * exactly what passes here. There is no second resolver to drift.
 *
 * ## What is checked
 *
 * | a journey names | it must resolve to |
 * |---|---|
 * | `personas`, a step's `lead`, `experiences[].actor`, `handoff.from`/`to`, `illustrationStyle.cast[].actor` | an actor (`scenarios` directory, `actors/<id>.json`), the journey's own instance first |
 * | `stories` | a user story (`stories.json` of a `scenarios` directory) |
 * | `realisedBy[].process` | a BPMN file, relative to the instance root |
 * | `realisedBy[].tasks` | an element id in that file |
 * | `uses[].block` | a block of a catalogue in a directory declaring `building-blocks` |
 * | `requirements`, `preconditions[].requirements` | a `req:` node |
 * | `examples` | an entry of a `fhir-artifact-index` |
 * | `illustration.src` | a file, relative to the instance root |
 * | `follows`, `partOf` | a journey |
 * | `trustLadder`, `record.state` | a code list in a `code-list` directory, and a code of it |
 * | `views` | a view of a model the instance's ArchiMate config names |
 *
 * | a workshop names | it must resolve to |
 * |---|---|
 * | `scenarios` | a journey |
 * | `steps[]` `{scenario, step}` | that journey, and a step of it |
 * | `discussion[].steps`, `resources[].steps` (`<scenario>#<step>`) | the same |
 *
 * A file of either kind that does not parse is a finding too: the viewer
 * reports it and draws nothing of it, so nothing of it was checked.
 *
 * Exit 0 every reference resolves (or the checkout declares no journey and no
 * workshop, which is said); 1 a reference does not; 2 the checkout's
 * declarations could not be read, which is not a pass.
 */
import { siteLinks } from "../gen-journeys-viz.ts";
import {
  blockFor,
  instanceFile,
  journeyById,
  lookup,
  processElementIds,
  readJourneyCorpus,
  requirementFor,
  type JourneyCorpus,
} from "./read.ts";

/** One reference that does not resolve, or one file that would not parse. */
export interface RefFinding {
  instance: string;
  /** Instance-relative file. */
  file: string;
  /** Where in the file: `step P3`, `steps[2]`, `(root)`. */
  at: string;
  message: string;
}

export interface RefReport {
  journeys: number;
  workshops: number;
  /** References examined, resolved or not. */
  references: number;
  findings: RefFinding[];
  /** Set when the checkout's declarations could not be read: the report is NOT a pass. */
  undetermined?: string;
}

/** Check every journey and workshop of a corpus. */
export function checkJourneyRefs(corpus: JourneyCorpus): RefReport {
  const findings: RefFinding[] = corpus.problems.map((p) => ({ instance: p.instance, file: p.file, at: "(root)", message: `does not parse: ${p.message}` }));
  let references = 0;
  const archimate = siteLinks(corpus, "journeys", "journeys").archimateView;

  for (const j of corpus.journeys) {
    const sc = j.scenario;
    const add = (at: string, message: string) => findings.push({ instance: j.instance, file: j.file, at, message });
    const ref = (ok: boolean, at: string, message: string) => {
      references++;
      if (!ok) add(at, message);
    };
    const actor = (id: string, at: string, field: string) =>
      ref(lookup(corpus.actors, j.instance, id) !== undefined, at, `${field} "${id}" is no actor (actors/${id}.json in a declared scenarios directory)`);

    for (const p of sc.personas) actor(p, "(root)", "persona");
    if (sc.follows !== undefined) ref(journeyById(corpus, j.instance, sc.follows) !== undefined, "(root)", `follows "${sc.follows}", which is no journey in this checkout`);
    if (sc.partOf !== undefined) ref(journeyById(corpus, j.instance, sc.partOf) !== undefined, "(root)", `partOf "${sc.partOf}", which is no journey in this checkout`);
    const ladder = sc.trustLadder === undefined ? undefined : lookup(corpus.ladders, j.instance, sc.trustLadder);
    if (sc.trustLadder !== undefined) ref(ladder !== undefined, "(root)", `trustLadder "${sc.trustLadder}" is no code list in a declared code-list directory`);
    for (const v of sc.views ?? []) {
      ref(archimate?.(j.instance, v.model, v.view) !== undefined, "(root)", `view "${v.view}" of model "${v.model}" is not in the instance's ArchiMate config`);
    }
    for (const c of sc.illustrationStyle?.cast ?? []) actor(c.actor, "(root)", "illustrationStyle.cast actor");

    for (const s of sc.steps) {
      const at = `step ${s.id}`;
      actor(s.lead, at, "lead");
      for (const x of s.experiences) actor(x.actor, at, "experience actor");
      if (s.handoff?.from !== undefined) actor(s.handoff.from, at, "handoff.from");
      if (s.handoff?.to !== undefined) actor(s.handoff.to, at, "handoff.to");
      for (const id of s.stories ?? []) ref(lookup(corpus.stories, j.instance, id) !== undefined, at, `story "${id}" is in no stories.json of a declared scenarios directory`);
      for (const r of s.realisedBy ?? []) {
        const ids = processElementIds(corpus, j.instance, r.process);
        ref(ids !== undefined, at, `realisedBy process "${r.process}" is no file of instance ${j.instance}`);
        if (ids === undefined) continue;
        for (const t of r.tasks ?? []) ref(ids.has(t), at, `realisedBy task "${t}" is no element of ${r.process}`);
      }
      for (const u of s.uses ?? []) ref(blockFor(corpus, j.instance, u.block) !== undefined, at, `uses block "${u.block}", which no building-blocks catalogue in a declared directory holds`);
      for (const id of [...(s.requirements ?? []), ...(s.preconditions ?? []).flatMap((p) => p.requirements ?? [])]) {
        ref(requirementFor(corpus, id) !== undefined, at, `requirement "${id}" is no req: node in this checkout`);
      }
      for (const k of s.examples ?? []) ref(corpus.examples.has(k), at, `FHIR example "${k}" is in no declared fhir-artifact-index`);
      if (s.record !== undefined && ladder !== undefined) {
        ref(ladder.some((c) => c.code === s.record!.state), at, `record.state "${s.record.state}" is no code of trust ladder ${sc.trustLadder}`);
      }
      const src = s.illustration?.src;
      if (src !== undefined) ref(instanceFile(corpus, j.instance, src) !== undefined, at, `illustration.src "${src}" is no file of instance ${j.instance}`);
    }
  }

  for (const w of corpus.workshops) {
    const ws = w.workshop;
    const add = (at: string, message: string) => findings.push({ instance: w.instance, file: w.file, at, message });
    const stepRef = (scenario: string, step: string, at: string) => {
      references++;
      const j = journeyById(corpus, w.instance, scenario);
      if (j === undefined) add(at, `scenario "${scenario}" is no journey in this checkout`);
      else if (!j.scenario.steps.some((x) => x.id === step)) add(at, `step "${step}" is no step of journey ${scenario} (${j.instance}/${j.file})`);
    };
    const hashRef = (r: string, at: string) => {
      const i = r.indexOf("#");
      if (i <= 0) {
        references++;
        add(at, `step ref "${r}" is not <scenario>#<step>`);
      } else stepRef(r.slice(0, i), r.slice(i + 1), at);
    };
    ws.scenarios.forEach((id, i) => {
      references++;
      if (journeyById(corpus, w.instance, id) === undefined) add(`scenarios[${i}]`, `scenario "${id}" is no journey in this checkout`);
    });
    (ws.steps ?? []).forEach((s, i) => stepRef(s.scenario, s.step, `steps[${i}]`));
    for (const d of ws.discussion ?? []) for (const r of d.steps ?? []) hashRef(r, `discussion ${d.id}`);
    for (const r of ws.resources ?? []) for (const x of r.steps ?? []) hashRef(x, `resource ${r.id}`);
  }

  return {
    journeys: corpus.journeys.length,
    workshops: corpus.workshops.length,
    references,
    findings,
    ...(corpus.undetermined !== undefined ? { undetermined: corpus.undetermined } : {}),
  };
}

/** Check the checkout `start` is in. */
export function checkJourneyRefsAt(start: string): RefReport {
  return checkJourneyRefs(readJourneyCorpus(start));
}
