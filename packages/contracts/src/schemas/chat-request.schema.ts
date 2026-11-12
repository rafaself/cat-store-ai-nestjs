import { z } from 'zod';
import {
  addressChangeToolInputSchema,
  addressChangeProposalSchema,
  customerOrderSchema,
  orderIdSchema,
} from './agent-operations.schema.js';
import { catalogSearchResponseSchema } from './catalog.schema.js';

const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  state: z.enum(['streaming', 'done']).optional(),
});

// Only completed invocations of the assistant's server-side tools belong in history.
function toolPartSchema<
  T extends string,
  I extends z.ZodType,
  O extends z.ZodType,
>(type: T, input: I, output: O) {
  const base = z.object({
    type: z.literal(type),
    toolCallId: z.string().min(1),
    providerExecuted: z.literal(false).optional(),
  });
  return z
    .discriminatedUnion('state', [
      base.extend({
        state: z.literal('output-available'),
        input,
        output,
        errorText: z.never().optional(),
      }),
      base.extend({
        state: z.literal('output-error'),
        input: input.optional(),
        errorText: z.string(),
        output: z.never().optional(),
      }),
    ])
    .transform((part) => ({
      ...part,
      input: 'input' in part ? part.input : undefined,
    }));
}

const assistantPartSchema = z.union([
  textPartSchema,
  textPartSchema.extend({ type: z.literal('reasoning') }),
  z.object({ type: z.literal('step-start') }),
  toolPartSchema(
    'tool-find-order',
    z.object({ orderId: orderIdSchema }).strict(),
    customerOrderSchema.strict(),
  ),
  toolPartSchema(
    'tool-change-address',
    addressChangeToolInputSchema,
    z.union([customerOrderSchema.strict(), addressChangeProposalSchema]),
  ),
  toolPartSchema(
    'tool-search-products',
    z.object({ query: z.string().trim().min(2).max(500) }).strict(),
    catalogSearchResponseSchema,
  ),
]);

const messageSchema = z.discriminatedUnion('role', [
  z.object({
    id: z.string().min(1),
    role: z.literal('user'),
    parts: z.array(textPartSchema),
  }),
  z.object({
    id: z.string().min(1),
    role: z.literal('assistant'),
    parts: z.array(assistantPartSchema),
  }),
]);

export const chatRequestSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1)
    .max(40)
    .refine((messages) => messages.at(-1)?.role === 'user', {
      error: 'Conversation must end with a user message.',
    })
    .refine(
      (messages) =>
        messages.reduce(
          (total, message) =>
            total +
            message.parts.reduce(
              (sum, part) =>
                sum +
                ('text' in part
                  ? part.text.length
                  : JSON.stringify(part).length),
              0,
            ),
          0,
        ) <= 20_000,
      { error: 'Conversation is too long.' },
    ),
});

export type ChatRequest = z.output<typeof chatRequestSchema>;
