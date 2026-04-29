import { useState } from 'react';
import type { Viewer } from 'cesium';
import { ArrowRightIcon, PlusIcon } from './icons';
import { loadTileset } from '@/lib/tileset';

interface TilesetPanelProps {
  viewer: Viewer;
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded' }
  | { kind: 'error'; message: string };

const DEFAULT_TILESET_URL = '/datas/3dtiles.json';

export function TilesetPanel({ viewer }: TilesetPanelProps) {
  const [state, setState] = useState<LoadState>({ kind: 'idle' });

  const handleLoadDefault = async () => {
    if (state.kind === 'loading' || state.kind === 'loaded') return;
    setState({ kind: 'loading' });
    try {
      await loadTileset(viewer, DEFAULT_TILESET_URL);
      setState({ kind: 'loaded' });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'failed to load tileset',
      });
    }
  };

  const cardLabel = (() => {
    switch (state.kind) {
      case 'loading':
        return '加载中…';
      case 'loaded':
        return '已加载';
      case 'error':
        return '加载失败';
      default:
        return '默认数据集';
    }
  })();

  return (
    <section className="context-panel" aria-label="3D Tiles">
      <h2 className="context-panel__title">3D Tiles</h2>

      <button
        type="button"
        className={`tileset-card tileset-card--${state.kind}`}
        onClick={handleLoadDefault}
        disabled={state.kind === 'loading' || state.kind === 'loaded'}
      >
        <span className="tileset-card__col">
          <span className="tileset-card__name">{cardLabel}</span>
          <span className="tileset-card__path">{DEFAULT_TILESET_URL}</span>
        </span>
        <span className="tileset-card__arrow" aria-hidden="true">
          <ArrowRightIcon />
        </span>
      </button>

      {state.kind === 'error' && (
        <p className="context-panel__error" role="alert">
          {state.message}
        </p>
      )}

      <button type="button" className="context-panel__secondary" disabled>
        <PlusIcon />
        <span>添加自定义 URL</span>
      </button>
    </section>
  );
}
