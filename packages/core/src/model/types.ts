/**
 * Diagram model: the serializable JSON contract (PRD FR-1).
 * Changing these types is a cross-team change: coordinate through the herd before editing.
 */
import type { PortDef } from '../symbols/types';

/** The model version that `toJSON()` writes. */
export const MODEL_VERSION = 2 as const;
/**
 * Versions `load()` accepts. v1 documents are migrated to v2 on load (`migrateModel`). v2 only adds
 * optional fields (`NodeModel.ports`, `locked`), so a v1 document is valid v2 after the version bump.
 */
export type ModelVersion = 1 | 2;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

export type Rotation = 0 | 90 | 180 | 270;

/** Free-form record that the host app owns. The library never interprets it except through bindings. */
export type DataRecord = Record<string, unknown>;

export interface NodeModel<D extends DataRecord = DataRecord> {
  id: string;
  /** Symbol type id, for example 'gas/gate-valve' or 'process/pump'. It resolves through the SymbolRegistry. */
  type: string;
  /** Top-left corner of the node's unrotated bounding box, in diagram coordinates. */
  position: Point;
  rotation?: Rotation;
  flipX?: boolean;
  flipY?: boolean;
  label?: string;
  /** Free-form status. It is emitted as the data-status attribute and nothing more (FR-19). */
  status?: string;
  /**
   * Per-instance ports (v2). When set, they replace the symbol's ports for this node, for example a
   * manifold with a variable number of outlets (PRD FR-40).
   */
  ports?: PortDef[];
  /** Locked nodes can't be moved, deleted or reconnected in edit mode, and get `data-locked` (v2, FR-43). */
  locked?: boolean;
  data?: D;
}

export interface LinkEnd {
  node: string;
  port: string;
}

/** Built-in kinds are 'process', 'signal', 'pneumatic' and 'electrical'. Any other string is allowed and styled through CSS. */
export type LinkKind = 'process' | 'signal' | 'pneumatic' | 'electrical' | (string & {});

export interface LinkModel<D extends DataRecord = DataRecord> {
  id: string;
  from: LinkEnd;
  to: LinkEnd;
  kind: LinkKind;
  /** 'auto' (the default) routes orthogonally around nodes. 'manual' keeps the given waypoints. */
  routing?: 'auto' | 'manual';
  /** Interior bend points in diagram coordinates. Port points are not included. */
  waypoints?: Point[];
  /** Show direction arrows along the link. The default is true for 'process'. */
  arrows?: boolean;
  status?: string;
  /** Locked links can't be deleted or reconnected in edit mode, and get `data-locked` (v2, FR-43). */
  locked?: boolean;
  data?: D;
}

export type AnnotationModel<D extends DataRecord = DataRecord> =
  TextAnnotation<D> | HtmlAnnotation<D>;

interface AnnotationBase<D extends DataRecord> {
  id: string;
  /** Either an absolute position, or a position relative to a node's top-left corner when anchor.node is set. */
  position: Point;
  anchor?: { node: string };
  /** Draw a dashed leader line from the annotation to its anchor node (FR-18). */
  leader?: boolean;
  /**
   * Bend points for the leader, in the same coordinate space as `position` (relative to the anchor
   * node's top-left when anchored). Without them, the leader is routed orthogonally around nodes.
   */
  leaderWaypoints?: Point[];
  status?: string;
  data?: D;
}

export interface TextAnnotation<D extends DataRecord = DataRecord> extends AnnotationBase<D> {
  kind: 'text';
  text: string;
  variant?: 'label' | 'area' | 'legend';
}

/** The content is rendered by the host through a renderer registered under `renderer` (FR-15/16). */
export interface HtmlAnnotation<D extends DataRecord = DataRecord> extends AnnotationBase<D> {
  kind: 'html';
  renderer: string;
  /** The box size. With `sizing: 'content'`, it's the minimum size instead. */
  size?: Size;
  /**
   * 'fixed' (the default) gives the box exactly `size`. 'content' lets it grow to fit what the renderer
   * draws (with `size` as the minimum), and keeps the leader and bounds in step as the content resizes.
   */
  sizing?: 'fixed' | 'content';
}

export interface DiagramModel<
  ND extends DataRecord = DataRecord,
  LD extends DataRecord = DataRecord,
  AD extends DataRecord = DataRecord,
> {
  /** `toJSON()` always writes MODEL_VERSION. `load()` also accepts older versions and migrates them. */
  version: ModelVersion;
  nodes: NodeModel<ND>[];
  links: LinkModel<LD>[];
  annotations?: AnnotationModel<AD>[];
  meta?: DataRecord;
}

/**
 * Partial update of one item in a ModelPatch. A key set to `null` removes that optional field
 * (JSON has no `undefined`).
 */
export type ItemChange<T extends { id: string }> = { id: string } & {
  [K in Exclude<keyof T, 'id'>]?: T[K] | null;
};

export interface CollectionPatch<T extends { id: string }> {
  added?: T[];
  removed?: string[];
  changed?: ItemChange<T>[];
}

/**
 * A JSON-serializable difference between two models (PRD FR-44). It's used by `applyDiff()`,
 * `patch()`, host-provided history and `modelChange.patch`.
 */
export interface ModelPatch {
  nodes?: CollectionPatch<NodeModel>;
  links?: CollectionPatch<LinkModel>;
  annotations?: CollectionPatch<AnnotationModel>;
  /** Replaces `meta`. `null` removes it. */
  meta?: DataRecord | null;
}
