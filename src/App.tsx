import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { JSX } from "react";

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function useAnimationFrame(callback: (t: number) => void, running: boolean) {
  const cbRef = useRef(callback);
  useEffect(() => { cbRef.current = callback; }, [callback]);
  useEffect(() => {
    if (!running) return;
    let rafId: number;
    const loop = (now: number) => {
      cbRef.current(now);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [running]);
}

function makeSeededRNG(seedStr: string = "seed"): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  let x = (h || 123456789) >>> 0;
  return function () {
    x ^= x << 13; x >>>= 0; x ^= x >> 17; x >>>= 0; x ^= x << 5; x >>>= 0;
    return (x >>> 0) / 0xffffffff;
  };
}

const IconPlay = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...p} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
);
const IconPause = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...p} viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>
);
const IconRefresh = (p: React.SVGProps<SVGSVGElement>) => (
  <svg {...p} viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.95 7.95 0 0012 4a8 8 0 108 8h-2a6 6 0 11-6-6c1.66 0 3.14.69 4.22 1.78L13 13h7V6l-2.35 2.35z"/></svg>
);

function wrapIndex(x: number, n: number): number { let y = x % n; if (y < 0) y += n; return y; }

interface RDCanvasProps {
  width?: number;
  height?: number;
  gridN?: number;
  Du: number;
  Dv: number;
  F: number;
  k: number;
  dt: number;
  stepsPerFrame: number;
  running: boolean;
  seed: string;
  reseedSignal: number;
}

function ReactionDiffusionCanvas({
  width = 500,
  height = 500,
  gridN = 256,
  Du,
  Dv,
  F,
  k,
  dt,
  stepsPerFrame,
  running,
  seed,
  reseedSignal,
}: RDCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const [n, setN] = useState<number>(gridN);
  useEffect(() => { setN(gridN); }, [gridN]);

  const state = useMemo(() => {
    const N = n * n; return { u: new Float32Array(N), v: new Float32Array(N), u2: new Float32Array(N), v2: new Float32Array(N) };
  }, [n]);

  const paramsRef = useRef<{Du:number;Dv:number;F:number;k:number;dt:number;stepsPerFrame:number}>({ Du, Dv, F, k, dt, stepsPerFrame });
  useEffect(() => { paramsRef.current = { Du, Dv, F, k, dt, stepsPerFrame }; }, [Du, Dv, F, k, dt, stepsPerFrame]);

  useEffect(() => { const off = document.createElement("canvas"); off.width = n; off.height = n; offRef.current = off; }, [n]);

  const reseed = useCallback(() => {
    const { u, v } = state; const rng = makeSeededRNG(seed || "rdx");
    u.fill(1); v.fill(0);
    const boxes = 4;
    for (let b = 0; b < boxes; b++) {
      const cx = Math.floor(rng() * n); const cy = Math.floor(rng() * n); const rad = Math.floor(n * 0.03) + 5;
      for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
        const X = wrapIndex(cx + x, n), Y = wrapIndex(cy + y, n); const idx = Y * n + X;
        if (x * x + y * y <= rad * rad) { u[idx] = 0.50 + 0.1 * rng(); v[idx] = 0.25 + 0.1 * rng(); }
      }
    }
    const N = n * n; for (let i = 0; i < N * 0.02; i++) { const idx = Math.floor(rng() * N); u[idx] = 0.5; v[idx] = 0.25; }
  }, [n, state, seed]);

  useEffect(() => { reseed(); }, [reseed]);
  useEffect(() => { reseed(); }, [reseed, reseedSignal]);

  const step = useCallback(() => {
    const { u, v, u2, v2 } = state; const { Du, Dv, F, k, dt } = paramsRef.current;
    const lap = (arr: Float32Array, x: number, y: number): number => {
      const xm = wrapIndex(x - 1, n), xp = wrapIndex(x + 1, n), ym = wrapIndex(y - 1, n), yp = wrapIndex(y + 1, n); const c = y * n + x;
      return arr[y * n + xm] + arr[y * n + xp] + arr[ym * n + x] + arr[yp * n + x] - 4 * arr[c];
    };
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const idx = y * n + x, u0 = u[idx], v0 = v[idx];
      const Lu = lap(u, x, y), Lv = lap(v, x, y), uvv = u0 * v0 * v0;
      const du = Du * Lu - uvv + F * (1 - u0), dv = Dv * Lv + uvv - (F + k) * v0;
      u2[idx] = u0 + du * dt; v2[idx] = v0 + dv * dt;
    }
    state.u.set(state.u2); state.v.set(state.v2);
  }, [n, state]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; const off = offRef.current;
    if (!canvas || !off) return;
    const ctx = canvas.getContext("2d"); const octx = off.getContext("2d");
    if (!ctx || !octx) return;
    const image = octx.createImageData(n, n); const data = image.data; const { u, v } = state; let p = 0;
    for (let i = 0; i < n * n; i++) { const r = Math.round(clamp(255 * v[i], 0, 255)), g = Math.round(clamp(255 * u[i], 0, 255)), b = Math.round(clamp(255 * (1 - u[i]), 0, 255)); data[p++] = r; data[p++] = g; data[p++] = b; data[p++] = 255; }
    octx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }, [n, state]);

  useAnimationFrame(() => { for (let s = 0; s < paramsRef.current.stepsPerFrame; s++) step(); draw(); }, running);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return; const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(width * dpr); c.height = Math.floor(height * dpr); c.style.width = `${width}px`; c.style.height = `${height}px`;
  }, [width, height]);

  return (
    <div className="w-full">
      <canvas ref={canvasRef} className="rounded-2xl shadow-xl border border-white/20 bg-black/5 dark:bg-white/5 backdrop-blur-sm w-full h-full" />
    </div>
  );
}

