import type { NestingInput, NestingResult } from "./types";
import type Packer from "./vendor/fit/packer";

/**
 * Runs the Fit packer on the main thread using dynamic import
 * to lazily load the vendor library (and its clipper-lib dependency).
 *
 * This avoids Worker bundling issues with Turbopack + CJS dependencies.
 * For typical inputs (1-10 parts, 30 generations), computation takes <300ms.
 */
export class NFPSolver {
  private currentJobId = 0;
  private cancelled = false;
  private currentPacker: InstanceType<typeof Packer> | null = null;

  solve(
    input: NestingInput,
    callbacks: {
      onProgress?: (result: NestingResult) => void;
      onComplete: (result: NestingResult) => void;
      onError?: (message: string) => void;
    },
  ): () => void {
    this.cancel();
    const jobId = ++this.currentJobId;
    this.cancelled = false;

    // Use setTimeout(0) to yield to the browser for one frame before
    // starting the synchronous packer, so the "Optimizing..." badge renders.
    setTimeout(async () => {
      if (this.cancelled || this.currentJobId !== jobId) return;

      try {
        const { Packer, Bin, Part, Vector } = await import("./vendor/fit");
        type PackingEvent = import("./vendor/fit/packer").PackingEvent;

        if (this.cancelled || this.currentJobId !== jobId) return;

        const bins = [new Bin("bin-0", input.binWidth, input.binHeight)];

        const parts: InstanceType<typeof Part>[] = input.parts.flatMap((np) =>
          Array.from({ length: np.quantity }, (_, i) => {
            const points = np.polygon.points.map(
              (p) => new Vector(p.x, p.y),
            );
            return new Part(`${np.id}-${i}`, points);
          }),
        );

        const config = {
          spacing: input.spacing,
          rotationSteps: input.rotationSteps ?? 4,
          population: input.populationSize ?? 10,
          mutationRate: input.mutationRate ?? 0.2,
          generations: input.generations ?? 30,
          seed: input.seed ?? Date.now(),
        };

        const packer = new Packer();
        this.currentPacker = packer;

        packer.start(bins, parts, config, {
          onPacking: (event: PackingEvent) => {
            if (this.cancelled || this.currentJobId !== jobId) return;
            try {
              const result = convertPackingEvent(event, input);
              callbacks.onProgress?.(result);
            } catch (err) {
              console.error("[NFPSolver] Error in onPacking:", err);
            }
          },
          onPackingCompleted: (event: PackingEvent) => {
            if (this.cancelled || this.currentJobId !== jobId) return;
            try {
              const result = convertPackingEvent(event, input);
              callbacks.onComplete(result);
            } catch (err) {
              console.error("[NFPSolver] Error in onPackingCompleted:", err);
              callbacks.onError?.(String(err));
            }
          },
        });

        this.currentPacker = null;
      } catch (err) {
        this.currentPacker = null;
        if (this.cancelled || this.currentJobId !== jobId) return;
        console.error("[NFPSolver] Fatal error:", err);
        callbacks.onError?.(String(err));
      }
    }, 0);

    return () => this.cancel();
  }

  cancel(): void {
    this.cancelled = true;
    this.currentPacker?.stop();
    this.currentPacker = null;
  }
}

function convertPackingEvent(
  event: import("./vendor/fit/packer").PackingEvent,
  input: NestingInput,
): NestingResult {
  const placements = event.placements.map((p) => {
    const partIdBase = p.part.replace(/-\d+$/, "");
    const originalPart = input.parts.find((np) => np.id === partIdBase);
    const polygon = originalPart?.polygon;

    if (!polygon) {
      return {
        partId: p.part,
        x: p.position.x,
        y: p.position.y,
        width: 0,
        height: 0,
        polygonArea: 0,
        boundingBoxArea: 0,
        rotation: p.rotation,
        placedPolygon: [],
        flipped: Math.abs(p.rotation - Math.PI) < 0.1,
      };
    }

    const cos = Math.cos(p.rotation);
    const sin = Math.sin(p.rotation);
    const transformedPoints = polygon.points.map((pt) => ({
      x: pt.x * cos - pt.y * sin + p.position.x,
      y: pt.x * sin + pt.y * cos + p.position.y,
    }));
    const bb = getBounds(transformedPoints);
    const polygonArea = getPolygonArea(polygon.points);
    const boundingBoxArea = bb.width * bb.height;

    return {
      partId: p.part,
      x: bb.x,
      y: bb.y,
      width: bb.width,
      height: bb.height,
      polygonArea,
      boundingBoxArea,
      rotation: p.rotation,
      placedPolygon: transformedPoints,
      flipped: Math.abs(p.rotation - Math.PI) < 0.1,
    };
  });

  const totalRequested = input.parts.reduce((sum, p) => sum + p.quantity, 0);
  const placed = placements.length;
  const overflow = totalRequested - placed;

  let usedArea = 0;
  let occW = 0;
  let occH = 0;
  placements.forEach((p) => {
    usedArea += p.polygonArea;
    occW = Math.max(occW, p.x + p.width);
    occH = Math.max(occH, p.y + p.height);
  });

  const binArea = input.binWidth * input.binHeight;
  const occupiedArea = occW * occH;
  const efficiency = binArea > 0 ? (usedArea / binArea) * 100 : 0;
  const wasteArea = Math.max(0, binArea - usedArea);

  return {
    placements,
    placed,
    overflow,
    usedArea,
    occupiedArea,
    occupiedWidth: occW,
    occupiedHeight: occH,
    stockArea: binArea,
    wasteArea,
    efficiency,
    source: "optimized" as const,
  };
}

function getPolygonArea(points: Array<{ x: number; y: number }>) {
  if (points.length < 3) {
    return 0;
  }

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area) / 2;
}

function getBounds(points: Array<{ x: number; y: number }>) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  points.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
