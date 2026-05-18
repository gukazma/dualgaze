import { useMemo } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useCurrentMission, useMissionsStore } from '../store/missions';
import {
  FACADE_DEFAULTS,
  FACADE_PRESETS,
  PAYLOAD_CATALOG,
  type FacadeFace,
  type FacadeScanParams,
  type PayloadModel,
} from '../types/mission';
import { deriveFromGSD, gsdFromStandoff } from '../lib/facade-gsd';
import { cn } from '../lib/utils';

/**
 * Facade 任务配置面板 —— Pencil D10/D11 双模式（Smart/Manual）实装。
 *
 * 当前选中 face：用 mission.facadeFaces[0]。
 * （选择多个 face 的 UX 留 v3.1，目前一次只配置第一个 face；改变 params 会触发 setFaceScanResult 清空 scanPath，
 *  picker 不在场所以保持 stale；M19 加 effect 重算）
 */
export function FacadeConfigPanel() {
  const mission = useCurrentMission();
  const updateFacadeFaceParams = useMissionsStore((s) => s.updateFacadeFaceParams);

  if (!mission || mission.type !== 'facade') return null;
  const faces = mission.facadeFaces ?? [];
  const face = faces[0] ?? null;
  if (!face) {
    return (
      <section className="rounded-lg border border-border bg-[#131720] p-3.5 text-[11px] text-text-muted">
        还没有立面，先在主视图绘制一个再配置参数
      </section>
    );
  }

  return <FaceParamsCard face={face} onChange={(patch) => updateFacadeFaceParams(face.id, patch)} payloadId={mission.payloadId} />;
}

function FaceParamsCard({
  face,
  onChange,
  payloadId,
}: {
  face: FacadeFace;
  onChange: (patch: Partial<FacadeScanParams>) => void;
  payloadId: string;
}) {
  const params = face.params;
  const isSmart = params.mode === 'smart';
  const payload = useMemo(
    () => PAYLOAD_CATALOG.find((p) => p.id === payloadId) ?? null,
    [payloadId],
  );

  // 智能模式：由 GSD/overlap 反推 standoff/spacing；payload 缺数据时 fallback 到 manual
  const derived = useMemo(() => {
    if (!isSmart || !payload) return null;
    return deriveFromGSD({
      gsdMm: params.gsdMm,
      overlapFront: params.overlapFront,
      overlapSide: params.overlapSide,
      payload,
    });
  }, [isSmart, payload, params.gsdMm, params.overlapFront, params.overlapSide]);

  // 切到智能模式时，把 standoff/spacing 同步更新到反推值（用户调 GSD 时 derive 已自动算，但写回 params 让 scanPath 重算）
  const wpCount =
    derived && face.plane
      ? Math.max(1, Math.ceil(face.plane.width / derived.spacingH)) *
        Math.max(1, Math.ceil(face.plane.height / derived.spacingV))
      : face.scanPath?.length ?? 0;
  const unsafeCount = (face.scanPath ?? []).filter((wp) => wp.unsafe).length;

  const setMode = (mode: 'smart' | 'manual'): void => {
    if (mode === params.mode) return;
    if (mode === 'smart' && payload) {
      // 切到智能：尝试从当前 GSD 反推
      const d = deriveFromGSD({
        gsdMm: params.gsdMm,
        overlapFront: params.overlapFront,
        overlapSide: params.overlapSide,
        payload,
      });
      if (d) {
        onChange({ mode: 'smart', standoff: d.standoff, spacingH: d.spacingH, spacingV: d.spacingV });
        return;
      }
    }
    if (mode === 'manual') {
      // 切到手动：从当前 standoff 倒推 GSD（用于切回时数值连贯）
      if (payload) {
        const gsd = gsdFromStandoff(params.standoff, payload);
        if (gsd != null) {
          onChange({ mode: 'manual', gsdMm: gsd * 1000 });
          return;
        }
      }
    }
    onChange({ mode });
  };

  const setPreset = (gsdMm: number, of: number, os: number): void => {
    if (!payload) return;
    const d = deriveFromGSD({ gsdMm, overlapFront: of, overlapSide: os, payload });
    if (!d) return;
    onChange({
      gsdMm,
      overlapFront: of,
      overlapSide: os,
      standoff: d.standoff,
      spacingH: d.spacingH,
      spacingV: d.spacingV,
    });
  };

  const setGSD = (gsdMm: number): void => {
    if (!payload) return;
    const d = deriveFromGSD({
      gsdMm,
      overlapFront: params.overlapFront,
      overlapSide: params.overlapSide,
      payload,
    });
    if (!d) {
      onChange({ gsdMm });
      return;
    }
    onChange({ gsdMm, standoff: d.standoff, spacingH: d.spacingH, spacingV: d.spacingV });
  };

  const setOverlap = (key: 'overlapFront' | 'overlapSide', value: number): void => {
    if (!payload) {
      onChange({ [key]: value } as Partial<FacadeScanParams>);
      return;
    }
    const next = {
      gsdMm: params.gsdMm,
      overlapFront: key === 'overlapFront' ? value : params.overlapFront,
      overlapSide: key === 'overlapSide' ? value : params.overlapSide,
    };
    const d = deriveFromGSD({ ...next, payload });
    if (!d) {
      onChange({ [key]: value } as Partial<FacadeScanParams>);
      return;
    }
    onChange({ [key]: value, standoff: d.standoff, spacingH: d.spacingH, spacingV: d.spacingV });
  };

  return (
    <section className="rounded-lg border border-border bg-[#131720] p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px] font-bold">当前面：{face.name}</span>
        {!payload?.sensorWidthMm && (
          <span className="text-[10px] text-text-muted" title="该 payload 缺传感器/焦距参数，智能模式不可用">
            ⚠ payload 无相机参数
          </span>
        )}
      </div>

      {/* 模式 toggle */}
      <div className="mb-3 flex h-7 items-center rounded-md border border-border bg-bg-input p-0.5">
        <button
          type="button"
          onClick={() => setMode('smart')}
          disabled={!payload?.sensorWidthMm}
          className={cn(
            'flex-1 rounded-sm text-[11px] font-semibold transition disabled:opacity-30',
            isSmart ? 'bg-accent text-bg' : 'text-text-secondary hover:text-text-primary',
          )}
        >
          智能
        </button>
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={cn(
            'flex-1 rounded-sm text-[11px] font-semibold transition',
            !isSmart ? 'bg-accent text-bg' : 'text-text-secondary hover:text-text-primary',
          )}
        >
          手动
        </button>
      </div>

      {isSmart && payload?.sensorWidthMm ? (
        <SmartBody params={params} payload={payload} derived={derived} wpCount={wpCount} onChange={onChange} onPreset={setPreset} onSetGSD={setGSD} onSetOverlap={setOverlap} />
      ) : (
        <ManualBody params={params} onChange={onChange} />
      )}

      {unsafeCount > 0 && (
        <div className="mt-3 rounded-md border border-accent-danger bg-[#2d1a1a] p-2.5">
          <div className="flex items-center gap-1.5">
            <TriangleAlert className="h-3.5 w-3.5 text-accent-danger" />
            <span className="text-[11px] font-bold text-accent-danger">
              {unsafeCount} 个航点离障碍过近
            </span>
          </div>
          <div className="mt-1 text-[10px] text-text-secondary">
            建议{isSmart ? '增大 GSD（自动加大 standoff）' : '增大 standoff'} 或调整面位置避开树木 / 凸出物
          </div>
        </div>
      )}
    </section>
  );
}

