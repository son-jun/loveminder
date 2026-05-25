import { createPortal } from 'react-dom';
import Icon from './Icon';

interface Props {
  onConfirm: () => void;
}

// 기획서 6-2: 첫 진입 시 반드시 1회 노출
export default function IntroModal({ onConfirm }: Props) {
  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="row between">
          <span className="chip">시작 안내</span>
        </div>
        <h2 className="serif mt-3" style={{ margin: 0, fontSize: 'var(--fs-20)', letterSpacing: '-0.02em' }}>
          이음을 시작하기 전에
        </h2>
        <div className="mt-4" style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
          <p style={{ margin: 0 }}>
            이음은 글쓰기의 <strong style={{ color: 'var(--ink)' }}>결과와 과정</strong>을 분석해
            <strong style={{ color: 'var(--ink)' }}> 자기성찰 리포트</strong>를 제공하기 위한 도구입니다.
          </p>
          <p className="mt-3" style={{ margin: 0 }}>
            글을 쓰는 동안 <strong style={{ color: 'var(--ink)' }}>작성 시간, 수정 횟수, 멈춤 시간, 최종 글 내용</strong>이
            분석에 활용될 수 있습니다.
          </p>
          <p className="mt-3" style={{ margin: 0, color: 'var(--terracotta)' }}>
            이 결과는 심리 진단이나 성격 평가가 아니며, <strong>이번 14일의 글쓰기에서 나타난 경향</strong>을
            설명하기 위한 것입니다.
          </p>
        </div>
        <button className="btn btn-primary btn-block mt-5" onClick={onConfirm}>
          <Icon name="check" size={18} />
          이해했어요, 시작할게요
        </button>
      </div>
    </div>,
    document.body,
  );
}
