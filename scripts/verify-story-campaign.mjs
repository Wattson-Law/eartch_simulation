import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const tempDir = await mkdtemp(join(tmpdir(), 'eartch-story-campaign-'));
const typesSource = await readFile(new URL('../src/sim/types.ts', import.meta.url), 'utf8');
const campaignSource = await readFile(new URL('../src/sim/campaign.ts', import.meta.url), 'utf8');
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: true,
  },
}).outputText;
await writeFile(join(tempDir, 'types.mjs'), transpile(typesSource), 'utf8');
await writeFile(
  join(tempDir, 'campaign.mjs'),
  transpile(campaignSource.replace("from './types'", "from './types.mjs'")),
  'utf8',
);
const campaign = await import(pathToFileURL(join(tempDir, 'campaign.mjs')).href);
await rm(tempDir, { recursive: true, force: true });

const {
  CASCADE_RECOVERY_DAYS,
  advanceCampaign,
  applyCampaignDecision,
  classifyCampaignOutcome,
  createCampaignState,
  isCascadeSafe,
} = campaign;

const safeMetrics = {
  grass: 4200,
  shrubs: 1800,
  rabbits: 320,
  elk: 180,
  wolves: 32,
  fire: false,
};

function runDays(initial, metrics, count) {
  let state = initial;
  const events = [];
  for (let i = 0; i < count; i += 1) {
    const result = advanceCampaign(state, metrics);
    state = result.campaign;
    if (result.event) events.push(result.event);
  }
  return { state, events };
}

let state = createCampaignState();
assert.equal(state.day, 1, 'campaign opens on Day 1');
assert.equal(state.act, 'alarm', 'opening day is the alarm act');
assert.equal(state.outcome, null, 'opening has no outcome');

let result = advanceCampaign(state, safeMetrics);
assert.equal(result.campaign.day, 2, 'one tick advances exactly one story day');

const toDay30 = runDays(state, safeMetrics, 29);
assert.equal(toDay30.state.day, 30, 'day 30 boundary is reachable');
assert.deepEqual(toDay30.events, ['blizzard'], 'blizzard fires once at day 30');
const afterBlizzard = advanceCampaign(toDay30.state, safeMetrics);
assert.equal(afterBlizzard.event, null, 'blizzard does not replay on day 31');

const toDay60 = runDays(toDay30.state, safeMetrics, 30);
assert.equal(toDay60.state.day, 60, 'day 60 boundary is reachable');
assert.deepEqual(toDay60.events, ['wildfire'], 'wildfire fires once at day 60');
const afterWildfire = advanceCampaign(toDay60.state, { ...safeMetrics, fire: true });
assert.equal(afterWildfire.event, null, 'wildfire does not replay after its boundary');

const decisionState = createCampaignState();
const accepted = applyCampaignDecision(decisionState, 'introduce_wolves');
assert.equal(accepted.accepted, true, 'first campaign decision is accepted');
assert.equal(accepted.campaign.decisions.introduce_wolves, 1, 'decision is recorded once');
const repeated = applyCampaignDecision(accepted.campaign, 'introduce_wolves');
assert.equal(repeated.accepted, false, 'same decision is idempotently rejected');
assert.equal(repeated.campaign.decisions.introduce_wolves, 1, 'repeated decision does not stack');
const isolated = applyCampaignDecision(decisionState, 'isolate_fire');
assert.equal(isolated.campaign.firebreakPrepared, true, 'isolation prepares the day 60 firebreak');

assert.equal(isCascadeSafe(safeMetrics), true, 'safe wolf pressure starts the cascade streak');
let recovery = createCampaignState();
for (let i = 0; i < CASCADE_RECOVERY_DAYS; i += 1) {
  recovery = advanceCampaign(recovery, safeMetrics).campaign;
}
assert.equal(recovery.cascadeSafeDays, CASCADE_RECOVERY_DAYS, 'cascade requires twenty consecutive safe days');
assert.equal(recovery.vegetation, 'lush', 'twenty safe days switch vegetation to lush');
const brokenStreak = advanceCampaign(recovery, { ...safeMetrics, wolves: 12 }).campaign;
assert.equal(brokenStreak.cascadeSafeDays, 0, 'unsafe pressure resets the streak');

const endingBase = {
  ...recovery,
  day: 100,
  completed: false,
  vegetation: 'lush',
  cascadeSafeDays: CASCADE_RECOVERY_DAYS,
  decisions: { feed_forage: 1, introduce_wolves: 1, isolate_fire: 1 },
  eventDays: { blizzard: 30, wildfire: 60 },
};
assert.equal(
  classifyCampaignOutcome(safeMetrics, endingBase),
  'green_miracle',
  'healthy cascade with isolation receives the green miracle ending',
);
assert.equal(
  classifyCampaignOutcome({ ...safeMetrics, wolves: 70 }, endingBase),
  'wolves_overrun',
  'excessive wolf pressure receives the wolf overload ending',
);
assert.equal(
  classifyCampaignOutcome({ ...safeMetrics, grass: 400, shrubs: 200 }, endingBase),
  'desertification',
  'collapsed vegetation receives the desertification ending',
);
assert.equal(
  classifyCampaignOutcome(safeMetrics, {
    ...endingBase,
    decisions: { feed_forage: 1, introduce_wolves: 0, isolate_fire: 0 },
  }),
  'balanced_recovery',
  'a stable but incomplete intervention receives the balanced recovery ending',
);

const balancedStart = applyCampaignDecision(createCampaignState(), 'feed_forage').campaign;
const fullRun = runDays(balancedStart, safeMetrics, 99);
assert.equal(fullRun.state.day, 100, 'a fresh campaign reaches day 100 after ninety-nine daily steps');
assert.equal(fullRun.state.completed, true, 'the fresh campaign completes exactly once');
assert.equal(fullRun.state.outcome, 'balanced_recovery', 'the full safe path produces the balanced recovery ending');
assert.deepEqual(fullRun.events, ['blizzard', 'wildfire'], 'the full path emits the two fixed events in order');
assert.deepEqual(fullRun.state.eventDays, { blizzard: 30, wildfire: 60 }, 'the full path records both event days');

let completed = endingBase;
for (let i = completed.day; i < 105; i += 1) {
  completed = advanceCampaign(completed, safeMetrics).campaign;
}
assert.equal(completed.day, 100, 'completed campaign clamps at day 100');
assert.equal(completed.completed, true, 'day 100 produces one stable completion state');

console.log('story campaign verification passed: fixed events, one-shot decisions, 20-day cascade, and deterministic endings');
