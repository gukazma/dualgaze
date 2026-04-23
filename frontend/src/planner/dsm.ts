import * as Cesium from 'cesium';

export interface Dsm {
  origin: Cesium.Cartographic;
  east: Cesium.Cartesian3;
  north: Cesium.Cartesian3;
  up: Cesium.Cartesian3;
  dx: number;
  dy: number;
  width: number;
  height: number;
  heights: Float32Array;
  minH: number;
  maxH: number;
  cartographics: Cesium.Cartographic[];
  normals?: Float32Array;
}

export interface BuildDsmOptions {
  resolution: number;
  batchSize?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function buildDsmCpu(
  scene: Cesium.Scene,
  tileset: Cesium.Cesium3DTileset,
  opts: BuildDsmOptions,
): Promise<Dsm> {
  const sphere = tileset.boundingSphere;
  const centerCart = Cesium.Cartographic.fromCartesian(sphere.center);
  const enuToEcef = Cesium.Transforms.eastNorthUpToFixedFrame(sphere.center);
  const c0 = Cesium.Matrix4.getColumn(enuToEcef, 0, new Cesium.Cartesian4());
  const c1 = Cesium.Matrix4.getColumn(enuToEcef, 1, new Cesium.Cartesian4());
  const c2 = Cesium.Matrix4.getColumn(enuToEcef, 2, new Cesium.Cartesian4());
  const east = Cesium.Cartesian3.normalize(
    new Cesium.Cartesian3(c0.x, c0.y, c0.z),
    new Cesium.Cartesian3(),
  );
  const north = Cesium.Cartesian3.normalize(
    new Cesium.Cartesian3(c1.x, c1.y, c1.z),
    new Cesium.Cartesian3(),
  );
  const up = Cesium.Cartesian3.normalize(
    new Cesium.Cartesian3(c2.x, c2.y, c2.z),
    new Cesium.Cartesian3(),
  );

  const r = sphere.radius;
  const w = Math.max(2, Math.floor((2 * r) / opts.resolution));
  const h = w;
  const cartos: Cesium.Cartographic[] = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const ex = -r + (i + 0.5) * opts.resolution;
      const ny = -r + (j + 0.5) * opts.resolution;
      const ecef = Cesium.Cartesian3.multiplyByScalar(east, ex, new Cesium.Cartesian3());
      const tmp = Cesium.Cartesian3.multiplyByScalar(north, ny, new Cesium.Cartesian3());
      Cesium.Cartesian3.add(ecef, tmp, ecef);
      Cesium.Cartesian3.add(ecef, sphere.center, ecef);
      cartos.push(Cesium.Cartographic.fromCartesian(ecef));
    }
  }

  const batchSize = opts.batchSize ?? 500;
  const total = cartos.length;
  for (let start = 0; start < total; start += batchSize) {
    const batch = cartos.slice(start, start + batchSize);
    await scene.sampleHeightMostDetailed(batch);
    const done = Math.min(start + batchSize, total);
    opts.onProgress?.(done, total);
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  const heights = new Float32Array(w * h);
  let minH = Infinity;
  let maxH = -Infinity;
  for (let k = 0; k < cartos.length; k++) {
    const hv = cartos[k].height;
    const valid = Number.isFinite(hv);
    heights[k] = valid ? hv : NaN;
    if (valid) {
      if (hv < minH) minH = hv;
      if (hv > maxH) maxH = hv;
    }
  }
  if (!Number.isFinite(minH)) minH = 0;
  if (!Number.isFinite(maxH)) maxH = 0;

  const dsm: Dsm = {
    origin: centerCart,
    east,
    north,
    up,
    dx: opts.resolution,
    dy: opts.resolution,
    width: w,
    height: h,
    heights,
    minH,
    maxH,
    cartographics: cartos,
  };
  computeNormals(dsm);
  return dsm;
}

export interface OrthoNadirSetup {
  center: Cesium.Cartesian3;
  east: Cesium.Cartesian3;
  north: Cesium.Cartesian3;
  up: Cesium.Cartesian3;
  radius: number;
  restore: () => void;
}

