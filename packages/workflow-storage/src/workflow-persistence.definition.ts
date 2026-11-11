import { ConfigurableModuleBuilder } from '@nestjs/common';
import type { PoolConfig } from 'pg';

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<PoolConfig>().build();