const PRESETS = [{ name: "Mazes (F=0.029, k=0.057)", Du: 0.16, Dv: 0.08, F: 0.029, k: 0.057 },
	{ name: "Worms (F=0.022, k=0.051)",  Du: 0.16, Dv: 0.08, F: 0.022, k: 0.051 },
	{ name: "Spots (F=0.03, k=0.062)",  Du: 0.16, Dv: 0.08, F: 0.03, k: 0.062 },
	{ name: "Pulsating spots (F=0.025, k=0.06)", Du: 0.16, Dv: 0.08, F: 0.025, k: 0.06},
	{ name: "Holes (F=0.039, k=0.058)",  Du: 0.16, Dv: 0.08, F: 0.039, k: 0.058 },
	{ name: "Spatiotemporal chaos (F=0.026, k=0.051)",  Du: 0.16, Dv: 0.08, F: 0.026, k: 0.051 },
	{ name: "Spatiotemporal chaos and holes (F=0.034, k=0.056)",  Du: 0.16, Dv: 0.08, F: 0.034, k: 0.056 },
	{ name: "Moving spots (F=0.014, k=0.054)",  Du: 0.16, Dv: 0.08, F: 0.014, k: 0.054 },
	{ name: "Big Waves (F=0.014, k=0.045)",  Du: 0.16, Dv: 0.08, F: 0.014, k: 0.045 }
	];

