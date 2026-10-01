"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ARROWS,
  BATTLE_EVENTS,
  CARRIERS,
  CIVIL_SITES,
  CIVIL_START_T,
  END_T,
  IMPACTS,
  ISLAND_PTS,
  KIND_META,
  LANDMARKS,
  MAP_H,
  MAP_W,
  POCKET_END_T,
  POCKET_KEYS,
  PREP_END_T,
  PREP_START_T,
  RESULT,
  SECURED_T,
  SEA_BATTLE_END_T,
  SEA_BATTLE_START_T,
  SHIPS,
  SOURCE_NOTE,
  START_T,
  T0_UTC,
  UNITS,
  US_KEYS,
  type ArrowDef,
  type BattleEvent,
  type Pt,
} from "../data/saipan";
import {
  clamp01,
  interpPoint,
  interpPoly,
  lerpPt,
  pointsAttr,
  smoothClosedPath,
} from "../lib/anim";

const ISLAND_D = smoothClosedPath(ISLAND_PTS);

const COLORS = {
  jp: "#a8503f",
  us: "#3f78b5",
  usLight: "#7fb6ea",
  jpLight: "#f08b78",
  flash: "#ffd36b",
};

/** 1倍速で1秒あたり進める日数 */
const DAYS_PER_SEC = 0.9;
/** イベント到達時に止める秒数(1倍速のとき。速度に反比例して短くなる) */
const HOLD_SEC = 2.4;
const SPEEDS = [0.5, 1, 2, 4];
/** 縦横比の余白に海を延ばすための余白(px) */
const SEA_PAD = 600;

