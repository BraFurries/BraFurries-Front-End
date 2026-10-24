import { environment as baseEnv } from './environment.common';

export const environment = {
  ...baseEnv,
  production: true,
  // BraFurries-only recruitment UI is enabled after the manual schema rollout.
  // API checks Community authorization and the active official Discord guild.
  recruitmentUiEnabled: true,
  apiBaseUrl: 'https://api.brafurries.com.br',
};