export default function GrayScottPlayground(): JSX.Element {
  const [Du, setDu] = useState<number>(0.16);
  const [Dv, setDv] = useState<number>(0.08);
  const [F, setF] = useState<number>(0.022);
  const [k, setK] = useState<number>(0.051);
  const dt = 1.0; 
  const [stepsPerFrame, setStepsPerFrame] = useState<number>(20);
  const [gridN, setGridN] = useState<number>(256);
  const [seed, setSeed] = useState<string>("rdx"); 
  const [running, setRunning] = useState<boolean>(true);
  const [reseedSignal, setReseedSignal] = useState<number>(0);
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');

  const randomizeSeed = () => { setSeed(Math.random().toString(36).slice(2)); setReseedSignal(t => t + 1); };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-black text-slate-900 dark:text-slate-100">
      <div className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-30" style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)",
        backgroundSize: "22px 22px"
      }}/>

      <div className="relative max-w-7xl mx-auto px-4 py-10">
        <header className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-rose-600 dark:from-indigo-300 dark:via-fuchsia-300 dark:to-rose-300">Reaction–Diffusion Playground</span>
            </h1>
          </div>
          <p className="mt-3 text-sm md:text-base text-slate-600 dark:text-slate-300 max-w-3xl">

			The Gray–Scott model describes two chemical species, <em>U</em> and <em>V</em>, that diffuse and react over space.
			Their concentrations evolve according to a pair of partial differential equations; changing the feed (<em>F</em>),
			kill (<em>k</em>), and diffusion rates (<em>Dᵤ</em>, <em>Dᵥ</em>) produces spots, stripes, or maze-like patterns.
			Adjust the parameters to watch the patterns emerge in real time. See the{" "}
			<a href="https://en.wikipedia.org/wiki/Reaction%E2%80%93diffusion_system" target="_blank" rel="noopener noreferrer">Wikipedia page</a>{" "}
			for more background.

          </p>
        </header>

        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[['Du',Du],['Dv',Dv],['F',F],['k',k],['dt',dt],['steps',stepsPerFrame]].map(([klabel,val]) => (
            <div key={String(klabel)} className="rounded-xl border border-white/30 bg-white/60 dark:bg-black/30 px-3 py-2 text-xs shadow-sm backdrop-blur flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">{klabel as string}</span>
              <span className="font-mono tabular-nums">{Number(val as number).toFixed(3)}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          <div className="md:col-span-2">
            <div className="rounded-3xl border border-white/30 bg-white/60 dark:bg-black/30 p-3 shadow-lg backdrop-blur">
              <ReactionDiffusionCanvas
                width={640}
                height={640}
                gridN={gridN}
                Du={Du}
                Dv={Dv}
                F={F}
                k={k}
                dt={dt}
                stepsPerFrame={stepsPerFrame}
                running={running}
                seed={seed}
                reseedSignal={reseedSignal}
              />
            </div>
            <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">Color mapping: R≈V, G≈U, B≈1−U.</div>
          </div>

          <aside className="md:col-span-1">
            <div className="rounded-3xl border border-white/30 bg-white/60 dark:bg-black/30 p-4 shadow-lg backdrop-blur space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Controls</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setRunning(r => !r)} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/70 dark:bg-black/40 px-3 py-1.5 text-sm shadow-sm hover:shadow transition">
                    {running ? <IconPause className="w-4 h-4"/> : <IconPlay className="w-4 h-4"/>}
                    {running ? "Pause" : "Run"}
                  </button>
                  <button onClick={() => setReseedSignal(t => t + 1)} title="Reseed" className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/70 dark:bg-black/40 px-3 py-1.5 text-sm shadow-sm hover:shadow transition">
                    <IconRefresh className="w-4 h-4"/>
                    Reseed
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <NumberInput label="Dᵤ (Du)" value={Du} step={0.01} min={0} max={1} onChange={(v)=>{ setDu(v); setSelectedPreset('custom'); }} />
                <NumberInput label="Dᵥ (Dv)" value={Dv} step={0.01} min={0} max={1} onChange={(v)=>{ setDv(v); setSelectedPreset('custom'); }} />
                <NumberInput label="F" value={F} step={0.001} min={0} max={0.1} onChange={(v)=>{ setF(v); setSelectedPreset('custom'); }} />
                <NumberInput label="k" value={k} step={0.001} min={0} max={0.1} onChange={(v)=>{ setK(v); setSelectedPreset('custom'); }} />
                <NumberInput label="Steps/frame" value={stepsPerFrame} step={1} min={1} max={50} onChange={(v)=>{ setStepsPerFrame(v); setSelectedPreset('custom'); }} />
                <NumberInput label="Grid N" value={gridN} step={32} min={64} max={512} onChange={(v) => { setGridN(Math.round(v)); setSelectedPreset('custom'); }} />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Preset</label>
                <select
                  className="w-full rounded-xl border border-white/30 bg-white/70 dark:bg-black/40 px-3 py-2 text-sm shadow-sm"
                  value={selectedPreset}
                  onChange={(e) => {
                    const name = e.target.value; const p = PRESETS.find(pp => pp.name === name);
                    if (p) { setDu(p.Du); setDv(p.Dv); setF(p.F); setK(p.k); setSelectedPreset(p.name); setReseedSignal(t => t + 1); }
                    else { setSelectedPreset('custom'); }
                  }}
                >
                  <option value="custom">— Custom —</option>
                  {PRESETS.map(p => (<option key={p.name} value={p.name}>{p.name}</option>))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={randomizeSeed} className="rounded-xl border border-white/30 bg-white/70 dark:bg-black/40 px-3 py-1.5 text-sm shadow-sm hover:shadow transition">Randomize seed</button>
                <button onClick={() => { setReseedSignal(t => t + 1); setRunning(true); }} className="rounded-xl border border-white/30 bg-white/70 dark:bg-black/40 px-3 py-1.5 text-sm shadow-sm hover:shadow transition">Reset & Run</button>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Tips:
                <ul className="list-disc list-inside">
                  <li>Increase <em>Steps/frame</em> to speed up pattern formation.</li>
                  <li>Try presets, then fine‑tune <em>F</em> and <em>k</em> for spots vs stripes.</li>
                  <li>Higher <em>Grid N</em> is slower but crisper.</li>
                </ul>
              </div>
            </div>
          </aside>
        </div>

        <section className="mt-8 rounded-3xl border border-white/30 bg-white/60 dark:bg-black/30 p-5 shadow-md backdrop-blur">
          <div className="text-sm text-slate-700 dark:text-slate-200">
            <div className="font-semibold mb-2">Model</div>
            <div className="font-mono text-xs md:text-sm overflow-x-auto">
              u_t = D_u ∇²u − u v² + F (1 − u)  <br/>
              v_t = D_v ∇²v + u v² − (F + k) v
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}
function NumberInput({ label, value, onChange, step = 0.01, min = -Infinity, max = Infinity }: NumberInputProps): JSX.Element {
  return (
    <label className="flex flex-col text-sm gap-1">
      <span className="text-slate-700 dark:text-slate-300">{label}</span>
      <input
        type="number"
        className="rounded-xl border border-white/30 bg-white/70 dark:bg-black/40 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
        value={Number(value)}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(clamp(v, min, max));
        }}
      />
    </label>
  );
}
