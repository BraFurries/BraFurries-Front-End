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
    return 'O e-mail e o provedor social pertencem a contas distintas. Por segurança, entre com a conta original e solicite a regularização à administração.';
  }

  return message;
}
