import ClipperLib from "clipper-lib";
import Vector from "./vector";
import IndexedVector from "./indexed-vector";
import Polygon from "./polygon";
import BoundingBox from "./bounding-box";
import type Part from "./part";

const TOL = 1e-9;
const clipperScale = 1e7;
const clipperThreshold = 0.0001 * clipperScale;

function toClipperCoordinates(
  points: Vector[],
): Array<{ X: number; Y: number }> {
  return points.map((p) => ({ X: p.x * clipperScale, Y: p.y * clipperScale }));
}

function toNestCoordinates(
  path: Array<{ X: number; Y: number }>,
): Vector[] {
  return path.map((p) => new Vector(p.X / clipperScale, p.Y / clipperScale));
}

function approximately(a: number, b: number, tolerance = TOL): boolean {
  return Math.abs(a - b) < tolerance;
}

function bounds(points: Vector[]): BoundingBox {
  let minX = Number.MAX_VALUE,
    maxX = -Number.MAX_VALUE;
  let minY = Number.MAX_VALUE,
    maxY = -Number.MAX_VALUE;
  points.forEach((p) => {
    minX = Math.min(p.x, minX);
    minY = Math.min(p.y, minY);
    maxX = Math.max(p.x, maxX);
    maxY = Math.max(p.y, maxY);
  });
  return new BoundingBox(new Vector(minX, minY), new Vector(maxX, maxY));
}

function onSegment(A: Vector, B: Vector, p: Vector): boolean {
  if (approximately(A.x, B.x) && approximately(p.x, A.x)) {
    if (
      !approximately(p.y, B.y) &&
      !approximately(p.y, A.y) &&
      p.y < Math.max(B.y, A.y) &&
      p.y > Math.min(B.y, A.y)
    ) {
      return true;
    }
    return false;
  }
  if (approximately(A.y, B.y) && approximately(p.y, A.y)) {
    if (
      !approximately(p.x, B.x) &&
      !approximately(p.x, A.x) &&
      p.x < Math.max(B.x, A.x) &&
      p.x > Math.min(B.x, A.x)
    ) {
      return true;
    }
    return false;
  }
  if (
    (p.x < A.x && p.x < B.x) ||
    (p.x > A.x && p.x > B.x) ||
    (p.y < A.y && p.y < B.y) ||
    (p.y > A.y && p.y > B.y)
  ) {
    return false;
  }
  if (
    (approximately(p.x, A.x) && approximately(p.y, A.y)) ||
    (approximately(p.x, B.x) && approximately(p.y, B.y))
  ) {
    return false;
  }
  const cross = (p.y - A.y) * (B.x - A.x) - (p.x - A.x) * (B.y - A.y);
  if (Math.abs(cross) > TOL) return false;
  const dot = (p.x - A.x) * (B.x - A.x) + (p.y - A.y) * (B.y - A.y);
  if (dot < 0 || approximately(dot, 0)) return false;
  const len2 = (B.x - A.x) * (B.x - A.x) + (B.y - A.y) * (B.y - A.y);
  if (dot > len2 || approximately(dot, len2)) return false;
  return true;
}

function pointInPolygon(point: Vector, polygon: Part): boolean | null {
  if (!polygon || polygon.points.length < 3) return null;
  let inside = false;
  for (
    let n = polygon.points.length, i = 0, j = n - 1;
    i < n;
    j = i++
  ) {
    const pi = polygon.points[i].add(polygon.offset);
    const pj = polygon.points[j].add(polygon.offset);
    if (pi.approximately(point)) return null;
    if (onSegment(pi, pj, point)) return null;
    if (pi.approximately(pj)) continue;
    const intersected =
      pi.y > point.y !== pj.y > point.y &&
      point.x <
        ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersected) inside = !inside;
  }
  return inside;
}

