import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import {
  Search,
  Crosshair,
  LocateFixed,
  MapPin,
  X,
  History,
  Star,
  TriangleAlert,
  CornerDownRight,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCesiumViewer } from '../features/cesium/CesiumContext';
import { useLocationStore, type LocationRecord, type LocationSource } from '../store/location';
import { useSimulationStore } from '../store/simulation';
import { amapAutoComplete, isAmapAvailable, type AmapSuggest } from '../lib/amap-geocode';
import { ipLocate } from '../lib/ip-locate';
import { parseCoord, formatCoord } from '../lib/coord-parse';
import { cn } from '../lib/utils';

type Mode = 'geo' | 'coord';

const FLY_ALT_M = 2000;
const FLY_PITCH_DEG = -60;
const FLY_DURATION_S = 1.5;
const DEBOUNCE_MS = 280;

/**
 * 地图左上角浮动搜索 tab —— 高德导航风格。
 *
 * - Idle 折叠：360×44 pill `[🔍 搜索地名或经纬度  |  📍 IP]`
 * - 点 pill 输入区 → 展开 drawer：`[地名 / 经纬度]` 子 tab + 内容
 * - 点 IP 按钮（任何状态）→ 一键 ipwho.is + flyTo
 * - 模拟飞行中：组件不渲染（避免遮挡 PlaybackBar / FpvWindow）
 */
