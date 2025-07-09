import { Point } from './venue-map.type';

/**
 * Pure utility functions for venue map operations that don't require service dependencies.
 * These functions are used across different services for scaling operations.
 */

/**
 * Scales a single value based on the provided scale factor.
 */
export function scaleValue(value: number, scale: number): number {
  return value * scale;
}

/**
 * Scales a point coordinate based on the provided scale factor.
 */
export function scalePoint(point: Point, scale: number): Point {
  return {
    x: point.x * scale,
    y: point.y * scale,
  };
}

/**
 * Scales an array of points based on the provided scale factor.
 */
export function scalePoints(points: Point[], scale: number): Point[] {
  return points.map(point => scalePoint(point, scale));
}