function enuBasisFromCenter(center: Cesium.Cartesian3): {
  east: Cesium.Cartesian3;
  north: Cesium.Cartesian3;
  up: Cesium.Cartesian3;
} {
  const enuToEcef = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  const c0 = Cesium.Matrix4.getColumn(enuToEcef, 0, new Cesium.Cartesian4());
  const c1 = Cesium.Matrix4.getColumn(enuToEcef, 1, new Cesium.Cartesian4());
  const c2 = Cesium.Matrix4.getColumn(enuToEcef, 2, new Cesium.Cartesian4());
  const east = Cesium.Cartesian3.normalize(
    new Cesium.Cartesian3(c0.x, c0.y, c0.z),
    new Cesium.Cartesian3(),
  );
  const north = Cesium.Cartesian3.normalize(
    new Cesium.Cartesian3(c1.x, c1.y, c1.z),
    new Cesium.Cartesian3(),
  );
  const up = Cesium.Cartesian3.normalize(
    new Cesium.Cartesian3(c2.x, c2.y, c2.z),
    new Cesium.Cartesian3(),
  );
  return { east, north, up };
}

export async function setupOrthoNadir(
  scene: Cesium.Scene,
  tileset: Cesium.Cesium3DTileset,
): Promise<OrthoNadirSetup> {
  const sphere = tileset.boundingSphere;
  const center = sphere.center;
  const r = sphere.radius;
  const { east, north, up } = enuBasisFromCenter(center);

  const origPos = Cesium.Cartesian3.clone(scene.camera.position);
  const origDir = Cesium.Cartesian3.clone(scene.camera.direction);
  const origUp = Cesium.Cartesian3.clone(scene.camera.up);
  const origFrustum = scene.camera.frustum.clone();
  const origSse = tileset.maximumScreenSpaceError;
  const origRenderMode = scene.requestRenderMode;
  const origGlobeShow = scene.globe.show;

  const altitude = r * 2;
  const cameraPos = Cesium.Cartesian3.add(
    center,
    Cesium.Cartesian3.multiplyByScalar(up, altitude, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const downDir = Cesium.Cartesian3.negate(up, new Cesium.Cartesian3());

  scene.camera.setView({
    destination: cameraPos,
    orientation: {
      direction: downDir,
      up: north,
    },
  });

  // 用正射 frustum：width 稍大于 2r，保证 tileset 完整可见
  const canvasW = scene.canvas.clientWidth;
  const canvasH = scene.canvas.clientHeight;
  const aspect = canvasW / canvasH;
  const orthoFrustum = new Cesium.OrthographicFrustum();
  orthoFrustum.width = 2 * r * 1.1 * Math.max(1, aspect);
  orthoFrustum.aspectRatio = aspect;
  orthoFrustum.near = 0.1;
  orthoFrustum.far = altitude * 10;
  scene.camera.frustum = orthoFrustum;

  tileset.maximumScreenSpaceError = 1;
  scene.requestRenderMode = false;
  scene.globe.show = false;

  await new Promise<void>((resolve) => {
    if (tileset.tilesLoaded) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      remove?.();
      clearTimeout(timer);
      resolve();
    };
    const remove = tileset.allTilesLoaded.addEventListener(finish);
    const timer = setTimeout(finish, 30000);
  });

  scene.requestRender();
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  scene.requestRender();
  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  scene.requestRenderMode = true;

  return {
    center,
    east,
    north,
    up,
    radius: r,
    restore: () => {
      scene.camera.frustum = origFrustum;
      scene.camera.setView({
        destination: origPos,
        orientation: {
          direction: origDir,
          up: origUp,
        },
      });
      tileset.maximumScreenSpaceError = origSse;
      scene.requestRenderMode = origRenderMode;
      scene.globe.show = origGlobeShow;
      scene.requestRender();
    },
  };
}

export async function buildDsmGpu(
  scene: Cesium.Scene,
  tileset: Cesium.Cesium3DTileset,
  opts: BuildDsmOptions,
): Promise<Dsm> {
  const resolution = opts.resolution;
  const batchSize = opts.batchSize ?? 500;

  const setup = await setupOrthoNadir(scene, tileset);
  try {
    const center = setup.center;
    const east = setup.east;
    const north = setup.north;
    const up = setup.up;
    const r = setup.radius;
    const w = Math.max(2, Math.floor((2 * r) / resolution));
    const h = w;
    const total = w * h;

    const heights = new Float32Array(w * h);
    const cartographics: Cesium.Cartographic[] = [];
    let minH = Infinity;
    let maxH = -Infinity;
    const canvasPos = new Cesium.Cartesian2();
    const pickResult = new Cesium.Cartesian3();
    let processed = 0;

    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        const ex = -r + (i + 0.5) * resolution;
        const ny = -r + (j + 0.5) * resolution;

        // ENU (ex, ny, 0) → ECEF ground position
        const ecefGround = Cesium.Cartesian3.clone(center);
        Cesium.Cartesian3.add(
          ecefGround,
          Cesium.Cartesian3.multiplyByScalar(east, ex, new Cesium.Cartesian3()),
          ecefGround,
        );
        Cesium.Cartesian3.add(
          ecefGround,
          Cesium.Cartesian3.multiplyByScalar(north, ny, new Cesium.Cartesian3()),
          ecefGround,
        );

        // World → canvas pixel
        const screen = Cesium.SceneTransforms.worldToWindowCoordinates(
          scene,
          ecefGround,
          canvasPos,
        );
        let hv = NaN;
        if (screen) {
          const picked = scene.pickPosition(screen, pickResult);
          if (picked) {
            const carto = Cesium.Cartographic.fromCartesian(picked);
            hv = carto.height;
            cartographics.push(carto);
            if (hv < minH) minH = hv;
            if (hv > maxH) maxH = hv;
          }
        }
        heights[k] = hv;
        if (!Number.isFinite(hv)) {
          cartographics.push(Cesium.Cartographic.fromCartesian(ecefGround));
        }

        processed++;
        if (processed % batchSize === 0) {
          opts.onProgress?.(processed, total);
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
    }
    opts.onProgress?.(total, total);

    if (!Number.isFinite(minH)) minH = 0;
    if (!Number.isFinite(maxH)) maxH = 0;

    const dsm: Dsm = {
      origin: Cesium.Cartographic.fromCartesian(center),
      east,
      north,
      up,
      dx: resolution,
      dy: resolution,
      width: w,
      height: h,
      heights,
      minH,
      maxH,
      cartographics,
    };
    computeNormals(dsm);
    return dsm;
  } finally {
    setup.restore();
  }
}

export const buildDsm = buildDsmGpu;

export function computeNormals(d: Dsm): void {
  const w = d.width;
  const h = d.height;
  const normals = new Float32Array(w * h * 3);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const hc = d.heights[k];
      if (!Number.isFinite(hc)) {
        normals[3 * k] = NaN;
        normals[3 * k + 1] = NaN;
        normals[3 * k + 2] = NaN;
        continue;
      }
      const iE = i + 1 < w ? i + 1 : i - 1;
      const jN = j + 1 < h ? j + 1 : j - 1;
      const hE = d.heights[j * w + iE];
      const hN = d.heights[jN * w + i];
      if (!Number.isFinite(hE) || !Number.isFinite(hN)) {
        normals[3 * k] = 0;
        normals[3 * k + 1] = 0;
        normals[3 * k + 2] = 1;
        continue;
      }
      const sx = iE > i ? 1 : -1;
      const sy = jN > j ? 1 : -1;
      const dhE = (hE - hc) * sx;
      const dhN = (hN - hc) * sy;
      let nx = -dhE;
      let ny = -dhN;
      let nz = d.dx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 1e-9) {
        nx /= len;
        ny /= len;
        nz /= len;
      } else {
        nx = 0;
        ny = 0;
        nz = 1;
      }
      normals[3 * k] = nx;
      normals[3 * k + 1] = ny;
      normals[3 * k + 2] = nz;
    }
  }
  d.normals = normals;
}
