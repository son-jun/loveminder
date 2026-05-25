import type { ReactNode } from 'react';

interface Props {
  text: string;
}

// 가벼운 마크다운 렌더: # 헤더와 - 불릿만 처리. (의존성 추가 없이)
export default function PromptView({ text }: Props) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let bulletGroup: string[] = [];
  const flushBullets = (key: string) => {
    if (bulletGroup.length === 0) return;
    out.push(
      <ul key={'ul-' + key} style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--ink)' }}>
        {bulletGroup.map((b, i) => (
          <li key={i} style={{ lineHeight: 1.7, fontSize: 14 }}>{b}</li>
        ))}
      </ul>,
    );
    bulletGroup = [];
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (line.startsWith('# ')) {
      flushBullets('h' + idx);
      out.push(
        <h3
          key={'h-' + idx}
          className="serif"
          style={{
            margin: idx === 0 ? '0' : '14px 0 4px',
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--terracotta)',
            letterSpacing: '-0.01em',
          }}
        >
          {line.slice(2)}
        </h3>,
      );
    } else if (line.startsWith('- ')) {
      bulletGroup.push(line.slice(2));
    } else if (line.trim() === '') {
      flushBullets('br' + idx);
    } else {
      flushBullets('p' + idx);
      out.push(
        <p
          key={'p-' + idx}
          style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.75, color: 'var(--ink)' }}
        >
          {line}
        </p>,
      );
    }
  });
  flushBullets('end');
  return <div>{out}</div>;
}
