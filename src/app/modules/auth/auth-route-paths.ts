export const authRoutePaths = [
  'login',
  'social-login',
  'social-register',
  'register',
  'confirm-email',
  'forgot-password',
  'reset-password'
] as const;

export type AuthRoutePath = typeof authRoutePaths[number];
