import z from 'zod';

export const WorkflowPlanInputTypeEnum = ['string', 'number', 'boolean', 'json'] as const;
export type WorkflowPlanInputType = (typeof WorkflowPlanInputTypeEnum)[number];

export const WorkflowPlanInputSchema = z.object({
  name: z.string().min(1),
  type: z.enum(WorkflowPlanInputTypeEnum).default('string'),
  required: z.boolean().default(false),
  description: z.string().optional()
});
export type WorkflowPlanInput = z.infer<typeof WorkflowPlanInputSchema>;

export const WorkflowPlanTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  instruction: z.string().min(1),
  deps: z.array(z.string()).default([])
});
export type WorkflowPlanTask = z.infer<typeof WorkflowPlanTaskSchema>;

export const WorkflowPlanSchema = z.object({
  title: z.string().min(1).default('Untitled Workflow'),
  inputs: z.array(WorkflowPlanInputSchema).default([]),
  tasks: z.array(WorkflowPlanTaskSchema).min(1)
});
export type WorkflowPlanType = z.infer<typeof WorkflowPlanSchema>;