function SmartBody({
  params,
  payload,
  derived,
  wpCount,
  onPreset,
  onSetGSD,
  onSetOverlap,
}: {
  params: FacadeScanParams;
  payload: PayloadModel;
  derived: ReturnType<typeof deriveFromGSD>;
  wpCount: number;
  onChange: (patch: Partial<FacadeScanParams>) => void;
  onPreset: (gsd: number, of: number, os: number) => void;
  onSetGSD: (v: number) => void;
  onSetOverlap: (k: 'overlapFront' | 'overlapSide', v: number) => void;
}) {
  const selectedPreset = FACADE_PRESETS.find(
    (p) =>
      Math.abs(p.gsdMm - params.gsdMm) < 0.1 &&
      Math.abs(p.overlapFront - params.overlapFront) < 0.01 &&
      Math.abs(p.overlapSide - params.overlapSide) < 0.01,
  );
  return (
    <>
      <div className="mb-2.5">
        <div className="mb-1 text-[10px] font-medium text-text-secondary">预设方案</div>
        <select
          value={selectedPreset?.id ?? 'custom'}
          onChange={(e) => {
            const id = e.target.value;
            const p = FACADE_PRESETS.find((x) => x.id === id);
            if (p) onPreset(p.gsdMm, p.overlapFront, p.overlapSide);
          }}
          className="h-7 w-full rounded-sm border border-border bg-bg-input px-2 text-[11px] text-text-primary focus:border-accent focus:outline-none"
        >
          {FACADE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} — {p.description}
            </option>
          ))}
          <option value="custom">自定义（保留当前 GSD/重叠）</option>
        </select>
      </div>

      <SliderRow
        label="目标 GSD"
        value={params.gsdMm}
        unit="mm"
        min={1}
        max={30}
        step={0.5}
        onChange={onSetGSD}
        deriveText={derived ? `自动 → standoff ${derived.standoff.toFixed(1)}m @ ${payload.label}` : '（参数不全）'}
      />
      <SliderRow
        label="航向重叠"
        value={Math.round(params.overlapFront * 100)}
        unit="%"
        min={60}
        max={90}
        step={1}
        onChange={(v) => onSetOverlap('overlapFront', v / 100)}
      />
      <SliderRow
        label="旁向重叠"
        value={Math.round(params.overlapSide * 100)}
        unit="%"
        min={60}
        max={90}
        step={1}
        onChange={(v) => onSetOverlap('overlapSide', v / 100)}
        deriveText={derived ? `自动 → 航点间距 ${derived.spacingV.toFixed(2)}m × ${derived.spacingH.toFixed(2)}m` : undefined}
      />

      <div className="mt-3 rounded-md bg-bg-input p-2.5">
        <div className="text-[10px] font-medium text-text-secondary">估算</div>
        <div className="mt-1 text-[13px] font-bold text-text-primary">{wpCount} 航点</div>
        <div className="text-[10px] text-text-muted">@ {params.speed.toFixed(1)} m/s</div>
      </div>
    </>
  );
}

