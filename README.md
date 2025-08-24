# Reaction–Diffusion (Gray–Scott) Playground

[App on Vercel](https://reaction-diffusion-playground.vercel.app/)
A small React app that simulates the Gray–Scott reaction–diffusion model in real time. Two chemical species, *U* and *V*, diffuse and react over space; changing the feed (*F*), kill (*k*), and diffusion rates (*Dᵤ*, *Dᵥ*) produces spots, stripes, or maze-like patterns. Adjust parameters and watch patterns emerge. See the [Wikipedia page](https://en.wikipedia.org/wiki/Reaction%E2%80%93diffusion_system) for background.

## Features
- Live simulation on a canvas (periodic boundaries; 5-point Laplacian).
- Presets (spots/stripes/mazes) + Run/Pause, Reseed, Reset & Run.
- Editable: **Dᵤ, Dᵥ, F, k, Steps/frame, Grid N**.
- **Seed** is randomized via a button (not directly editable). **dt** is internal.
- Clean UI with Tailwind v4 (no extra deps).

## Stack
- Vite + React
- Tailwind CSS v4

## Controls
- Dᵤ, Dᵥ: diffusion rates
- F (feed), k (kill): reaction parameters
- Steps/frame: simulation iterations per animation frame
- Grid N: simulation resolution (higher = sharper but slower)
- Preset: loads known patterning regimes
- Run/Pause, Reseed, Reset & Run, Randomize seed
