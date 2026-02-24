import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { responseWrite } from '@fastgpt/service/common/response';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { WorkflowPlanSchema } from '@fastgpt/global/core/workflow/plan/type';
import { compileWorkflowPlanToV2Store } from '@fastgpt/global/core/workflow/plan/compile';
import z from 'zod';

const BodySchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1)
});

type Body = z.infer<typeof BodySchema>;

const systemPrompt = () => `
You are a Workflow Planner.

Return ONLY strict JSON.
Schema:
{
  "title": string,
  "inputs": [{"name": string, "type": "string"|"number"|"boolean"|"json", "required": boolean, "description"?: string}],
  "tasks": [{"id": string, "title": string, "instruction": string, "deps": string[]}]
}

Hard rules:
- Output must be a single JSON object. No markdown.
- tasks length >= 1
- deps must reference existing task ids.
- Keep tasks minimal and runnable.
`;

const extractJsonObject = (text: string) => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
};

async function handler(req: ApiRequestProps<Body>, res: ApiResponseType) {
  const { prompt, model } = BodySchema.parse(req.body);

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
    { role: 'user', content: prompt }
  ];

  let full = '';
  await createLLMResponse({
    body: {
      model,
      messages,
      temperature: 0.2,
      max_tokens: 2000,
      stream: true,
      useVision: false
    },
    onStreaming: ({ text }) => {
      full += text;
      responseWrite({
        res,
        event: SseResponseEventEnum.answer,
        data: JSON.stringify({
          choices: [{ delta: { content: text } }]
        })
      });
    }
  });

  try {
    const jsonStr = extractJsonObject(full) || full;
    const plan = WorkflowPlanSchema.parse(JSON.parse(jsonStr));
    const compiled = compileWorkflowPlanToV2Store({ plan });

    responseWrite({
      res,
      event: SseResponseEventEnum.tool,
      data: JSON.stringify({
        type: 'workflow_plan_result',
        plan,
        compiled
      })
    });
  } catch (e: any) {
    responseWrite({
      res,
      event: SseResponseEventEnum.tool,
      data: JSON.stringify({
        type: 'workflow_plan_error',
        message: e?.message || String(e),
        raw: full.slice(0, 4000)
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
