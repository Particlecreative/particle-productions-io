import { memo } from 'react';
import { SLIDE_COMPONENTS } from '../slides/registry';
import { SlideFrame } from '../slides/SlideFrame';

/** Pure slide renderer shared by the editor, presenter, thumbnails and the public share page. */
function SlideRendererImpl({ slide, active = true }) {
  const entry = SLIDE_COMPONENTS[slide?.type];
  if (!slide || !entry) return null;
  if (slide.vm?.error) {
    return (
      <SlideFrame slide={slide} active={active}>
        <div className="cr-col" style={{ height: '100%', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
          <span className="cr-h2">This slide couldn’t render</span>
          <span className="cr-small">{slide.vm.error}</span>
        </div>
      </SlideFrame>
    );
  }
  const C = entry.Component;
  return <C slide={slide} active={active} />;
}

export const SlideRenderer = memo(SlideRendererImpl);
export default SlideRenderer;
