// Shared layer scale (0-4) so all logic uses the same numeric values.
export const Layers = {
  Base: 0,
  Main: 1,
  Mid: 2,
  Outer: 3,
  Accessory: 4,
} as const;

// Union of numeric layer values for typing.
export type LayerValue = (typeof Layers)[keyof typeof Layers];
