import Vector from "./vector";

export default class BoundingBox {
  min: Vector;
  max: Vector;
  width: number;
  height: number;

  constructor(min: Vector, max: Vector) {
    this.min = min;
    this.max = max;
    this.width = this.max.x - this.min.x;
    this.height = this.max.y - this.min.y;
  }
}
