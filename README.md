# 小地球 · 我做了一个存活在电脑里的地球

黄石公园宏观生态互动科学玩具（Day 1–2 MVP）。

> **本作品为简化互动科学玩具，不代表真实黄石生态预测。**

## 如何运行

```bash
npm install
npm run dev
```

浏览器打开终端提示的本地地址（通常为 `http://localhost:5173`）。

生产构建：

```bash
npm run build
npm run preview
```

## 技术栈

- Vite + React + TypeScript 单页应用
- Canvas 2D：小地球自转、黄石扁平场景
- SVG：种群数量曲线（无第三方图表库）
- 纯规则中文 NLP（无后端、无 LLM API、无 Three.js）

## 科学假设（简化）

- 物种仅含：草、灌木、兔子、麋鹿、狼。
- 食物链：植物 → 兔子/麋鹿 → 狼。
- 离散时间步；季节影响温度/降雨/植物生长；火灾暂时减少植被。
- 不做年龄结构、迁移、疾病、个体 Agent 等精细建模。
- 数值有上下界夹紧，保证非负与可演示稳定性。

## AI 不伪造数值

- 聊天角色「生态系统管理员」只做两件事：把中文指令解析成结构化事件、解释模拟器已经执行的结果。
- **所有种群与环境数值变化只发生在确定性 `tick` / `applyCommand` 中。**
- 事件日志带 `source`：`system` | `user-command` | `predation`，便于追因果。
- 离谱指令（如「让狼吃掉太阳」）统一中文拒绝，绝不静默忽略。

## 可试指令

- 环境：下雨、下雨三周、发生火灾、更冷、升温
- 物种：增加十只狼、减少五只兔子
- 时间：快进到冬天、暂停、继续、快进 8 步
- 观察：现在谁最多、为什么兔子变少了、状态

## 原创点

1. **自研宏观生态状态机**：`EcosystemState` + 纯函数 `tick` / `applyCommand`，可复现。
2. **规则中文指令协议**：`src/nlp/parse.ts` 关键词/模板 → 结构化事件 + 统一拒绝话术。
3. **可复现事件日志**：每条记录来源字段，UI 与聊天解释均基于日志/状态。
4. **关键动画 stub**：狼捕兔 CSS/Canvas 示意，由捕食日志触发，不改数值。
5. **扁平插画视觉**：地球 + 黄石场景自绘，并接入 CC0 卡通精灵（Kenney / Pixel Earth / ScratchIO）。
6. **素材致谢**：第三方 CC0 资源清单见 `public/assets/CREDITS.md`。

## 目录结构

```text
src/
  sim/     状态、边界、tick、命令应用
  nlp/     中文规则解析与话术
  ui/      地球、生态区、曲线、日志、聊天、捕食动画
  App.tsx  单页装配
```

## 免责声明

本作品为简化互动科学玩具，不代表真实黄石生态预测。

## 致谢

美术素材均为 CC0，详见 [`public/assets/CREDITS.md`](public/assets/CREDITS.md)（Kenney Planets、Pixel Earth Animation、ScratchIO Animated Wild Animals）。