export function LocationSearchTab() {
  const viewer = useCesiumViewer();
  const isSimulating = useSimulationStore((s) => s.mode === 'simulating');
  const recent = useLocationStore((s) => s.recent);
  const favorites = useLocationStore((s) => s.favorites);
  const setRecent = useLocationStore((s) => s.setRecent);

  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<Mode>('geo');
  const [keyword, setKeyword] = useState('');
  const [coordText, setCoordText] = useState('');
  const [suggests, setSuggests] = useState<AmapSuggest[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [ipLoading, setIpLoading] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const amapAvailable = isAmapAvailable();
  const parsed = useMemo(() => parseCoord(coordText), [coordText]);
  const coordError = coordText.trim().length > 0 && !parsed;

  // 点外面收起 drawer（但保留输入文字，方便用户再点开继续编辑）
  useEffect(() => {
    if (!expanded) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  // 地名 autocomplete: 节流 280ms
  useEffect(() => {
    if (mode !== 'geo') return;
    if (!amapAvailable) return;
    const q = keyword.trim();
    if (!q) {
      setSuggests([]);
      setSearchErr(null);
      return;
    }
    setSearching(true);
    const id = window.setTimeout(() => {
      amapAutoComplete(q)
        .then((res) => {
          setSuggests(res);
          setSearchErr(null);
        })
        .catch((err: unknown) => {
          setSuggests([]);
          setSearchErr(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setSearching(false));
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [keyword, mode, amapAvailable]);

  const flyTo = useCallback(
    (lon: number, lat: number, label: string, source: LocationSource) => {
      if (!viewer) {
        toast.error('地图尚未就绪');
        return;
      }
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, FLY_ALT_M),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(FLY_PITCH_DEG),
          roll: 0,
        },
        duration: FLY_DURATION_S,
      });
      const record: LocationRecord = { label, lon, lat, source, at: Date.now() };
      setRecent(record);
      setExpanded(false);
      toast.success(`已定位到 ${label}`, {
        description: `${formatCoord(lon, lat)} · ${sourceLabel(source)}`,
      });
    },
    [viewer, setRecent],
  );

  const handleIpLocate = useCallback(async () => {
    if (ipLoading) return;
    setIpLoading(true);
    try {
      const r = await ipLocate();
      flyTo(r.lon, r.lat, r.city || r.country || 'IP 位置', 'ip');
    } catch (err) {
      toast.error('IP 定位失败', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIpLoading(false);
    }
  }, [ipLoading, flyTo]);

  const handleCoordGo = useCallback(() => {
    if (!parsed) return;
    flyTo(parsed.lon, parsed.lat, formatCoord(parsed.lon, parsed.lat), 'manual');
  }, [parsed, flyTo]);

  if (isSimulating) return null;

  return (
    <div
      ref={wrapRef}
      className={cn(
        'pointer-events-auto absolute left-3 top-3 z-30 w-[360px] overflow-hidden rounded-2xl border bg-bg-surface shadow-[0_10px_30px_rgba(0,0,0,0.8)] transition-colors',
        expanded
          ? coordError
            ? 'border-accent-danger'
            : 'border-accent'
          : 'border-border',
      )}
    >
      {/* === pill 顶部 === */}
      <div className="flex h-11 items-center pl-3 pr-1">
        {mode === 'coord' ? (
          <Crosshair className={cn('h-4 w-4', coordError ? 'text-accent-danger' : 'text-accent')} />
        ) : (
          <Search
            className={cn(
              'h-4 w-4',
              expanded && keyword ? 'text-accent' : 'text-text-muted',
            )}
          />
        )}
        <input
          ref={inputRef}
          type="text"
          value={mode === 'geo' ? keyword : coordText}
          onChange={(e) => {
            if (mode === 'geo') setKeyword(e.target.value);
            else setCoordText(e.target.value);
          }}
          onFocus={() => setExpanded(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (mode === 'coord') handleCoordGo();
              else if (suggests[0]) {
                flyTo(suggests[0].lon, suggests[0].lat, suggests[0].name, 'amap');
              }
            }
          }}
          placeholder="搜索地名或经纬度"
          className="ml-2 flex-1 bg-transparent text-[13px] font-semibold text-text-primary placeholder:font-normal placeholder:text-text-muted focus:outline-none"
          aria-label="搜索地名或经纬度"
          data-testid="location-input"
        />
        {(mode === 'geo' ? keyword : coordText) && (
          <button
            type="button"
            onClick={() => {
              if (mode === 'geo') setKeyword('');
              else setCoordText('');
              inputRef.current?.focus();
            }}
            className="mr-2 rounded-sm p-1 text-text-muted hover:bg-bg-input hover:text-text-primary"
            aria-label="清空"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="h-5 w-px bg-border-subtle" />
        <button
          type="button"
          onClick={() => void handleIpLocate()}
          disabled={ipLoading}
          className={cn(
            'ml-1 flex h-9 w-12 items-center justify-center rounded-2xl transition-colors',
            'bg-bg-input hover:bg-accent/15',
            ipLoading && 'cursor-wait',
          )}
          title="使用 IP 定位（ipwho.is，城市级精度）"
          aria-label="IP 定位"
          data-testid="ip-locate-btn"
        >
          {ipLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
          ) : (
            <LocateFixed className="h-4 w-4 text-accent" />
          )}
        </button>
      </div>

      {/* === drawer === */}
      {expanded && (
        <>
          <div className="h-px bg-border-subtle" />
          {/* sub-tabs */}
          <div className="flex h-9 px-3">
            <TabBtn active={mode === 'geo'} onClick={() => setMode('geo')}>
              地名
            </TabBtn>
            <TabBtn
              active={mode === 'coord'}
              onClick={() => setMode('coord')}
              danger={mode === 'coord' && coordError}
            >
              经纬度
            </TabBtn>
          </div>
          <div className="h-px bg-border-subtle" />

          {/* content */}
          {mode === 'geo' ? (
            <GeoBody
              amapAvailable={amapAvailable}
              keyword={keyword}
              searching={searching}
              suggests={suggests}
              searchErr={searchErr}
              onPick={(s) => flyTo(s.lon, s.lat, s.name, 'amap')}
            />
          ) : (
            <CoordBody
              parsed={parsed}
              coordError={coordError}
              onGo={handleCoordGo}
            />
          )}

          {/* footer */}
          <div className="h-px bg-border-subtle" />
          <div className="flex items-center gap-2 px-3 py-2">
            {recent ? (
              <button
                type="button"
                onClick={() => flyTo(recent.lon, recent.lat, recent.label, 'favorite')}
                className="flex items-center gap-1.5 rounded-md bg-[#0a2b3c] px-2 py-1 text-[11px] font-medium text-accent-cyan hover:bg-[#0d3548]"
                title={`最近一次：${formatCoord(recent.lon, recent.lat)}`}
              >
                <History className="h-3 w-3" />
                最近：{recent.label}
              </button>
            ) : (
              <span className="text-[11px] text-text-muted">没有最近记录</span>
            )}
            <div className="flex-1" />
            {mode === 'geo' && (
              <span
                className={cn(
                  'text-[10px] font-semibold',
                  amapAvailable ? 'text-accent-cyan' : 'text-text-muted',
                )}
                title={amapAvailable ? '高德 Web JS API' : '未配置 VITE_AMAP_KEY'}
              >
                AMAP
              </span>
            )}
          </div>
        </>
      )}

      {/* 收起态下方的快捷收藏 chip 行（折叠时也常驻 1 行，复刻高德 "常去地点"） */}
      {!expanded && favorites.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-border-subtle px-3 py-2">
          {favorites.slice(0, 5).map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => flyTo(f.lon, f.lat, f.label, 'favorite')}
              className="flex shrink-0 items-center gap-1 rounded-full border border-border-subtle bg-bg-surface px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:border-accent hover:text-accent"
            >
              <Star className="h-2.5 w-2.5 text-accent" />
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  danger,
  onClick,
  children,
}: {
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative h-9 px-3 text-[12px] font-semibold transition-colors',
        active
          ? danger
            ? 'text-accent-danger'
            : 'text-accent'
          : 'text-text-muted hover:text-text-secondary',
      )}
    >
      {children}
      {active && (
        <span
          className={cn(
            'absolute inset-x-2 bottom-0 h-0.5',
            danger ? 'bg-accent-danger' : 'bg-accent',
          )}
        />
      )}
    </button>
  );
}

function GeoBody({
  amapAvailable,
  keyword,
  searching,
  suggests,
  searchErr,
  onPick,
}: {
  amapAvailable: boolean;
  keyword: string;
  searching: boolean;
  suggests: AmapSuggest[];
  searchErr: string | null;
  onPick: (s: AmapSuggest) => void;
}) {
  if (!amapAvailable) {
    return (
      <div className="flex items-start gap-2 px-3 py-4">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <div className="text-[11px] text-text-secondary">
          <p className="font-semibold text-text-primary">未配置高德 API key</p>
          <p className="mt-1">
            去 <span className="font-mono text-accent">lbs.amap.com</span> 申请 Web JS API key，
            然后在 <span className="font-mono text-accent">.env</span> 配置{' '}
            <span className="font-mono text-accent">VITE_AMAP_KEY</span>。
          </p>
          <p className="mt-1 text-text-muted">或切到「经纬度」直接输入坐标。</p>
        </div>
      </div>
    );
  }
  if (searchErr) {
    return (
      <div className="flex items-start gap-2 px-3 py-4">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-danger" />
        <div className="text-[11px] text-accent-danger">
          <p className="font-semibold">搜索失败</p>
          <p className="mt-1 text-text-secondary">{searchErr}</p>
        </div>
      </div>
    );
  }
  if (!keyword.trim()) {
    return (
      <div className="px-3 py-6 text-center text-[11px] text-text-muted">
        输入地名或关键词开始搜索 · 由高德提供 5 条候选
      </div>
    );
  }
  if (searching) {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-6 text-[11px] text-text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        搜索中…
      </div>
    );
  }
  if (suggests.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-[11px] text-text-muted">
        没有结果 · 换个关键词试试，或切到「经纬度」
      </div>
    );
  }
  return (
    <ul className="max-h-[280px] overflow-y-auto" data-testid="location-suggests">
      {suggests.map((s, i) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => onPick(s)}
            className={cn(
              'flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors',
              i === 0 ? 'bg-bg-input/60' : 'hover:bg-bg-input/40',
            )}
          >
            <MapPin
              className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', i === 0 ? 'text-accent' : 'text-text-muted')}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-text-primary">{s.name}</p>
              <p className="mt-0.5 truncate text-[10px] text-text-muted">
                {[s.district, s.address].filter(Boolean).join(' · ') ||
                  formatCoord(s.lon, s.lat)}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CoordBody({
  parsed,
  coordError,
  onGo,
}: {
  parsed: { lon: number; lat: number } | null;
  coordError: boolean;
  onGo: () => void;
}) {
  return (
    <div className="px-3 py-3">
      {coordError && (
        <div className="mb-3 rounded-md border border-accent-danger/40 bg-[#2a0e10] p-2.5">
          <div className="flex items-center gap-1.5 text-accent-danger">
            <TriangleAlert className="h-3.5 w-3.5" />
            <span className="text-[12px] font-bold">经纬度无效</span>
          </div>
          <p className="ml-5 mt-1 text-[11px] text-[#fca5a5]">
            经度需在 -180~180，纬度需在 -90~90
          </p>
        </div>
      )}
      <div className="mb-1 text-[10px] font-bold text-text-secondary">接受格式</div>
      <ul className="space-y-0.5 text-[10px] text-text-muted">
        <li>• 121.4737, 31.2304 &nbsp;&nbsp;(lon, lat 逗号分)</li>
        <li>• 121.4737 31.2304 &nbsp;&nbsp;(空格分)</li>
        <li>• E121.4737, N31.2304 &nbsp;&nbsp;(含方向)</li>
      </ul>
      <button
        type="button"
        onClick={onGo}
        disabled={!parsed}
        className={cn(
          'mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-[12px] font-semibold transition-colors',
          parsed
            ? 'bg-accent text-bg hover:bg-accent/90'
            : 'cursor-not-allowed bg-bg-input text-text-muted',
        )}
        data-testid="coord-go-btn"
      >
        <CornerDownRight className="h-3 w-3" />
        跳转
        {parsed && (
          <span className="ml-1 font-mono text-[11px] opacity-70">
            {formatCoord(parsed.lon, parsed.lat)}
          </span>
        )}
      </button>
    </div>
  );
}

function sourceLabel(s: LocationSource): string {
  switch (s) {
    case 'amap':
      return '高德地名';
    case 'manual':
      return '手输坐标';
    case 'ip':
      return '来自 IP';
    case 'favorite':
      return '快捷';
  }
}
