import { environment as baseEnv } from './environment.common';

export const environment = {
  ...baseEnv,
  production: true,
  // Rollout gate: hide recruitment UI until Database migrations and API enablement.
  recruitmentUiEnabled: false,
  apiBaseUrl: 'https://api.brafurries.com.br',
};
