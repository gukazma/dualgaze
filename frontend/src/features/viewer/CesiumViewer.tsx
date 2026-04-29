import { useEffect, useRef, useState } from 'react';
import { useCesiumViewer } from './useCesiumViewer';
import { Rail } from './Rail';
import type { Tool } from './Rail';
import { TilesetPanel } from './TilesetPanel';
import { StatusPill } from './StatusPill';
import { SketchPanel } from '@/features/sketch/SketchPanel';
import { useSketch } from '@/features/sketch/useSketch';
import { useHealth } from '@/lib/api';

export function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewer = useCesiumViewer(containerRef);
  const sketch = useSketch(viewer);
  const [activeTool, setActiveTool] = useState<Tool | null>('tiles');
  const health = useHealth();

  const handleSelectTool = (tool: Tool) => {
    setActiveTool((prev) => (prev === tool ? null : tool));
  };

  const sketchCancel = sketch.cancel;
  const sketchMode = sketch.mode;
  useEffect(() => {
    if (activeTool !== 'sketch' && (sketchMode === 'drawing' || sketchMode === 'extruding')) {
      sketchCancel();
    }
  }, [activeTool, sketchMode, sketchCancel]);

  return (
    <div className="viewer-root">
      <div ref={containerRef} className="viewer-canvas" />
      <Rail
        active={activeTool}
        onSelect={handleSelectTool}
        backendOk={health.kind === 'ok'}
      />
      {viewer && activeTool === 'tiles' && <TilesetPanel viewer={viewer} />}
      {activeTool === 'sketch' && <SketchPanel sketch={sketch} />}
      <StatusPill health={health} />
    </div>
  );
}
