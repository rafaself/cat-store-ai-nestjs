import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export type Environment = Record<string, string | undefined>;

export function readEnvironment(
  envFilePath: string,
  ambient: Environment = process.env,
): Environment {
  let fileContents: string;
  try {
    fileContents = readFileSync(envFilePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { ...ambient };
    throw error;
  }
  return { ...parseEnv(fileContents), ...ambient };
}
