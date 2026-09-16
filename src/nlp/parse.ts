import type { Season, SimCommand, SpeciesKey } from '../sim/types';

export type ParseResult =
  | { ok: true; command: SimCommand; matched: string }
  | { ok: false; reason: string };

/** 统一拒绝话术前缀（离谱指令绝不静默忽略） */
export const REFUSAL_PREFIX = '无法执行：';

const ABSURD_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /吃掉?\s*太阳|吞掉天空|吃月亮|吃地球/, reason: '狼不能吃掉太阳或天体，本模拟只处理黄石宏观食物链。' },
  { re: /让冬天立刻结束|取消冬天|消灭季节|停止地球自转/, reason: '不能违背季节物理设定；可用「快进到春天」推进时间。' },
  { re: /让万物永生|无限繁殖|取消死亡|变成神仙/, reason: '超出宏观生态玩具范围。' },
  { re: /召唤恐龙|放出外星人|核爆|毁灭世界/, reason: '指令超出本作品物种与事件集合。' },
  { re: /修改源代码|黑客|删除数据库/, reason: '这是生态模拟指令通道，不接受系统破坏类请求。' },
];

const SPECIES_MAP: { keys: string[]; species: SpeciesKey }[] = [
  { keys: ['草', '草地', '牧草'], species: 'grass' },
  { keys: ['灌木', '灌木丛', '灌丛'], species: 'shrubs' },
  { keys: ['兔子', '兔', '野兔'], species: 'rabbits' },
  { keys: ['麋鹿', '鹿'], species: 'elk' },
  { keys: ['狼', '狼群', '灰狼'], species: 'wolves' },
];

const SEASON_MAP: { keys: string[]; season: Season }[] = [
  { keys: ['春', '春天', '春季'], season: 'spring' },
  { keys: ['夏', '夏天', '夏季'], season: 'summer' },
  { keys: ['秋', '秋天', '秋季'], season: 'autumn' },
  { keys: ['冬', '冬天', '冬季'], season: 'winter' },
];

const CN_NUM: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function parseChineseNumber(text: string): number | null {
  const ascii = text.match(/(\d+)/);
  if (ascii) return parseInt(ascii[1], 10);

  // 十、二十、十二、二十五 等简单形式
  if (text.includes('十')) {
    const parts = text.split('十');
    const tens = parts[0] === '' ? 1 : (CN_NUM[parts[0]] ?? null);
    const ones = parts[1] === '' || parts[1] == null ? 0 : (CN_NUM[parts[1]] ?? null);
    if (tens != null && ones != null) return tens * 10 + ones;
  }
  for (const [k, v] of Object.entries(CN_NUM)) {
    if (text.includes(k)) return v;
  }
  return null;
}

function findSpecies(text: string): SpeciesKey | null {
  for (const row of SPECIES_MAP) {
    for (const k of row.keys) {
      if (text.includes(k)) return row.species;
    }
  }
  return null;
}

function findSeason(text: string): Season | null {
  for (const row of SEASON_MAP) {
    for (const k of row.keys) {
      if (text.includes(k)) return row.season;
    }
  }
  return null;
}

/**
 * 规则中文 NLP：关键词/模板 → 结构化 SimCommand。
 * 离谱指令返回统一拒绝，绝不静默成功。
 */