function pointDistance(
  p: Vector,
  s1: Vector,
  s2: Vector,
  normal: Vector,
  infinite?: boolean,
): number | null {
  const norm = normal.normalize();
  const dir = norm.perpendicular();
  const pdot = p.dot(dir);
  const s1dot = s1.dot(dir);
  const s2dot = s2.dot(dir);
  const pdotnorm = p.dot(norm);
  const s1dotnorm = s1.dot(norm);
  const s2dotnorm = s2.dot(norm);

  if (!infinite) {
    if (
      (pdot < s1dot || approximately(pdot, s1dot)) &&
      (pdot < s2dot || approximately(pdot, s2dot))
    ) {
      return null;
    }
    if (
      (pdot > s1dot || approximately(pdot, s1dot)) &&
      (pdot > s2dot || approximately(pdot, s2dot))
    ) {
      return null;
    }
    if (
      approximately(pdot, s1dot) &&
      approximately(pdot, s2dot) &&
      pdotnorm > s1dotnorm &&
      pdotnorm > s2dotnorm
    ) {
      return Math.min(pdotnorm - s1dotnorm, pdotnorm - s2dotnorm);
    }
    if (
      approximately(pdot, s1dot) &&
      approximately(pdot, s2dot) &&
      pdotnorm < s1dotnorm &&
      pdotnorm < s2dotnorm
    ) {
      return -Math.min(s1dotnorm - pdotnorm, s2dotnorm - pdotnorm);
    }
  }

  return -(
    pdotnorm -
    s1dotnorm +
    ((s1dotnorm - s2dotnorm) * (s1dot - pdot)) / (s1dot - s2dot)
  );
}

function segmentDistance(
  A: Vector,
  B: Vector,
  E: Vector,
  F: Vector,
  direction: Vector,
): number | null {
  const normal = direction.perpendicular();
  const dotA = A.dot(normal);
  const dotB = B.dot(normal);
  const dotE = E.dot(normal);
  const dotF = F.dot(normal);
  const crossA = A.cross(direction);
  const crossB = B.cross(direction);
  const ABmin = Math.min(dotA, dotB);
  const ABmax = Math.max(dotA, dotB);
  const EFmax = Math.max(dotE, dotF);
  const EFmin = Math.min(dotE, dotF);

  if (approximately(ABmax, EFmin) || approximately(ABmin, EFmax)) return null;
  if (ABmax < EFmin || ABmin > EFmax) return null;

  let overlap: number;
  if (
    (ABmax > EFmax && ABmin < EFmin) ||
    (EFmax > ABmax && EFmin < ABmin)
  ) {
    overlap = 1;
  } else {
    const minMax = Math.min(ABmax, EFmax);
    const maxMin = Math.max(ABmin, EFmin);
    const maxMax = Math.max(ABmax, EFmax);
    const minMin = Math.min(ABmin, EFmin);
    overlap = (minMax - maxMin) / (maxMax - minMin);
  }

  const ae = E.sub(A);
  const ab = B.sub(A);
  const af = F.sub(A);
  const ef = E.sub(F);
  const crossABE = ae.cross(ab);
  const crossABF = af.cross(ab);

  if (approximately(crossABE, 0) && approximately(crossABF, 0)) {
    const ABnorm = ab.perpendicular().normalize();
    const EFnorm = ef.perpendicular().normalize();
    if (
      Math.abs(ABnorm.cross(EFnorm)) < TOL &&
      ABnorm.dot(EFnorm) < 0
    ) {
      const normdot = ABnorm.dot(direction);
      if (approximately(normdot, 0)) return null;
      if (normdot < 0) return 0;
    }
    return null;
  }

  const distances: number[] = [];
  const reverse = direction.negative();

  if (approximately(dotA, dotE)) {
    distances.push(crossA - E.cross(direction));
  } else if (approximately(dotA, dotF)) {
    distances.push(crossA - F.cross(direction));
  } else if (dotA > EFmin && dotA < EFmax) {
    let d = pointDistance(A, E, F, reverse);
    if (d !== null && approximately(d, 0)) {
      const dB = pointDistance(B, E, F, reverse, true);
      if (dB !== null && (dB < 0 || approximately(dB * overlap, 0))) {
        d = null;
      }
    }
    if (d !== null) distances.push(d);
  }

  if (approximately(dotB, dotE)) {
    distances.push(crossB - E.cross(direction));
  } else if (approximately(dotB, dotF)) {
    distances.push(crossB - F.cross(direction));
  } else if (dotB > EFmin && dotB < EFmax) {
    let d = pointDistance(B, E, F, reverse);
    if (d !== null && approximately(d, 0)) {
      const dA = pointDistance(A, E, F, reverse, true);
      if (dA !== null && (dA < 0 || approximately(dA * overlap, 0))) {
        d = null;
      }
    }
    if (d !== null) distances.push(d);
  }

  if (dotE > ABmin && dotE < ABmax) {
    let d = pointDistance(E, A, B, direction);
    if (d !== null && approximately(d, 0)) {
      const dF = pointDistance(F, A, B, direction, true);
      if (dF !== null && (dF < 0 || approximately(dF * overlap, 0))) {
        d = null;
      }
    }
    if (d !== null) distances.push(d);
  }

  if (dotF > ABmin && dotF < ABmax) {
    let d = pointDistance(F, A, B, direction);
    if (d !== null && approximately(d, 0)) {
      const dE = pointDistance(E, A, B, direction, true);
      if (dE !== null && (dE < 0 || approximately(dE * overlap, 0))) {
        d = null;
      }
    }
    if (d !== null) distances.push(d);
  }

  if (distances.length <= 0) return null;
  return Math.min(...distances);
}

