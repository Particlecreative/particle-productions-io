import { memo, useEffect, useRef } from 'react';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Eye, EyeOff, Plus } from 'lucide-react';
import { SlideThumbFrame } from '../deck/SlideStage';
import SlideRenderer from '../deck/SlideRenderer';
import { SLIDE_COMPONENTS } from '../slides/registry';

const THUMB_W = 196;

const Thumb = memo(function Thumb({ slide }) {
  return (
    <SlideThumbFrame width={THUMB_W} style={{ borderRadius: 8 }}>
      <div className="cr-deck" data-mode="thumb"><SlideRenderer slide={slide} active={false} /></div>
    </SlideThumbFrame>
  );
});

function RailItem({ slide, number, selected, onSelect, onToggleHidden }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.key });
  const Icon = SLIDE_COMPONENTS[slide.type]?.icon;
  const ghost = slide.hidden || slide.autoHidden;
  return (
    <div
      ref={setNodeRef}
      data-key={slide.key}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined, opacity: isDragging ? 0.85 : 1, contentVisibility: 'auto', containIntrinsicSize: '150px' }}
      className="group relative flex gap-2 items-start"
    >
      <div className="w-6 pt-1 text-right text-[11px] tabular-nums text-gray-400 select-none flex-none">{ghost ? '–' : number}</div>
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={() => onSelect(slide.key)}
        className={`relative rounded-[10px] overflow-hidden text-left transition-shadow ${selected ? 'ring-[3px] ring-[#4a55ff]' : 'ring-1 ring-gray-200 hover:ring-gray-300'}`}
        style={{ opacity: ghost ? 0.38 : 1, cursor: 'grab' }}
        aria-label={`Slide ${number}: ${slide.text?.title || slide.type}`}
      >
        <Thumb slide={slide} />
        {slide.edited && <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white" title="Edited" />}
        {slide.autoHidden && !slide.hidden && <span className="absolute bottom-1.5 left-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-black/60 text-white">Empty · auto-hidden</span>}
      </button>
      <div className="absolute right-1.5 top-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" onClick={(e) => { e.stopPropagation(); onToggleHidden(slide.key); }} className="w-6 h-6 rounded-md bg-white/95 shadow flex items-center justify-center text-gray-600 hover:text-gray-900" title={slide.hidden ? 'Show slide' : 'Hide slide'}>
          {slide.hidden ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
      </div>
      {Icon && <Icon size={11} className="absolute left-0 top-6 text-gray-300" />}
    </div>
  );
}

export default function SlideRail({ slides, selectedKey, onSelect, onReorder, onToggleHidden, onAdd }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector(`[data-key="${CSS.escape ? CSS.escape(selectedKey || '') : selectedKey}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedKey]);
  let n = 0;
  const numbers = slides.map(s => (s.hidden || s.autoHidden ? null : ++n));
  return (
    <div ref={ref} className="h-full overflow-y-auto px-3 py-3 flex flex-col gap-3 bg-gray-50 border-r border-gray-200" style={{ width: THUMB_W + 48 }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id) return;
          const keys = slides.map(s => s.key);
          onReorder(arrayMove(keys, keys.indexOf(active.id), keys.indexOf(over.id)));
        }}
      >
        <SortableContext items={slides.map(s => s.key)} strategy={verticalListSortingStrategy}>
          {slides.map((s, i) => (
            <RailItem key={s.key} slide={s} number={numbers[i]} selected={s.key === selectedKey} onSelect={onSelect} onToggleHidden={onToggleHidden} />
          ))}
        </SortableContext>
      </DndContext>
      <button type="button" onClick={onAdd} className="ml-8 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 border border-dashed border-gray-300 rounded-[10px] py-3">
        <Plus size={14} /> Add slide
      </button>
    </div>
  );
}
