import type { Season } from '../sim/types';
import { SEASON_LABELS } from '../sim/types';
import {
  WILDLIFE_ACTIVITY_LABELS,
  WILDLIFE_LABELS,
  type WildlifeActivity,
  type WildlifeKind,
  type WildlifeObservation,
} from '../sim/wildlife';
import { DAY_PHASE_LABELS, type SceneDayPhase } from './sceneEnvironment';

interface NarrativeStatus {
  kind: WildlifeKind;
  activity: WildlifeActivity;
  moving: boolean;
}

interface Props {
  season: Season;
  dayPhase: SceneDayPhase;
  observation: WildlifeObservation;
  statuses: NarrativeStatus[];
  tick: number;
  paused: boolean;
}

interface StoryStep {
  id: SceneDayPhase;
  label: string;
  title: string;
  body: string;
}

const STORY_STEPS: readonly StoryStep[] = [
  {
    id: 'dawn',
    label: '清晨',
    title: '雾从河面退去',
    body: '光线刚越过山脊，草丛里的动静比脚印更早被发现。',
  },
  {
    id: 'morning',
    label: '上午',
    title: '第一口嫩草',
    body: '赤鹿把取食路线压在河岸边，野兔仍贴着高草移动。',
  },
  {
    id: 'noon',
    label: '中午',
    title: '水边的停顿',
    body: '热气被河流带走，三位代表个体各自守住一段距离。',
  },
  {
    id: 'evening',
    label: '傍晚',
    title: '林缘巡线',
    body: '光线变暖，灰狼沿熟悉的边界检查气味与脚印。',
  },
  {
    id: 'night',
    label: '夜间',
    title: '草丛收声',
    body: '星光接管谷地，移动变少，呼吸和水声成为主要线索。',
  },
] as const;

const PHASE_ORDER: readonly SceneDayPhase[] = STORY_STEPS.map((step) => step.id);

const ACTIVITY_PRIORITY: readonly WildlifeActivity[] = [
  'caught',
  'feed',
  'pounce',
  'chase',
  'flee',
  'stalk',
  'drink',
  'graze',
  'hide',
  'emerge',
  'sit',
  'alert',
  'roam',
  'rest',
];

const SEASON_SCENE_NOTES: Readonly<Record<Season, string>> = {
  spring: '融雪后的嫩芽让河岸重新有了取食路线。',
  summer: '长日照把活动推向有水和阴影的边缘。',
  autumn: '变凉的风把脚印和气味留在更开阔的地面。',
  winter: '雪线压低了活动范围，动物更依赖熟悉的掩体。',
};

function quietCue(dayPhase: SceneDayPhase) {
  return STORY_STEPS.find((step) => step.id === dayPhase) ?? STORY_STEPS[2]!;
}

function activeStatus(statuses: NarrativeStatus[]) {
  return statuses
    .filter((status) => status.activity !== 'rest')
    .sort(
      (a, b) => ACTIVITY_PRIORITY.indexOf(a.activity) - ACTIVITY_PRIORITY.indexOf(b.activity),
    )[0];
}

function narrativeCue(observation: WildlifeObservation, dayPhase: SceneDayPhase, season: Season) {
  if (observation.phase === 'stalk') {
    return {
      kicker: '现场转折',
      title: '草丛里的低身影',
      body: '灰狼压低身体沿林缘接近猎物；这是观察与判断，还没有进入追逐。',
    };
  }
  if (observation.phase === 'chase') {
    return {
      kicker: '短促事件',
      title: '一段突然的奔跑',
      body: '猎物突然加速，只有这一段允许出现奔跑；其余时间，河谷回到慢速节奏。',
    };
  }
  if (observation.phase === 'caught') {
    return {
      kicker: '捕食余波',
      title: '高草边缘短暂停住',
      body: '捕食在草边停住，猎物保持倒地静止，随后由草丛遮住细节，现场重新安静。',
    };
  }
  if (observation.phase === 'escaped') {
    return {
      kicker: '恢复距离',
      title: '藏入掩体以后',
      body: '猎物进入高草，灰狼放慢脚步；紧张没有扩散到整条河谷。',
    };
  }
  const step = quietCue(dayPhase);
  return { kicker: DAY_PHASE_LABELS[dayPhase], title: step.title, body: `${step.body}${SEASON_SCENE_NOTES[season]}` };
}

export function FieldNarrative({ season, dayPhase, observation, statuses, tick, paused }: Props) {
  const cue = narrativeCue(observation, dayPhase, season);
  const currentIndex = Math.max(0, PHASE_ORDER.indexOf(dayPhase));
  const focus = activeStatus(statuses);
  const focusText = focus
    ? `${WILDLIFE_LABELS[focus.kind]} · ${WILDLIFE_ACTIVITY_LABELS[focus.activity]}`
    : '三位代表个体保持距离';

  return (
    <section className="field-story" aria-label="巡护故事线">
      <div className="field-story__main">
        <div className="field-story__kicker">
          <span className="field-story__dot" aria-hidden="true" />
          巡护故事线 · {SEASON_LABELS[season]} · T{tick}
          {paused && <span className="field-story__paused">已暂停</span>}
        </div>
        <h3>{cue.title}</h3>
        <p>{cue.body}</p>
        <div className="field-story__focus">
          <span>观察焦点</span>
          <strong>{focusText}</strong>
        </div>
      </div>
      <div className="field-story__route" aria-label="一天的观察节点">
        <div className="field-story__route-head">
          <span>一天的观察节点</span>
          <span>{cue.kicker}</span>
        </div>
        <div className="field-story__steps">
          {STORY_STEPS.map((step, index) => (
            <div
              className={`field-story__step${index === currentIndex ? ' is-current' : ''}${index < currentIndex ? ' is-past' : ''}`}
              key={step.id}
            >
              <span className="field-story__step-dot" aria-hidden="true" />
              <span>{step.label}</span>
            </div>
          ))}
        </div>
        <p className="field-story__hint">画面只跟随三位代表个体；下方数字记录整个拉马谷种群。</p>
      </div>
    </section>
  );
}
