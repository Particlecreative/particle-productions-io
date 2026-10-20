import '../deck.css';
import { MotionProvider } from '../motion/Motion';
import { DeckProvider } from './DeckContext';

/**
 * Wraps any deck surface (editor canvas, presenter, thumbnails, public page) with the isolated
 * deck styles, the motion provider and the deck context.
 */
export default function DeckShell({ value, children, className = '', style }) {
  const v = {
    mode: 'present',
    layout: 'canvas',
    motionLevel: 'full',
    editable: false,
    buildStep: 99,
    overrides: {},
    narrative: null,
    ...value,
  };
  return (
    <MotionProvider>
      <DeckProvider value={v}>
        <div className={`cr-deck ${className}`} data-mode={v.mode} style={style}>
          {children}
        </div>
      </DeckProvider>
    </MotionProvider>
  );
}