function polygonSlideDistance(
  A: Part,
  B: Part,
  direction: Vector,
  ignoreNegative: boolean,
): number | null {
  const AP = A.points.slice(0);
  const BP = B.points.slice(0);
  if (!AP[0].approximately(AP[AP.length - 1])) AP.push(AP[0]);
  if (!BP[0].approximately(BP[BP.length - 1])) BP.push(BP[0]);

  let distance: number | null = null;
  const dir = direction.normalize();

  for (let i = 0; i < BP.length - 1; i++) {
    for (let j = 0; j < AP.length - 1; j++) {
      const A1 = AP[j].add(A.offset);
      const A2 = AP[j + 1].add(A.offset);
      const B1 = BP[i].add(B.offset);
      const B2 = BP[i + 1].add(B.offset);
      if (A1.approximately(A2) || B1.approximately(B2)) continue;

      const d = segmentDistance(A1, A2, B1, B2, dir);
      if (d !== null && (distance === null || d < distance)) {
        if (!ignoreNegative || d > 0 || approximately(d, 0)) {
          distance = d;
        }
      }
    }
  }
  return distance;
}

function polygonProjectionDistance(
  A: Part,
  B: Part,
  direction: Vector,
): number | null {
  const AP = A.points.slice(0);
  const BP = B.points.slice(0);
  if (!AP[0].approximately(AP[AP.length - 1])) AP.push(AP[0]);
  if (!BP[0].approximately(BP[BP.length - 1])) BP.push(BP[0]);

  let distance: number | null = null;

  for (let i = 0; i < BP.length; i++) {
    let minProjection: number | null = null;
    for (let j = 0; j < AP.length - 1; j++) {
      const p = BP[i].add(B.offset);
      const s1 = AP[j].add(A.offset);
      const s2 = AP[j + 1].add(A.offset);
      const s12 = s2.sub(s1);
      if (Math.abs(s12.cross(direction)) < TOL) continue;
      const d = pointDistance(p, s1, s2, direction);
      if (d !== null && (minProjection === null || d < minProjection)) {
        minProjection = d;
      }
    }
    if (
      minProjection !== null &&
      (distance === null || minProjection > distance)
    ) {
      distance = minProjection;
    }
  }
  return distance;
}

