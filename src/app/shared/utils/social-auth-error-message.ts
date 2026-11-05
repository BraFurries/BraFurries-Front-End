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
    normalized === 'account_link_required' ||
    normalized === DISTINCT_SOCIAL_ACCOUNTS_ERROR ||
    normalized === LEGACY_ACCOUNT_MERGE_CONFIRMATION_ERROR
  ) {
    return 'Seu Discord já possui registros em outra conta BraFurries. Entre com Google na sua conta do site e use “Conectar Discord” no painel para vincular as contas com segurança, sem precisar pedir intervenção da equipe.';
  }

  return message;
}
