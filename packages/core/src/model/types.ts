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

/**
 * Which side of a node its label sits on. The side is that of the node as drawn, whatever its
 * rotation and flip. 'auto' takes the first of bottom, top, right, left that none of the node's
 * ports faces once it is rotated and flipped, so the label stays off a line running through the symbol.
 */
export type LabelPosition = 'top' | 'bottom' | 'left' | 'right' | 'auto';

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
  /**
   * Side of the node the label sits on. Omitted: the symbol's `labelPosition`, else its `labelAnchor`,
   * else below the node.
   */
  labelPosition?: LabelPosition;
  /** Free-form status. It is emitted as the data-status attribute and nothing more (FR-19). */
  status?: string;
  /**
   * Per-instance ports (v2). When set, they replace the symbol's ports for this node, for example a
   * manifold with a variable number of outlets (PRD FR-40).
   */
  ports?: PortDef[];
  /**
   * Where the links that share one port part, per port id, relative to the node's `position` (its
   * top-left corner), so the point travels with the node. The links run one shared trunk from the port
   * to the point and part there. Without an entry the router decides. An entry is ignored while fewer
   * than two auto-routed links are drawn on the port, or while the trunk would run through a node.
   * The value may later also be a list of points, for a trunk with successive branches.
   */
  branchPoints?: Record<string, Point>;
  /** Locked nodes can't be moved, deleted or reconnected in edit mode, and get `data-locked` (v2, FR-43). */
  locked?: boolean;
  data?: D;
}

export interface LinkEnd {
  node: string;
  port: string;
}

/**
 * Draws a link end on another link instead of on its port. It only changes the drawing: `from` / `to`
 * still name the node and port the link logically runs to, so graph helpers and connection rules are
 * unaffected.
 */
export interface LinkAttach {
  /** Id of the link the end sits on (the host link). */
  link: string;
  /** Where on the host link's route, as a fraction of its length (0 = its start, 1 = its end). */
  at: number;
}

/** Built-in kinds are 'process', 'signal', 'pneumatic' and 'electrical'. Any other string is allowed and styled through CSS. */
export type LinkKind = 'process' | 'signal' | 'pneumatic' | 'electrical' | (string & {});

export interface LinkModel<D extends DataRecord = DataRecord> {
  id: string;
  from: LinkEnd;
  to: LinkEnd;
  kind: LinkKind;
  /**
   * Draw the `from` end on another link, at a point along its route, instead of on the `from` port.
   * The end follows the host link when it re-routes and gets a junction dot. Ignored (the end is drawn
   * on its port) while the host link doesn't exist or the attachments form a loop.
   */
  fromAttach?: LinkAttach;
  /** Like `fromAttach`, for the `to` end. */
  toAttach?: LinkAttach;
  /** 'auto' (the default) routes orthogonally around nodes. 'manual' keeps the given waypoints. */
  routing?: 'auto' | 'manual';
  /** Interior bend points in diagram coordinates. Port points are not included. */
  waypoints?: Point[];
  /** Show direction arrows along the link. The default is true for 'process'. */
  arrows?: boolean;
  /**
   * Short text drawn on the link, for example a flowchart answer ("Yes", "Leak found"). It sits on
   * the middle of the longest segment that keeps it off nodes, with a background halo, and follows
   * the route. It's also part of the link's accessible name.
   */
  label?: string;
  /** Where `label` sits along the path, as a fraction of its length (0 = start, 1 = end). */
  labelPosition?: number;
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
  /**
   * Whether the user can drag this annotation, overriding `DiagramOptions.annotationDrag`: `true` makes
   * it draggable in every mode, `false` never. Omitted: the option decides.
   */
  draggable?: boolean;
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