function ManualBody({ params, onChange }: { params: FacadeScanParams; onChange: (patch: Partial<FacadeScanParams>) => void }) {
  return (
    <>
      <NumRow label="拍摄距离 standoff" value={params.standoff} unit="m" min={3} max={50} step={0.5} onChange={(v) => onChange({ standoff: v })} />
      <NumRow label="水平间距 spacingH" value={params.spacingH} unit="m" min={0.5} max={20} step={0.5} onChange={(v) => onChange({ spacingH: v })} />
      <NumRow label="垂直间距 spacingV" value={params.spacingV} unit="m" min={0.5} max={20} step={0.5} onChange={(v) => onChange({ spacingV: v })} />
      <NumRow label="U 缩进 marginU" value={params.marginU} unit="m" min={0} max={5} step={0.5} onChange={(v) => onChange({ marginU: v })} />
      <NumRow label="V 缩进 marginV" value={params.marginV} unit="m" min={0} max={5} step={0.5} onChange={(v) => onChange({ marginV: v })} />
      <SelectRow
        label="扫描方向"
        value={params.marchOrder}
        options={[
          { value: 'horizontal', label: '水平' },
          { value: 'vertical', label: '垂直' },
        ]}
        onChange={(v) => onChange({ marchOrder: v as 'horizontal' | 'vertical' })}
      />
      <NumRow label="飞行速度" value={params.speed} unit="m/s" min={1} max={10} step={0.5} onChange={(v) => onChange({ speed: v })} />
      <SwitchRow
        label="法向反转"
        value={params.flipNormal}
        onChange={(v) => onChange({ flipNormal: v })}
      />
    </>
  );
}

function SliderRow({ label, value, unit, min, max, step, onChange, deriveText }: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  deriveText?: string;
}) {
  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-text-secondary">{label}</span>
        <span className="text-[11px] font-bold text-accent">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-1.5 w-full appearance-none rounded-full bg-bg-input accent-accent [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer"
      />
      {deriveText && <div className="mt-1 text-[9px] text-text-muted">{deriveText}</div>}
    </div>
  );
}

function NumRow({ label, value, unit, min, max, step, onChange }: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-2 flex h-7 items-center justify-between">
      <span className="text-[10px] font-medium text-text-secondary">{label}</span>
      <label className="flex items-center gap-1 rounded border border-border bg-bg-input px-2 py-1">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
          className="w-14 bg-transparent text-right text-[11px] font-bold text-text-primary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
        />
        <span className="text-[10px] text-text-muted">{unit}</span>
      </label>
    </div>
  );
}

function SelectRow({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-2 flex h-7 items-center justify-between">
      <span className="text-[10px] font-medium text-text-secondary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 rounded border border-border bg-bg-input px-2 text-[11px] text-text-primary focus:border-accent focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mb-2 flex h-7 items-center justify-between">
      <span className="text-[10px] font-medium text-text-secondary">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          'relative h-5 w-9 rounded-full transition',
          value ? 'bg-accent' : 'bg-bg-input border border-border',
        )}
        aria-pressed={value}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full transition',
            value ? 'right-0.5 bg-bg' : 'left-0.5 bg-text-muted',
          )}
        />
      </button>
    </div>
  );
}

void FACADE_DEFAULTS; // 占位，避免 unused import 警告
