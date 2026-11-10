import { MODEL_VERSION, type DiagramModel } from './types';

/**
 * Brings an older document up to MODEL_VERSION. v1 → v2 only bumps the version: v2 adds optional
 * fields (`NodeModel.ports`, `locked`), so every v1 document is a valid v2 one. Unknown versions throw.
 */
export function migrateModel(model: DiagramModel): DiagramModel {
  switch (model.version as number) {
    case MODEL_VERSION:
      return model;
    case 1:
      return { ...model, version: MODEL_VERSION };
    default:
      throw new Error(
        `Unsupported model version ${String(model.version)} (this build reads 1..${MODEL_VERSION})`,
      );
  }
}
