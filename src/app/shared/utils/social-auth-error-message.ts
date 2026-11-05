const DISTINCT_SOCIAL_ACCOUNTS_ERROR =
  'e-mail e provedor pertencem a contas distintas; regularização administrativa necessária';
const LEGACY_ACCOUNT_MERGE_CONFIRMATION_ERROR =
  'merge de contas requer confirmacao do usuario';

export function getSocialAuthErrorMessage(message?: string | null): string | null {
  if (!message) {
    return null;
  }

  const normalized = message.trim().toLowerCase();
  if (
    normalized === DISTINCT_SOCIAL_ACCOUNTS_ERROR ||
    normalized === LEGACY_ACCOUNT_MERGE_CONFIRMATION_ERROR
  ) {
    return 'Encontramos um cadastro de site e uma identidade Discord diferente. Entre com Google na sua conta do site, depois use “Conectar Discord” no painel para comprovar as duas identidades e recuperar seus dados.';
  }

  return message;
}