function lineIntersect(
  A: Vector,
  B: Vector,
  E: Vector,
  F: Vector,
  infinite?: boolean,
): Vector | null {
  const a1 = B.y - A.y;
  const b1 = A.x - B.x;
  const c1 = B.x * A.y - A.x * B.y;
  const a2 = F.y - E.y;
  const b2 = E.x - F.x;
  const c2 = F.x * E.y - E.x * F.y;
  const denom = a1 * b2 - a2 * b1;
  const x = (b1 * c2 - b2 * c1) / denom;
  const y = (a2 * c1 - a1 * c2) / denom;
  if (!isFinite(x) || !isFinite(y)) return null;

  if (!infinite) {
    if (
      Math.abs(A.x - B.x) > TOL &&
      (A.x < B.x ? x < A.x || x > B.x : x > A.x || x < B.x)
    )
      return null;
    if (
      Math.abs(A.y - B.y) > TOL &&
      (A.y < B.y ? y < A.y || y > B.y : y > A.y || y < B.y)
    )
      return null;
    if (
      Math.abs(E.x - F.x) > TOL &&
      (E.x < F.x ? x < E.x || x > F.x : x > E.x || x < F.x)
    )
      return null;
    if (
      Math.abs(E.y - F.y) > TOL &&
      (E.y < F.y ? y < E.y || y > F.y : y > E.y || y < F.y)
    )
      return null;
  }
  return new Vector(x, y);
}

function intersect(A: Part, B: Part): boolean {
  const AP = A.points.slice(0);
  const BP = B.points.slice(0);
  const n = AP.length;
  const m = BP.length;

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a1 = AP[i].add(A.offset);
      const a2 = AP[i + 1].add(A.offset);
      const b1 = BP[j].add(B.offset);
      const b2 = BP[j + 1].add(B.offset);

      let prevbindex = j === 0 ? m - 1 : j - 1;
      let prevaindex = i === 0 ? n - 1 : i - 1;
      let nextbindex = j + 1 === m - 1 ? 0 : j + 2;
      let nextaindex = i + 1 === n - 1 ? 0 : i + 2;

      if (BP[prevbindex].approximately(BP[j]))
        prevbindex = prevbindex === 0 ? m - 1 : prevbindex - 1;
      if (AP[prevaindex].approximately(AP[i]))
        prevaindex = prevaindex === 0 ? n - 1 : prevaindex - 1;
      if (BP[nextbindex].approximately(BP[j + 1]))
        nextbindex = nextbindex === m - 1 ? 0 : nextbindex + 1;
      if (AP[nextaindex].approximately(AP[i + 1]))
        nextaindex = nextaindex === n - 1 ? 0 : nextaindex + 1;

      const b0 = BP[prevbindex].add(B.offset);
      const b3 = BP[nextbindex].add(B.offset);
      const a0 = AP[prevaindex].add(A.offset);
      const a3 = AP[nextaindex].add(A.offset);

      if (onSegment(a1, a2, b1) || a1.approximately(b1)) {
        const b0in = pointInPolygon(b0, A);
        const b2in = pointInPolygon(b2, A);
        if (
          (b0in === true && b2in === false) ||
          (b0in === false && b2in === true)
        )
          return true;
        continue;
      }
      if (onSegment(a1, a2, b2) || a2.approximately(b2)) {
        const b1in = pointInPolygon(b1, A);
        const b3in = pointInPolygon(b3, A);
        if (
          (b1in === true && b3in === false) ||
          (b1in === false && b3in === true)
        )
          return true;
        continue;
      }
      if (onSegment(b1, b2, a1) || a1.approximately(b2)) {
        const a0in = pointInPolygon(a0, B);
        const a2in = pointInPolygon(a2, B);
        if (
          (a0in === true && a2in === false) ||
          (a0in === false && a2in === true)
        )
          return true;
        continue;
      }
      if (onSegment(b1, b2, a2) || a2.approximately(b1)) {
        const a1in = pointInPolygon(a1, B);
        const a3in = pointInPolygon(a3, B);
        if (
          (a1in === true && a3in === false) ||
          (a1in === false && a3in === true)
        )
          return true;
        continue;
      }
      const p = lineIntersect(b1, b2, a1, a2);
      if (p !== null) return true;
    }
  }
  return false;
}

