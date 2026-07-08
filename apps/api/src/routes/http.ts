import type { FastifyReply } from 'fastify';
import { z } from 'zod';

/**
 * Shared error responses. Bodies are `{ error, message }` (plan silent on
 * shape; 400 messages come from zod v4 `z.prettifyError`).
 */
export function sendBadRequest(reply: FastifyReply, error: z.ZodError): FastifyReply {
  return reply.code(400).send({ error: 'BadRequest', message: z.prettifyError(error) });
}

export function sendBadRequestMessage(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(400).send({ error: 'BadRequest', message });
}

export function sendNotFound(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(404).send({ error: 'NotFound', message });
}
