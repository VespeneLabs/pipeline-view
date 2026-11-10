/**
 * Router contract (PRD FR-9..12). Pure and DOM-free so it can run in a Web Worker.
 */
import type { Point, Rect } from '../model/types';
import type { PortDirection } from '../symbols/types';

export interface RouteEndpoint {
  point: Point;
  /** Direction after rotation is applied. */
  direction: PortDirection;
  /** The node this endpoint belongs to. That node's obstacle is ignored near the port. */
  nodeId: string;
}

export interface RouteRequest {
  linkId: string;
  from: RouteEndpoint;
  to: RouteEndpoint;
  /** Manual waypoints. The route must pass through them in order. */
  waypoints?: Point[];
}

export interface RouterOptions {
  /** Clearance kept around obstacles, in diagram units. Default 12. */
  clearance?: number;
  /** Cost penalty per bend. Default chosen by the implementation. */
  bendPenalty?: number;
  /** Spacing between parallel pipes that share a corridor. Default 6. */
  spacing?: number;
}

export interface RouteResult {
  linkId: string;
  /** Full orthogonal polyline, including both endpoints. */
  points: Point[];
}

export interface Crossing {
  /** The link that gets the jump (hop) drawn on it. */
  linkId: string;
  point: Point;
  /** Orientation of the segment on `linkId` at the crossing. */
  orientation: 'horizontal' | 'vertical';
}

export interface Junction {
  point: Point;
  linkIds: string[];
}

export interface Router {
  /** Replace the full obstacle set (node bounding boxes after rotation). */
  setObstacles(obstacles: Map<string, Rect>): void;
  /** Update one obstacle incrementally (node moved or rotated). Returns the ids of routed links whose route may now be invalid. */
  updateObstacle(nodeId: string, rect: Rect | null): string[];
  /**
   * Route the given links. Results come back in request order. The router remembers each route so that
   * `updateObstacle` can report affected links and later routes can spread around it.
   */
  route(requests: RouteRequest[]): RouteResult[];
  /** Forget the stored routes of deleted links so they no longer occupy corridors. */
  removeRoutes(linkIds: string[]): void;
  /** Compute line-jump crossings and branch junctions for the current set of routes (FR-12). */
  analyze(routes: RouteResult[]): { crossings: Crossing[]; junctions: Junction[] };
}
