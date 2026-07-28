export function getLandingMapInteractionOptions(usesCoarsePointer: boolean) {
  return {
    touchZoom: true,
    scrollWheelZoom: false,
    dragging: !usesCoarsePointer,
  } as const;
}