function inNfp(p: Vector, nfp: Polygon[]): boolean {
  if (!nfp || nfp.length === 0) return false;
  for (let i = 0; i < nfp.length; i++) {
    for (let j = 0; j < nfp[i].points.length; j++) {
      if (p.approximately(nfp[i].points[j])) return true;
    }
  }
  return false;
}

function searchStartPoint(
  A: Part,
  B: Part,
  inside: boolean,
  NFP?: Polygon[],
): Vector | null {
  const AP = A.points.slice(0);
  const BP = B.points.slice(0);
  if (!AP[0].approximately(AP[AP.length - 1])) AP.push(AP[0]);
  if (!BP[0].approximately(BP[BP.length - 1])) BP.push(BP[0]);

  for (let i = 0; i < AP.length - 1; i++) {
    if (!AP[i].marked) {
      AP[i].mark();
      for (let j = 0; j < BP.length; j++) {
        B.offset.set(AP[i].sub(BP[j]));
        let Binside: boolean | null = null;
        for (let k = 0; k < BP.length; k++) {
          const inpoly = pointInPolygon(BP[k].add(B.offset), A);
          if (inpoly !== null) {
            Binside = inpoly;
            break;
          }
        }
        if (Binside === null) return null;

        let startPoint = B.offset.clone();
        if (
          ((Binside && inside) || (!Binside && !inside)) &&
          !intersect(A, B) &&
          !inNfp(startPoint, NFP ?? [])
        ) {
          return startPoint;
        }

        const v = AP[i + 1].sub(AP[i]);
        const d1 = polygonProjectionDistance(A, B, v);
        const d2 = polygonProjectionDistance(B, A, v.negative());
        let d: number | null = null;
        if (d1 === null && d2 === null) {
          // nothing
        } else if (d1 === null) {
          d = d2;
        } else if (d2 === null) {
          d = d1;
        } else {
          d = Math.min(d1, d2);
        }
        if (d === null || approximately(d, 0) || d <= 0) continue;

        const vd2 = v.squaredLength();
        let vScaled = v;
        if (d * d < vd2 && !approximately(d * d, vd2)) {
          const vd = Math.sqrt(vd2);
          vScaled = v.multiplyScalar(d / vd);
        }
        B.offset = B.offset.add(vScaled);

        for (let k = 0; k < BP.length; k++) {
          const inpoly = pointInPolygon(BP[k].add(B.offset), A);
          if (inpoly !== null) {
            Binside = inpoly;
            break;
          }
        }

        startPoint = B.offset.clone();
        if (
          ((Binside && inside) || (!Binside && !inside)) &&
          !intersect(A, B) &&
          !inNfp(startPoint, NFP ?? [])
        ) {
          return startPoint;
        }
      }
    }
  }
  return null;
}

function noFitRectanglePolygon(A: Part, B: Part): Polygon | null {
  const abb = A.bounds();
  const bbb = B.bounds();
  if (
    bbb.max.x - bbb.min.x > abb.max.x - abb.min.x ||
    bbb.max.y - bbb.min.y > abb.max.y - abb.min.y
  ) {
    return null;
  }
  const p0 = new Vector(abb.min.x - bbb.min.x, abb.min.y - bbb.min.y);
  const p1 = new Vector(abb.max.x - bbb.max.x, abb.min.y - bbb.min.y);
  const p2 = new Vector(abb.max.x - bbb.max.x, abb.max.y - bbb.max.y);
  const p3 = new Vector(abb.min.x - bbb.min.x, abb.max.y - bbb.max.y);
  return new Polygon([
    B.points[0].add(p0),
    B.points[0].add(p1),
    B.points[0].add(p2),
    B.points[0].add(p3),
  ]);
}

