import { resolve } from 'node:path';
import {
  readEnvironment,
  loadApiConfig,
  loadLoggerConfig,
  loadBedrockConfig,
} from '@cat-supplies-store/config';
import { createBedrockConfig } from '@cat-supplies-store/ai';
import { z } from 'zod';

const environment = readEnvironment(resolve(__dirname, '../../../.env'));
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
export const bedrockConfig = createBedrockConfig(
  loadBedrockConfig(environment),
);
export const appConfigOptions = {
  isGlobal: true,
  ignoreEnvFile: true,
  validate: () => ({
    api: loadApiConfig({ ...environment, PORT: agent.AGENT_API_PORT }),
    logger: loadLoggerConfig(environment),
    businessApi: { url: agent.BUSINESS_API_URL.replace(/\/$/, '') },
  }),
  load: [bedrockConfig],
};
