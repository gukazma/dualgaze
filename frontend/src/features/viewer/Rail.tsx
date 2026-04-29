import {
  BookmarkIcon,
  BrandMark,
  LayersIcon,
  SettingsIcon,
  SketchIcon,
  StackIcon,
} from './icons';

export type Tool = 'layers' | 'tiles' | 'sketch' | 'bookmarks' | 'settings';

interface RailProps {
  active: Tool | null;
  onSelect: (tool: Tool) => void;
  backendOk: boolean;
}

const TOOLS: { id: Tool; label: string; Icon: () => JSX.Element }[] = [
  { id: 'layers', label: 'Layers', Icon: LayersIcon },
  { id: 'tiles', label: '3D Tiles', Icon: StackIcon },
  { id: 'sketch', label: 'Sketch & Extrude', Icon: SketchIcon },
  { id: 'bookmarks', label: 'Bookmarks', Icon: BookmarkIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export function Rail({ active, onSelect, backendOk }: RailProps) {
  return (
    <aside className="rail" aria-label="Tool rail">
      <div className="rail__top">
        <div className="rail__brand" aria-label="DualGaze">
          <BrandMark />
        </div>
        <div className="rail__divider" aria-hidden="true" />
        {TOOLS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              className="rail__slot"
              aria-label={label}
              aria-pressed={isActive}
              onClick={() => onSelect(id)}
            >
              <Icon />
            </button>
          );
        })}
      </div>
      <span
        className={`rail__status-dot ${backendOk ? 'rail__status-dot--ok' : 'rail__status-dot--bad'}`}
        aria-label={backendOk ? 'backend ok' : 'backend unreachable'}
      />
    </aside>
  );
}
