import type { Pt } from "../data/saipan";

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const lerpPt = (a: Pt, b: Pt, k: number): Pt => [
  lerp(a[0], b[0], k),
  lerp(a[1], b[1], k),
];

/** キーフレーム間を線形補間した多角形の頂点列を返す(範囲外は端の値に固定) */
export function interpPoly(keys: { t: number; pts: Pt[] }[], t: number): Pt[] {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (t <= first.t) return first.pts;
  if (t >= last.t) return last.pts;
  let i = 0;
  while (keys[i + 1].t < t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const k = (t - a.t) / (b.t - a.t);
  return a.pts.map((p, j) => lerpPt(p, b.pts[j], k));
}

/** キーフレーム間を線形補間した1点の位置を返す */
export function interpPoint(keys: { t: number; p: Pt }[], t: number): Pt {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (t <= first.t) return first.p;
  if (t >= last.t) return last.p;
  let i = 0;
  while (keys[i + 1].t < t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  return lerpPt(a.p, b.p, (t - a.t) / (b.t - a.t));
}

export const pointsAttr = (pts: Pt[]) =>
  pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/** 点列を通る滑らかな閉曲線(Catmull-Rom → Bézier)のSVGパスを返す */
export function smoothClosedPath(pts: Pt[]): string {
  const n = pts.length;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return `${d}Z`;
}
