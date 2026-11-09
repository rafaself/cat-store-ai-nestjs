import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('uses local defaults without requiring an OpenAI API key', () => {
    expect(validateEnvironment({})).toEqual({
      OPENAI_API_KEY: undefined,
      OPENAI_MODEL: 'gpt-4o-mini',
      PORT: 3000,
    });
  });

  it('rejects an invalid port', () => {
    expect(() => validateEnvironment({ PORT: '70000' })).toThrow(
      'Invalid environment configuration',
    );
  });
});