/** 時刻 t(日)を「月・日」に変換する */
function dateParts(t: number) {
  const d = new Date(T0_UTC + Math.floor(t + 1e-9) * 86_400_000);
  return { m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

function dayLabel(t: number) {
  const n = Math.floor(t + 1e-9);
  return n < 0 ? `上陸の${-n}日前` : `上陸${n + 1}日目`;
}

function eventDate(e: BattleEvent) {
  if (e.dateLabel) return e.dateLabel;
  const { m, d } = dateParts(e.t);
  return `${m}月${d}日`;
}

export default function SaipanBattle() {
  const [t, setT] = useState(START_T);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [holdOnEvent, setHoldOnEvent] = useState(true);

  const tRef = useRef(START_T);
  const holdRef = useRef(0);
  const listRef = useRef<HTMLOListElement>(null);

  const setTime = (v: number) => {
    tRef.current = v;
    setT(v);
  };

  /* 再生ループ */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (holdRef.current > 0) {
        holdRef.current -= dt;
      } else {
        const prev = tRef.current;
        let next = prev + dt * DAYS_PER_SEC * speed;
        if (holdOnEvent) {
          const hit = BATTLE_EVENTS.find((e) => e.t > prev && e.t <= next);
          if (hit) {
            next = hit.t;
            holdRef.current = Math.max(0.6, HOLD_SEC / speed);
          }
        }
        if (next >= END_T) {
          next = END_T;
          setPlaying(false);
        }
        setTime(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, holdOnEvent]);

  /* 現在のイベント */
  const currentIdx = useMemo(() => {
    let idx = -1;
    BATTLE_EVENTS.forEach((e, i) => {
      if (e.t <= t + 1e-9) idx = i;
    });
    return idx;
  }, [t]);
  const current = currentIdx >= 0 ? BATTLE_EVENTS[currentIdx] : null;

  /* 一覧の現在行が見えるようにスクロール(ページ全体は動かさない) */
  useEffect(() => {
    const list = listRef.current;
    const el = list?.children[currentIdx] as HTMLElement | undefined;
    if (!list || !el) return;
    const top = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2;
    list.scrollTo({ top, behavior: "smooth" });
  }, [currentIdx]);

  const togglePlay = () => {
    if (!playing && tRef.current >= END_T - 1e-6) setTime(START_T);
    holdRef.current = 0;
    setPlaying((p) => !p);
  };
  const reset = () => {
    setPlaying(false);
    holdRef.current = 0;
    setTime(START_T);
  };
  const seek = (v: number) => {
    holdRef.current = 0;
    setTime(Math.min(END_T, Math.max(START_T, v)));
  };
  const stepEvent = (dir: 1 | -1) => {
    const now = tRef.current;
    const target =
      dir === 1
        ? BATTLE_EVENTS.find((e) => e.t > now + 1e-3)
        : [...BATTLE_EVENTS].reverse().find((e) => e.t < now - 1e-3);
    seek(target ? target.t : dir === 1 ? END_T : START_T);
  };

  /* 描画用の派生値 */
  const us = t >= US_KEYS[0].t ? interpPoly(US_KEYS, t) : null;
  const pocket =
    t >= POCKET_KEYS[0].t && t < POCKET_END_T ? interpPoly(POCKET_KEYS, t) : null;
  const secured = t >= SECURED_T;
  const frontFade = 1 - clamp01((t - SECURED_T) / 0.6);
  const prepActive = t >= PREP_START_T && t <= PREP_END_T;
  const { m, d } = dateParts(t);
  const meta = current ? KIND_META[current.kind] : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="mx-auto max-w-7xl px-4 pb-3 pt-6 sm:px-6">
        <p className="text-xs tracking-[0.25em] text-sky-300/80">
          1944.6.15 — 7.9　MARIANAS CAMPAIGN
        </p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
          サイパンの戦い　経過アニメーション
        </h1>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 pb-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a2342] shadow-lg">
            <svg
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              role="img"
              aria-label={`サイパン島の戦況図。${m}月${d}日時点`}
              className="mx-auto block max-h-[78vh] w-full"
            >
              <defs>
                <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#0b2a4d" />
                  <stop offset="1" stopColor="#0f3a63" />
                </linearGradient>
                <clipPath id="island-clip">
                  <path d={ISLAND_D} />
                </clipPath>
                <pattern
                  id="hatch"
                  width="7"
                  height="7"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(0,0,0,0.22)" strokeWidth="2.2" />
                </pattern>
              </defs>

              {/* 海と緯度経度の目盛り */}
              <rect x={-SEA_PAD} width={MAP_W + SEA_PAD * 2} height={MAP_H} fill="url(#sea)" />
              <g stroke="rgba(255,255,255,0.05)" strokeWidth="1">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <line key={`h${i}`} x1={-SEA_PAD} x2={MAP_W + SEA_PAD} y1={i * 105} y2={i * 105} />
                ))}
                {Array.from({ length: 19 }, (_, i) => (i - 6) * 93).map((x) => (
                  <line key={`v${x}`} y1="0" y2={MAP_H} x1={x} x2={x} />
                ))}
              </g>

              {/* 浅瀬 */}
              <path d={ISLAND_D} fill="none" stroke="rgba(120,200,255,0.16)" strokeWidth="26" strokeLinejoin="round" />
              <path d={ISLAND_D} fill="none" stroke="rgba(120,200,255,0.18)" strokeWidth="11" strokeLinejoin="round" />

              {/* 米艦隊 */}
              {SHIPS.map((s, i) => (
                <Ship key={i} {...s} bob={Math.sin(t * 28 + i * 1.3) * 0.9} />
              ))}

              {/* 艦砲射撃の弾道 */}
              {prepActive && t >= -2 &&
                SHIPS.filter((s) => s.type === "bb").map((s, i) => {
                  const imp = IMPACTS[(i * 3) % IMPACTS.length];
                  const on = Math.sin(t * 55 + i * 2.1) > 0.2;
                  return on ? (
                    <g key={i}>
                      <line x1={s.x + 6} y1={s.y} x2={imp[0]} y2={imp[1]} stroke={COLORS.flash} strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="3 5" />
                      <circle cx={s.x + 7} cy={s.y} r="3" fill={COLORS.flash} opacity="0.85" />
                    </g>
                  ) : null;
                })}

              {/* 島 */}
              <g clipPath="url(#island-clip)">
                <rect width={MAP_W} height={MAP_H} fill={COLORS.jp} />
                <rect width={MAP_W} height={MAP_H} fill="url(#hatch)" />
                {us && (
                  <polygon points={pointsAttr(us)} fill={COLORS.us} fillOpacity="0.92" />
                )}
                {pocket && (
                  <g>
                    <polygon points={pointsAttr(pocket)} fill={COLORS.jp} />
                    <polygon points={pointsAttr(pocket)} fill="url(#hatch)" />
                  </g>
                )}
                {/* 空襲・砲撃の着弾 */}
                {prepActive &&
                  IMPACTS.map((p, i) => {
                    const a = Math.max(0, Math.sin(t * 47 + i * 1.9));
                    return a > 0.15 ? (
                      <circle key={i} cx={p[0]} cy={p[1]} r={3 + a * 6} fill={COLORS.flash} opacity={a * 0.8} />
                    ) : null;
                  })}
                {/* 戦線 */}
                {us && !secured && (
                  <polyline
                    points={pointsAttr(us.slice(0, 6))}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.2"
                    strokeDasharray="7 5"
                    strokeLinejoin="round"
                    opacity={0.9 * frontFade}
                  />
                )}
                {us && frontFade > 0 &&
                  [1, 2, 3, 4].map((i) => {
                    const a = 0.5 + 0.5 * Math.sin(t * 61 + i * 1.7);
                    return (
                      <circle
                        key={i}
                        cx={us[i][0] + Math.sin(t * 23 + i) * 6}
                        cy={us[i][1] - 7 - a * 5}
                        r={2 + a * 2.6}
                        fill={COLORS.flash}
                        opacity={(0.35 + a * 0.5) * frontFade}
                      />
                    );
                  })}
              </g>
              <path d={ISLAND_D} fill="none" stroke="#e9dcc3" strokeWidth="1.6" strokeLinejoin="round" opacity="0.8" />

              {/* ナフタン岬の日本軍 */}
              {pocket && pocket[1][0] - pocket[0][0] > 60 && (
                <text
                  x={(pocket[0][0] + pocket[1][0]) / 2 - 8}
                  y={pocket[0][1] + 17}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#ffe3dc"
                  stroke="rgba(0,0,0,0.55)"
                  strokeWidth="2.5"
                  paintOrder="stroke"
                >
                  孤立した日本軍
                </text>
              )}

              {/* 地名 */}
              {LANDMARKS.map((lm) => (
                <g key={lm.id}>
                  <LandmarkIcon kind={lm.icon} p={lm.p} />
                  <text
                    x={lm.p[0] + lm.dx}
                    y={lm.p[1] + lm.dy}
                    textAnchor={lm.anchor}
                    fontSize="12"
                    fill="#fff"
                    stroke="rgba(8,20,38,0.85)"
                    strokeWidth="3.5"
                    paintOrder="stroke"
                    strokeLinejoin="round"
                  >
                    {lm.label}
                  </text>
                </g>
              ))}

              {/* 攻撃の矢印 */}
              {ARROWS.map((a) => (
                <BattleArrow key={a.id} a={a} t={t} />
              ))}

              {/* 部隊 */}
              {UNITS.map((u) => {
                if (t < u.from) return null;
                const p =
                  t >= u.attachFrom && us
                    ? u.attach(us)
                    : interpPoint(u.keys, t);
                return (
                  <UnitFlag
                    key={u.id}
                    label={u.label}
                    p={p}
                    opacity={clamp01((t - u.from) / 0.25) * (1 - clamp01((t - SECURED_T) / 1.0))}
                  />
                );
              })}

              {/* 上陸用舟艇 */}
              {t >= 0.2 && t <= 0.6 &&
                Array.from({ length: 22 }, (_, i) => {
                  const p = clamp01((t - (0.22 + i * 0.004)) / 0.12);
                  const x = 74 + p * 86;
                  const y = 548 + i * 6.6;
                  return (
                    <g key={i} opacity={1 - clamp01((t - 0.42) / 0.16)}>
                      <line x1={x - 12} y1={y} x2={x} y2={y} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
                      <rect x={x - 2} y={y - 2} width="6" height="4" rx="1" fill="#fff" />
                    </g>
                  );
                })}

              {/* 空襲機 */}
              {prepActive &&
                Array.from({ length: 6 }, (_, i) => {
                  const ph = (((t + 4) * 1.9 + i * 0.17) % 1 + 1) % 1;
                  const x = -20 + ph * (MAP_W + 40);
                  const y = 150 + i * 105 + Math.sin(t * 9 + i) * 6;
                  return (
                    <path
                      key={i}
                      d="M10,0 L-6,-6 L-3,0 L-6,6 Z M2,-1 L2,-9 L4,-9 L5,-1 M2,1 L2,9 L4,9 L5,1"
                      transform={`translate(${x} ${y})`}
                      fill="#cfe3ff"
                      stroke="#0a2342"
                      strokeWidth="0.6"
                    />
                  );
                })}

              {/* 民間人の悲劇を示す静かな波紋 */}
              {t >= CIVIL_START_T &&
                CIVIL_SITES.map((p, i) =>
                  [0, 1, 2].map((k) => {
                    const ph = (((t - CIVIL_START_T) * 1.4 + k / 3 + i * 0.2) % 1 + 1) % 1;
                    return (
                      <circle
                        key={`${i}-${k}`}
                        cx={p[0]}
                        cy={p[1]}
                        r={4 + ph * 22}
                        fill="none"
                        stroke="#f1f5f9"
                        strokeWidth="1.2"
                        opacity={(1 - ph) * 0.7}
                      />
                    );
                  }),
                )}

              {/* イベントの強調 */}
              {current?.focus && t - current.t < 1.6 && meta && (
                <g key={current.id} transform={`translate(${current.focus[0]} ${current.focus[1]})`}>
                  <circle className="pulse-ring" r="16" fill="none" stroke={meta.color} strokeWidth="2.5" />
                  <circle r="3.5" fill={meta.color} />
                </g>
              )}

              {/* マリアナ沖海戦 */}
              <SeaBattleInset t={t} />

              {/* 日付表示と方位 */}
              <g>
                <rect x="10" y="10" width="150" height="64" rx="8" fill="rgba(5,12,24,0.72)" stroke="rgba(255,255,255,0.14)" />
                <text x="22" y="46" fontSize="30" fontWeight="700" fill="#fff">
                  {m}月{d}日
                </text>
                <text x="22" y="64" fontSize="11" fill="#9db4d1">
                  {dayLabel(t)}　1944年
                </text>
              </g>
              <g transform={`translate(${MAP_W - 30} 34)`} fill="#cfe0f5">
                <path d="M0,-18 L5,-2 L0,-6 L-5,-2 Z" />
                <text y="14" textAnchor="middle" fontSize="11" fontWeight="700">北</text>
              </g>
              <text x={MAP_W - 12} y={MAP_H - 10} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.4)">
                概略図(縮尺は不正確)
              </text>
            </svg>
          </div>

          {/* 操作パネル */}
          <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/70 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <IconButton label="最初に戻る" onClick={reset}>
                <path d="M6 5v14M19 5l-9 7 9 7z" />
              </IconButton>
              <IconButton label="前のできごと" onClick={() => stepEvent(-1)}>
                <path d="M15 5l-8 7 8 7z" />
              </IconButton>
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? "一時停止" : "再生"}
                className="flex h-11 min-w-24 items-center justify-center gap-2 rounded-full bg-sky-500 px-5 text-sm font-bold text-slate-950 transition hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                  {playing ? <path d="M6 5h4v14H6zM14 5h4v14h-4z" /> : <path d="M7 4l13 8-13 8z" />}
                </svg>
                {playing ? "一時停止" : t >= END_T - 1e-6 ? "もう一度" : "再生"}
              </button>
              <IconButton label="次のできごと" onClick={() => stepEvent(1)}>
                <path d="M9 5l8 7-8 7z" />
              </IconButton>

              <div className="ml-auto flex items-center gap-1" role="group" aria-label="再生速度">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeed(s)}
                    aria-pressed={speed === s}
                    className={`h-8 rounded-md px-2.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${
                      speed === s
                        ? "bg-white text-slate-900"
                        : "bg-white/10 text-slate-200 hover:bg-white/20"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            <div className="relative mt-4">
              <input
                type="range"
                min={START_T}
                max={END_T}
                step={0.01}
                value={t}
                onChange={(e) => seek(parseFloat(e.target.value))}
                aria-label="時間軸"
                className="h-2 w-full cursor-pointer accent-sky-400"
              />
              <div className="relative mx-[7px] mt-1 h-4">
                {BATTLE_EVENTS.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => seek(e.t)}
                    title={`${eventDate(e)} ${e.title}`}
                    aria-label={`${eventDate(e)} ${e.title}`}
                    style={{
                      left: `${((e.t - START_T) / (END_T - START_T)) * 100}%`,
                      background: KIND_META[e.kind].color,
                    }}
                    className="absolute top-0.5 h-3 w-1.5 -translate-x-1/2 rounded-sm opacity-80 transition hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                <span>6/11</span>
                <span>6/15 上陸</span>
                <span>7/9 終結</span>
              </div>
            </div>

            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={holdOnEvent}
                onChange={(e) => setHoldOnEvent(e.target.checked)}
                className="h-4 w-4 accent-sky-400"
              />
              できごとの場面で自動的に一時停止する
            </label>
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-3">
          <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4" aria-live="polite">
            {current && meta ? (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className="rounded px-1.5 py-0.5 font-bold text-slate-950"
                    style={{ background: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-slate-400">{eventDate(current)}</span>
                </div>
                <h2 className="mt-2 text-lg font-bold leading-snug">{current.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{current.body}</p>
              </>
            ) : (
              <p className="text-sm text-slate-400">「再生」を押すと戦いの経過が始まります。</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {RESULT.forces.map((f, i) => (
              <div key={f.label} className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: i === 0 ? COLORS.usLight : COLORS.jpLight }}
                  />
                  {f.label}
                </div>
                <div className="mt-1 text-xl font-bold">{f.value}</div>
              </div>
            ))}
          </div>

          {secured && (
            <div className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-4">
              <h3 className="text-sm font-bold text-amber-200">戦いの結果と、その後</h3>
              <dl className="mt-2 space-y-1.5 text-sm">
                {RESULT.casualties.map((c) => (
                  <div key={c.label} className="flex gap-2">
                    <dt className="w-14 shrink-0 text-slate-400">{c.label}</dt>
                    <dd className="text-slate-200">{c.value}</dd>
                  </div>
                ))}
              </dl>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
                {RESULT.aftermath.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
            <h3 className="mb-2 px-1 text-xs font-bold tracking-wider text-slate-400">経過の一覧</h3>
            <ol ref={listRef} className="relative max-h-72 space-y-0.5 overflow-y-auto pr-1">
              {BATTLE_EVENTS.map((e, i) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => seek(e.t)}
                    aria-current={i === currentIdx ? "step" : undefined}
                    className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${
                      i === currentIdx
                        ? "bg-white/15 text-white"
                        : i < currentIdx
                          ? "text-slate-300 hover:bg-white/10"
                          : "text-slate-500 hover:bg-white/10"
                    }`}
                  >
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: KIND_META[e.kind].color }}
                    />
                    <span className="w-24 shrink-0 text-xs leading-6 text-slate-400">
                      {eventDate(e)}
                    </span>
                    <span className="leading-6">{e.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3 text-xs text-slate-300">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              <Legend color={COLORS.us} label="米軍の支配地域" />
              <Legend color={COLORS.jp} label="日本軍の支配地域" />
              <Legend color="#fff" label="戦線" dashed />
            </div>
          </div>

          <p className="px-1 text-[11px] leading-relaxed text-slate-500">{SOURCE_NOTE}</p>
        </aside>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------ 部品 */

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-slate-100 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        aria-hidden
      >
        {children}
      </svg>
    </button>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {dashed ? (
        <svg viewBox="0 0 20 4" className="h-1 w-5" aria-hidden>
          <line x1="0" y1="2" x2="20" y2="2" stroke={color} strokeWidth="2" strokeDasharray="5 3" />
        </svg>
      ) : (
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} />
      )}
      {label}
    </span>
  );
}