function noFitPolygon(
  A: Part,
  B: Part,
  inside = false,
  edges = false,
): Polygon[] {
  let minA = A.points[0].y;
  let minAindex = 0;
  let maxB = B.points[0].y;
  let maxBindex = 0;
  const la = A.points.length;
  const lb = B.points.length;

  for (let i = 1; i < la; i++) {
    A.points[i].unmark();
    if (A.points[i].y < minA) {
      minA = A.points[i].y;
      minAindex = i;
    }
  }
  for (let i = 1; i < lb; i++) {
    B.points[i].unmark();
    if (B.points[i].y > maxB) {
      maxB = B.points[i].y;
      maxBindex = i;
    }
  }

  let startPoint: Vector | null = null;
  if (!inside) {
    startPoint = A.points[minAindex].sub(B.points[maxBindex]);
  } else {
    startPoint = searchStartPoint(A.clone() as Part, B.clone() as Part, true);
  }

  const result: Polygon[] = [];

  while (startPoint !== null) {
    B.offset.set(startPoint);
    let prevVector: Vector | null = null;
    let reference = B.points[0].add(B.offset);
    const NFP: Vector[] = [reference.clone()];
    const start = reference.clone();
    let iterations = 0;
    const limit = 10 * (la + lb);

    while (iterations++ < limit) {
      const touching: Array<{ type: number; A: number; B: number }> = [];

      for (let i = 0; i < la; i++) {
        const nexti = i === la - 1 ? 0 : i + 1;
        for (let j = 0; j < lb; j++) {
          const nextj = j === lb - 1 ? 0 : j + 1;
          const bj = B.points[j].add(B.offset);
          if (A.points[i].approximately(bj)) {
            touching.push({ type: 0, A: i, B: j });
          } else if (onSegment(A.points[i], A.points[nexti], bj)) {
            touching.push({ type: 1, A: nexti, B: j });
          } else if (
            onSegment(bj, B.points[nextj].add(B.offset), A.points[i])
          ) {
            touching.push({ type: 2, A: i, B: nextj });
          }
        }
      }

      const vectors: IndexedVector[] = [];
      for (let i = 0; i < touching.length; i++) {
        const vertexA = A.points[touching[i].A];
        vertexA.mark();
        let prevAindex = touching[i].A - 1;
        let nextAindex = touching[i].A + 1;
        prevAindex = prevAindex < 0 ? la - 1 : prevAindex;
        nextAindex = nextAindex >= la ? 0 : nextAindex;
        const prevA = A.points[prevAindex];
        const nextA = A.points[nextAindex];
        const vertexB = B.points[touching[i].B];
        let prevBindex = touching[i].B - 1;
        let nextBindex = touching[i].B + 1;
        prevBindex = prevBindex < 0 ? lb - 1 : prevBindex;
        nextBindex = nextBindex >= lb ? 0 : nextBindex;
        const prevB = B.points[prevBindex];
        const nextB = B.points[nextBindex];

        switch (touching[i].type) {
          case 0: {
            vectors.push(new IndexedVector(prevA.sub(vertexA).x, prevA.sub(vertexA).y, vertexA, prevA));
            vectors.push(new IndexedVector(nextA.sub(vertexA).x, nextA.sub(vertexA).y, vertexA, nextA));
            vectors.push(new IndexedVector(vertexB.sub(prevB).x, vertexB.sub(prevB).y, prevB, vertexB));
            vectors.push(new IndexedVector(vertexB.sub(nextB).x, vertexB.sub(nextB).y, nextB, vertexB));
            break;
          }
          case 1: {
            const vb = vertexB.add(B.offset);
            const va1 = vertexA.sub(vb);
            const va2 = prevA.sub(vb);
            vectors.push(new IndexedVector(va1.x, va1.y, prevA, vertexA));
            vectors.push(new IndexedVector(va2.x, va2.y, vertexA, prevA));
            break;
          }
          case 2: {
            const va1 = A.points[touching[i].A].sub(vertexB.add(B.offset));
            const va2 = A.points[touching[i].A].sub(prevB.add(B.offset));
            vectors.push(new IndexedVector(va1.x, va1.y, prevB, vertexB));
            vectors.push(new IndexedVector(va2.x, va2.y, vertexB, prevB));
            break;
          }
        }
      }

      let translate: IndexedVector | null = null;
      let maxd = 0;

      for (let i = 0; i < vectors.length; i++) {
        if (vectors[i].x === 0 && vectors[i].y === 0) continue;
        if (prevVector && vectors[i].dot(prevVector) < 0) {
          const unitVector = vectors[i].normalize();
          const prevUnitVector = prevVector.normalize();
          if (Math.abs(unitVector.cross(prevUnitVector)) < 1e-8) continue;
        }
        let d = polygonSlideDistance(A, B, vectors[i], true);
        const vecd2 = vectors[i].squaredLength();
        if (d === null || d * d > vecd2) d = Math.sqrt(vecd2);
        if (d !== null && d > maxd) {
          maxd = d;
          translate = vectors[i];
        }
      }

      if (translate === null || approximately(maxd, 0)) break;

      translate.start.mark();
      translate.end.mark();

      const vlength2 = translate.squaredLength();
      const maxd2 = maxd * maxd;
      let finalTranslate: Vector = translate;
      if (maxd2 < vlength2 && !approximately(maxd2, vlength2)) {
        const scale = Math.sqrt(maxd2 / vlength2);
        finalTranslate = translate.multiplyScalar(scale);
      }

      prevVector = translate.clone();
      reference = reference.add(finalTranslate);

      if (reference.approximately(start)) break;

      let looped = false;
      for (let i = 0; i < NFP.length - 1; i++) {
        if (reference.approximately(NFP[i])) {
          looped = true;
          break;
        }
      }
      if (looped) break;

      NFP.push(reference.clone());
      B.offset = B.offset.add(finalTranslate);
    }

    if (NFP.length > 0) {
      result.push(new Polygon(NFP));
    }

    if (!edges) break;
    startPoint = searchStartPoint(
      A.clone() as Part,
      B.clone() as Part,
      inside,
      result,
    );
  }

  return result;
}

