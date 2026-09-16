/** 常驻免责声明 — 文案固定，勿改 */
export const DISCLAIMER_TEXT =
  '本作品为简化互动科学玩具，不代表真实黄石生态预测。';

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      className={`disclaimer ${compact ? 'disclaimer--compact' : ''}`}
      role="note"
      aria-label="免责声明"
    >
      {DISCLAIMER_TEXT}
    </aside>
  );
}
