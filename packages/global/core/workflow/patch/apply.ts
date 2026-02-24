import { StoreEdgeItemTypeSchema, type StoreEdgeItemType } from '../type/edge';
import { StoreNodeItemTypeSchema, type StoreNodeItemType } from '../type/node';
import { WorkflowPatchSchema, type WorkflowPatchType } from './type';

const deepMerge = (target: any, patch: any) => {
  if (patch === null || patch === undefined) return target;
  if (Array.isArray(patch)) return patch;
  if (typeof patch !== 'object') return patch;
  const out = { ...(target || {}) };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = deepMerge(out[k], v);
  }
  return out;
};

export const applyWorkflowPatch = ({
  nodes,
  edges,
  entryNodeIds,
  patch
}: {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  entryNodeIds?: string[];
  patch: WorkflowPatchType;
}) => {
  const { ops } = WorkflowPatchSchema.parse(patch);

  let nextNodes = [...nodes];
  let nextEdges = [...edges];
  let nextEntryNodeIds = entryNodeIds ? [...entryNodeIds] : undefined;

  for (const op of ops) {
    if (op.op === 'createNode') {
      const node = StoreNodeItemTypeSchema.parse(op.node);
      // apply optional position hint
      const finalNode: StoreNodeItemType = op.position
        ? ({ ...node, position: op.position } as any)
        : (node as any);
      // upsert
      nextNodes = nextNodes.filter((n) => n.nodeId !== finalNode.nodeId).concat(finalNode);
      continue;
    }
    if (op.op === 'updateNode') {
      const idx = nextNodes.findIndex((n) => n.nodeId === op.nodeId);
      if (idx === -1) throw new Error(`updateNode: nodeId not found: ${op.nodeId}`);
      const merged = deepMerge(nextNodes[idx], op.patch);
      nextNodes[idx] = StoreNodeItemTypeSchema.parse(merged);
      continue;
    }
    if (op.op === 'deleteNode') {
      nextNodes = nextNodes.filter((n) => n.nodeId !== op.nodeId);
      nextEdges = nextEdges.filter((e) => e.source !== op.nodeId && e.target !== op.nodeId);
      if (nextEntryNodeIds) nextEntryNodeIds = nextEntryNodeIds.filter((id) => id !== op.nodeId);
      continue;
    }
    if (op.op === 'createEdge') {
      const edge = StoreEdgeItemTypeSchema.parse(op.edge);
      const exists = nextEdges.some(
        (e) =>
          e.source === edge.source &&
          e.sourceHandle === edge.sourceHandle &&
          e.target === edge.target &&
          e.targetHandle === edge.targetHandle
      );
      if (!exists) nextEdges.push(edge);
      continue;
    }
    if (op.op === 'deleteEdge') {
      const edge = StoreEdgeItemTypeSchema.parse(op.edge);
      nextEdges = nextEdges.filter(
        (e) =>
          !(
            e.source === edge.source &&
            e.sourceHandle === edge.sourceHandle &&
            e.target === edge.target &&
            e.targetHandle === edge.targetHandle
          )
      );
      continue;
    }
    if (op.op === 'setEntryNodeIds') {
      nextEntryNodeIds = [...op.entryNodeIds];
      continue;
    }
  }

  return { nodes: nextNodes, edges: nextEdges, entryNodeIds: nextEntryNodeIds };
};