function Ship({ x, y, type, bob }: { x: number; y: number; type: "cv" | "bb" | "dd"; bob: number }) {
  const len = type === "cv" ? 15 : type === "bb" ? 12 : 8;
  const w = type === "cv" ? 4.5 : 3.2;
  return (
    <g transform={`translate(${x} ${y + bob})`}>
      <path
        d={`M0,${-len} L${w},${-len / 2} L${w},${len} L${-w},${len} L${-w},${-len / 2} Z`}
        fill="#bcd4ee"
        stroke="#0a2342"
        strokeWidth="0.8"
      />
      {type === "cv" && <rect x={-w + 1} y={-len / 2} width={2 * w - 2} height={len * 1.3} fill="#7f9bbd" />}
      <line x1={0} y1={len} x2={0} y2={len + 9} stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
    </g>
  );
}

function LandmarkIcon({ kind, p }: { kind?: string; p: Pt }) {
  const [x, y] = p;
  switch (kind) {
    case "peak":
      return <path d={`M${x - 7},${y + 5} L${x},${y - 7} L${x + 7},${y + 5} Z`} fill="#f2e3c5" stroke="#3b2a17" strokeWidth="1" />;
    case "airfield":
      return (
        <g stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round">
          <line x1={x - 8} y1={y + 4} x2={x + 8} y2={y - 4} stroke="#2a2a2a" strokeWidth="4" />
          <line x1={x - 8} y1={y + 4} x2={x + 8} y2={y - 4} />
        </g>
      );
    case "cliff":
      return <path d={`M${x - 5},${y - 4} L${x + 5},${y - 4} L${x + 2},${y + 5} L${x - 2},${y + 5} Z`} fill="#e9dcc3" stroke="#3b2a17" strokeWidth="0.8" />;
    case "town":
      return <rect x={x - 3.5} y={y - 3.5} width="7" height="7" fill="#fff" stroke="#1d2b3d" strokeWidth="1.2" />;
    default:
      return <circle cx={x} cy={y} r="3" fill="#fff" stroke="#1d2b3d" strokeWidth="1.2" />;
  }
}

