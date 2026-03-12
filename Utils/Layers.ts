export const Layers = {
  Base: 0,
  Main: 1,
  Mid: 2,
  Outer: 3,
  Accessory: 4,
} as const;

export type LayerValue = (typeof Layers)[keyof typeof Layers];