export function parseCommand(input: string): ParseResult {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, reason: REFUSAL_PREFIX + '请输入一条指令，例如「下雨」「增加十只狼」。' };
  }

  const text = raw.replace(/\s+/g, '');

  for (const a of ABSURD_PATTERNS) {
    if (a.re.test(text)) {
      return { ok: false, reason: REFUSAL_PREFIX + a.reason };
    }
  }

  // —— 情景注入芯片 / 叙事快捷指令 ——
  if (/暴风雪|暴雪|提前.*冬|深冬|寒潮/.test(text)) {
    return { ok: true, command: { type: 'force_season', season: 'winter' }, matched: '暴风雪提前' };
  }
  if (/雷击|野火|雷火/.test(text)) {
    return { ok: true, command: { type: 'trigger_fire' }, matched: '雷击野火' };
  }
  if (/游客|投喂|人为干扰|投食冲突/.test(text)) {
    return { ok: true, command: { type: 'tourist_conflict' }, matched: '游客投喂冲突' };
  }

  // —— 暂停 / 继续 ——
  if (/暂停|停下|先停|pause/i.test(text)) {
    return { ok: true, command: { type: 'pause' }, matched: '暂停' };
  }
  if (/继续|恢复|开始运行|resume/i.test(text)) {
    return { ok: true, command: { type: 'resume' }, matched: '继续' };
  }

  // —— 查询 ——
  if (/谁.*最多|最多.*谁|数量最多|哪个.*最多/.test(text)) {
    return { ok: true, command: { type: 'query', about: 'most' }, matched: '查询最多' };
  }
  if (/为什么.*兔|兔子.*少|兔.*变少|兔子怎么/.test(text)) {
    return { ok: true, command: { type: 'query', about: 'why_rabbits' }, matched: '查询兔子' };
  }
  if (/状态|现在怎样|当前生态|看看情况|概况/.test(text)) {
    return { ok: true, command: { type: 'query', about: 'status' }, matched: '查询状态' };
  }

  // —— 火灾 ——
  if (/火灾|着火|森林火|起火|放火/.test(text)) {
    return { ok: true, command: { type: 'trigger_fire' }, matched: '火灾' };
  }

  // —— 下雨 / 降雨 ——
  if (/下雨|降雨|来场雨|下一场雨|多雨/.test(text)) {
    const n = parseChineseNumber(text);
    const weeks = n != null && n > 0 ? n : 3;
    return { ok: true, command: { type: 'set_rain', weeks }, matched: '下雨' };
  }

  // —— 温度 ——
  if (/更冷|降温|变冷|寒冷/.test(text)) {
    const n = parseChineseNumber(text);
    const delta = -(n != null && n > 0 ? Math.min(n, 15) : 5);
    return { ok: true, command: { type: 'set_temperature', delta }, matched: '降温' };
  }
  if (/更热|升温|变热|温暖|变暖/.test(text)) {
    const n = parseChineseNumber(text);
    const delta = n != null && n > 0 ? Math.min(n, 15) : 5;
    return { ok: true, command: { type: 'set_temperature', delta }, matched: '升温' };
  }

  // —— 快进季节 ——
  if (/快进|跳到|切换到|进入|到了/.test(text) || /到(春|夏|秋|冬)/.test(text)) {
    const season = findSeason(text);
    if (season) {
      return { ok: true, command: { type: 'force_season', season }, matched: '快进季节' };
    }
  }
  // 「冬天」单独也可能是快进意图
  if (/^(快进)?(到)?(春天|夏天|秋天|冬天)$/.test(text)) {
    const season = findSeason(text);
    if (season) {
      return { ok: true, command: { type: 'force_season', season }, matched: '快进季节' };
    }
  }

  // —— 快进 N 步 ——
  if (/快进|跳过|推进/.test(text) && /步|tick|周/.test(text)) {
    const n = parseChineseNumber(text) ?? 8;
    return { ok: true, command: { type: 'fast_forward', ticks: n }, matched: '快进' };
  }
  if (/快进\d+|快进[一二三四五六七八九十]+/.test(text)) {
    const n = parseChineseNumber(text) ?? 8;
    return { ok: true, command: { type: 'fast_forward', ticks: n }, matched: '快进' };
  }

  // —— 增加 / 减少物种 ——
  const species = findSpecies(text);
  if (species && (/增加|加|放入|引入|放生/.test(text) || /添/.test(text))) {
    const n = parseChineseNumber(text) ?? 10;
    return { ok: true, command: { type: 'add_species', species, amount: n }, matched: '增加物种' };
  }
  if (species && (/减少|移除|杀掉|捕杀|去掉|减少/.test(text))) {
    const n = parseChineseNumber(text) ?? 5;
    return { ok: true, command: { type: 'remove_species', species, amount: n }, matched: '减少物种' };
  }
  // 「十只狼」默认增加
  if (species && (parseChineseNumber(text) != null) && /只|头|条|单位/.test(text)) {
    const n = parseChineseNumber(text) ?? 10;
    return { ok: true, command: { type: 'add_species', species, amount: n }, matched: '增加物种' };
  }

  // —— 狼捕食（显式）—— 交给模拟器自然发生；用户说「让狼捕食」则快进几步并说明
  if (/狼.*捕食|捕食.*兔|让狼吃|猎杀兔子/.test(text)) {
    return {
      ok: true,
      command: { type: 'fast_forward', ticks: 2 },
      matched: '触发捕食观察',
    };
  }

  return {
    ok: false,
    reason:
      REFUSAL_PREFIX +
      '这条我没法按巡护规程执行。可试：「暴风雪提前」「雷击野火」「游客投喂冲突」「增加十只狼」「下雨」「现在谁最多」。离谱指令会被拒绝。',
  };
}