function minkowskiDifference(A: Part, B: Part): Polygon[] {
  const Ac = toClipperCoordinates(A.points);
  const Bc = toClipperCoordinates(B.points);
  for (let i = 0; i < Bc.length; i++) {
    Bc[i].X *= -1;
    Bc[i].Y *= -1;
  }
  const solution = ClipperLib.Clipper.MinkowskiSum(Ac, Bc, true);
  let minArea = Number.MAX_VALUE;
  let minPolygon: Polygon | undefined;
  for (let i = 0; i < solution.length; i++) {
    const points = toNestCoordinates(solution[i]);
    const polygon = new Polygon(points);
    const area = polygon.area();
    if (area < minArea) {
      minArea = area;
      minPolygon = polygon;
    }
  }
  const offset = B.points[0];
  return [minPolygon!.translate(offset.x, offset.y)];
}

function offsetPolygon(
  polygon: Part,
  offset: number,
  miterLimit = 2.5,
  curveTolerance = 1.0,
): Part {
  if (approximately(offset, 0)) return polygon;
  const clipper = new ClipperLib.ClipperOffset(
    miterLimit,
    curveTolerance * clipperScale,
  );
  const path = toClipperCoordinates(polygon.points);
  clipper.AddPath(
    path,
    ClipperLib.JoinType.jtSquare,
    ClipperLib.EndType.etClosedPolygon,
  );
  const paths = new ClipperLib.Paths();
  clipper.Execute(paths, offset * clipperScale);
  const cloned = polygon.clone() as Part;
  cloned.points = toNestCoordinates(paths[0]);
  return cloned;
}

function createUniqueKey(
  A: Part,
  B: Part,
  inside: boolean,
): string {
  return JSON.stringify({
    A: A.toString(),
    B: B.toString(),
    inside,
  });
}

export {
  approximately,
  bounds,
  clipperScale,
  clipperThreshold,
  toClipperCoordinates,
  toNestCoordinates,
  noFitRectanglePolygon,
  noFitPolygon,
  minkowskiDifference,
  offsetPolygon,
  createUniqueKey,
};
