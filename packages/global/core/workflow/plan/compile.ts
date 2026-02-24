import type { StoreNodeItemType } from '../type/node';
import type { StoreEdgeItemType } from '../type/edge';
import { WorkflowPlanSchema, type WorkflowPlanType } from './type';
import { getNanoid } from '../../../common/string/tools';
import { FlowNodeTypeEnum } from '../node/constant';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '../constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '../node/constant';

const topoSort = (tasks: WorkflowPlanType['tasks']) => {
  const byId = new Map(tasks.map((t) => [t.id, t] as const));
  const inDeg = new Map<string, number>();
  const next = new Map<string, string[]>();

  tasks.forEach((t) => {
    inDeg.set(t.id, 0);
    next.set(t.id, []);
  });

  tasks.forEach((t) => {
    t.deps.forEach((d) => {
      if (!byId.has(d)) return;
      inDeg.set(t.id, (inDeg.get(t.id) || 0) + 1);
      next.get(d)?.push(t.id);
    });
  });

  const q: string[] = [];
  for (const [id, deg] of inDeg.entries()) {
    if (deg === 0) q.push(id);
  }

  const out: string[] = [];
  while (q.length) {
    const id = q.shift()!;
    out.push(id);
    for (const to of next.get(id) || []) {
      inDeg.set(to, (inDeg.get(to) || 0) - 1);
      if ((inDeg.get(to) || 0) === 0) q.push(to);
    }
  }

  // fallback: if cycle or missing deps, return original order
  if (out.length !== tasks.length) return tasks.map((t) => t.id);
  return out;
};

export const compileWorkflowPlanToV2Store = ({
  plan
}: {
  plan: WorkflowPlanType;
}): {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  entryNodeIds: string[];
} => {
  const parsed = WorkflowPlanSchema.parse(plan);
  const order = topoSort(parsed.tasks);
  const taskMap = new Map(parsed.tasks.map((t) => [t.id, t] as const));

  const startNodeId = getNanoid();
  const outputNodeId = getNanoid();

  const nodes: StoreNodeItemType[] = [];
  const edges: StoreEdgeItemType[] = [];

  // 1) Entry node
  nodes.push({
    nodeId: startNodeId,
    name: 'Start',
    flowNodeType: FlowNodeTypeEnum.workflowStart,
    inputs: [],
    outputs: [
      {
        id: getNanoid(),
        key: NodeOutputKeyEnum.text,
        label: 'text',
        type: FlowNodeOutputTypeEnum.static,
        valueType: 'string'
      }
    ],
    position: { x: 200, y: 120 }
  } as any);

  // 2) Task nodes (MVP: use a generic tool/LLM-like node placeholder)
  // We purposely keep node structure minimal and rely on existing runtime to ignore unknown keys.
  // If your FastGPT build has a dedicated LLM node type, we can switch FlowNodeTypeEnum here.
  const taskNodeIds: string[] = [];
  order.forEach((taskId, idx) => {
    const t = taskMap.get(taskId);
    if (!t) return;

    const nodeId = getNanoid();
    taskNodeIds.push(nodeId);

    nodes.push({
      nodeId,
      name: t.title,
      intro: t.instruction,
      flowNodeType: FlowNodeTypeEnum.tool,
      inputs: [
        {
          id: getNanoid(),
          key: NodeInputKeyEnum.input,
          label: 'input',
          valueType: 'string',
          type: FlowNodeInputTypeEnum.target,
          required: false
        },
        {
          id: getNanoid(),
          key: NodeInputKeyEnum.systemPrompt,
          label: 'instruction',
          value: t.instruction,
          valueType: 'string',
          type: FlowNodeInputTypeEnum.hidden,
          required: false
        }
      ] as any,
      outputs: [
        {
          id: getNanoid(),
          key: NodeOutputKeyEnum.text,
          label: 'text',
          type: FlowNodeOutputTypeEnum.source,
          valueType: 'string'
        }
      ],
      position: { x: 200, y: 240 + idx * 140 }
    } as any);
  });

  // 3) Output node
  nodes.push({
    nodeId: outputNodeId,
    name: 'Output',
    flowNodeType: FlowNodeTypeEnum.systemConfig,
    inputs: [
      {
        id: getNanoid(),
        key: NodeInputKeyEnum.input,
        label: 'input',
        valueType: 'string',
        type: FlowNodeInputTypeEnum.target,
        required: false
      }
    ] as any,
    outputs: [],
    position: { x: 520, y: 240 + (taskNodeIds.length - 1) * 140 }
  } as any);

  // 4) Connect edges in a simple chain
  const chain = [startNodeId, ...taskNodeIds, outputNodeId];
  for (let i = 0; i < chain.length - 1; i++) {
    edges.push({
      source: chain[i],
      sourceHandle: NodeOutputKeyEnum.text,
      target: chain[i + 1],
      targetHandle: NodeInputKeyEnum.input
    } as any);
  }

  return {
    nodes,
    edges,
    entryNodeIds: [startNodeId]
  };
};
