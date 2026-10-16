import { environment as baseEnv } from './environment.common';

export const environment = {
  ...baseEnv,
  production: false,
  apiBaseUrl: 'http://localhost:8080',
};
