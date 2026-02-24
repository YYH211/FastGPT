import z from 'zod';

export const WorkflowPatchOpTypeEnum = [
  'createNode',
  'updateNode',
  'deleteNode',
  'createEdge',
  'deleteEdge',
  'setEntryNodeIds'
] as const;
export type WorkflowPatchOpType = (typeof WorkflowPatchOpTypeEnum)[number];

export const PatchPositionSchema = z.object({
  x: z.number(),
  y: z.number()
});

// Keep schemas light: validation of node internals should reuse existing StoreNodeItemTypeSchema in apply step.
export const WorkflowPatchOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('createNode'),
    node: z.any(),
    // optional hint for UI placement
    position: PatchPositionSchema.optional()
  }),
  z.object({
    op: z.literal('updateNode'),
    nodeId: z.string(),
    patch: z.record(z.any())
  }),
  z.object({
    op: z.literal('deleteNode'),
    nodeId: z.string()
  }),
  z.object({
    op: z.literal('createEdge'),
    edge: z.any()
  }),
  z.object({
    op: z.literal('deleteEdge'),
    edge: z.any()
  }),
  z.object({
    op: z.literal('setEntryNodeIds'),
    entryNodeIds: z.array(z.string())
  })
]);
export type WorkflowPatchOperation = z.infer<typeof WorkflowPatchOperationSchema>;

export const WorkflowPatchSchema = z.object({
  ops: z.array(WorkflowPatchOperationSchema)
});
export type WorkflowPatchType = z.infer<typeof WorkflowPatchSchema>;