function BattleArrow({ a, t }: { a: ArrowDef; t: number }) {
  if (t < a.t0) return null;
  const opacity = 1 - clamp01((t - a.t1) / 0.6);
  if (opacity <= 0) return null;
  const k = clamp01((t - a.t0) / (a.t1 - a.t0));
  const tip = lerpPt(a.from, a.to, k);
  const angle = (Math.atan2(a.to[1] - a.from[1], a.to[0] - a.from[0]) * 180) / Math.PI;
  const color = a.side === "us" ? "#9fd0ff" : "#ff8a76";
  return (
    <g opacity={opacity * 0.95}>
      <line
        x1={a.from[0]}
        y1={a.from[1]}
        x2={tip[0]}
        y2={tip[1]}
        stroke="rgba(0,0,0,0.5)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <line
        x1={a.from[0]}
        y1={a.from[1]}
        x2={tip[0]}
        y2={tip[1]}
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <polygon
        points="2,0 -11,-7 -11,7"
        transform={`translate(${tip[0]} ${tip[1]}) rotate(${angle})`}
        fill={color}
        stroke="rgba(0,0,0,0.5)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </g>
  );
}

function UnitFlag({ label, p, opacity }: { label: string; p: Pt; opacity: number }) {
  const w = label.length * 11 + 14;
  return (
    <g transform={`translate(${p[0]} ${p[1]})`} opacity={opacity}>
      <rect x={-w / 2} y="-9" width={w} height="18" rx="3" fill="#0b2748" stroke="#9fd0ff" strokeWidth="1.2" />
      <text y="4.2" textAnchor="middle" fontSize="11" fontWeight="700" fill="#e8f3ff">
        {label}
      </text>
    </g>
  );
}

