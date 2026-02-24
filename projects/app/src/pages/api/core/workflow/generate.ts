import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { responseWrite } from '@fastgpt/service/common/response';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { applyWorkflowPatch } from '@fastgpt/global/core/workflow/patch';
import { StoreNodeItemTypeSchema, type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { StoreEdgeItemTypeSchema, type StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import z from 'zod';

const BodySchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1),
  // current graph context
  nodes: z.array(StoreNodeItemTypeSchema).default([]),
  edges: z.array(StoreEdgeItemTypeSchema).default([]),
  entryNodeIds: z.array(z.string()).optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.any()
      })
    )
    .optional()
});

type GenerateBody = z.infer<typeof BodySchema>;

const systemPrompt = () => `
You are a FastGPT Workflow Copilot.

Goal: generate a runnable FastGPT workflow by OUTPUTTING A JSON patch ONLY.

Hard rules:
- Output must be strict JSON and match {"ops": [...]}
- Do NOT wrap in markdown.
- Only use tools/nodes that exist in the current system. If unsure, use generic nodes.
- Every created node must be a valid StoreNodeItemType (nodeId,name,flowNodeType,inputs,outputs,...)
- Every created edge must be a valid StoreEdgeItemType (source,sourceHandle,target,targetHandle)

Patch ops allowed:
- createNode {node}
- updateNode {nodeId, patch}
- deleteNode {nodeId}
- createEdge {edge}
- deleteEdge {edge}
- setEntryNodeIds {entryNodeIds}

You should:
1) create/ensure an entry node (workflowStart or systemConfig or pluginInput)
2) connect nodes so the graph is executable
3) add a final output node
4) keep it minimal and correct.
`;

async function handler(req: ApiRequestProps<GenerateBody>, res: ApiResponseType) {
  const { prompt, model, nodes, edges, entryNodeIds, conversationHistory = [] } =
    BodySchema.parse(req.body);

  await authCert({
    req,
    authToken: true,
    authApiKey: true
  });

  res.setHeader('Content-Type', 'text/event-stream;charset=utf-8');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt() },
    ...((conversationHistory as any) || []),
    {
      role: 'user',
      content: JSON.stringify({
        userPrompt: prompt,
        current: { nodes, edges, entryNodeIds }
      })
    }
  ];

  let full = '';
  await createLLMResponse({
    body: {
      model,
      messages,
      temperature: 0.2,
      max_tokens: 2500,
      stream: true,
      useVision: false
    },
    onStreaming: ({ text }) => {
      full += text;
      responseWrite({
        res,
        event: SseResponseEventEnum.answer,
        data: JSON.stringify({
          choices: [
            {
              delta: { content: text }
            }
          ]
        })
      });
    }
  });

  // try apply patch (best-effort). If parse fails, just end.
  try {
    const patch = JSON.parse(full);
    const result = applyWorkflowPatch({ nodes, edges, entryNodeIds, patch });
    responseWrite({
      res,
      event: SseResponseEventEnum.tool,
      data: JSON.stringify({
        type: 'workflow_patch_result',
        patch,
        result
      })
    });
  } catch (e: any) {
    responseWrite({
      res,
      event: SseResponseEventEnum.tool,
      data: JSON.stringify({
        type: 'workflow_patch_error',
        message: e?.message || String(e)
      })
    });
  }

  responseWrite({
    res,
    event: SseResponseEventEnum.answer,
    data: '[DONE]'
  });

  res.end();
}

export default NextAPI(handler);
