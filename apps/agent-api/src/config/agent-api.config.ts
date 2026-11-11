import { z } from 'zod';

export function loadAgentApiConfig(environment: Record<string, unknown>) {
  const agent = z
    .object({
      AGENT_API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
      BUSINESS_API_URL: z.url().default('http://127.0.0.1:3000'),
    })
    .parse(environment);
  const businessUrl = new URL(agent.BUSINESS_API_URL);
  if (
    !['http:', 'https:'].includes(businessUrl.protocol) ||
    businessUrl.username ||
    businessUrl.password ||
    businessUrl.search ||
    businessUrl.hash
  ) {
    throw new Error(
      'BUSINESS_API_URL must be an HTTP(S) URL without credentials, query, or fragment.',
    );
  }
  return {
    port: agent.AGENT_API_PORT,
    businessApiUrl: agent.BUSINESS_API_URL.replace(/\/$/, ''),
  };
}