function SeaBattleInset({ t }: { t: number }) {
  const fadeIn = clamp01((t - (SEA_BATTLE_START_T - 0.1)) / 0.3);
  const fadeOut = 1 - clamp01((t - SEA_BATTLE_END_T) / 0.3);
  const opacity = Math.min(fadeIn, fadeOut);
  if (opacity <= 0) return null;
  return (
    <g transform="translate(10 96)" opacity={opacity}>
      <rect width="196" height="160" rx="8" fill="rgba(5,12,24,0.82)" stroke="#4fd1c5" strokeOpacity="0.6" />
      <text x="10" y="19" fontSize="12.5" fontWeight="700" fill="#4fd1c5">
        マリアナ沖海戦(6/19〜20)
      </text>
      <text x="10" y="34" fontSize="9.5" fill="#9db4d1">
        ※ 実際はサイパン島の遥か西の海域
      </text>
      {Array.from({ length: 6 }, (_, i) => {
        const ph = (((t * 2.2 + i * 0.17) % 1) + 1) % 1;
        const y = 50 + i * 9;
        const xr = 184 - ph * 160;
        const xb = 184 - ((ph + 0.12) % 1) * 160;
        return (
          <g key={i}>
            <path d={`M${xr},${y} l8,-3 l0,6 Z`} fill="#ff8a76" />
            <path d={`M${xb},${y + 4} l8,-3 l0,6 Z`} fill="#9fd0ff" />
          </g>
        );
      })}
      {CARRIERS.map((c, i) => {
        const sunk = t >= c.t;
        return (
          <g key={c.name} transform={`translate(10 ${116 + i * 16})`}>
            <text fontSize="11.5" fill={sunk ? "#ff8a76" : "#e5e7eb"} textDecoration={sunk ? "line-through" : undefined}>
              空母「{c.name}」
            </text>
            <text x="176" textAnchor="end" fontSize="11" fill={sunk ? "#ff8a76" : "#6b7a90"}>
              {sunk ? `${c.date} 沈没` : "—"}
            </text>
          </g>
        );
      })}
    </g>
  );
}
