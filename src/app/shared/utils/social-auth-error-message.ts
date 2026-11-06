const DISTINCT_SOCIAL_ACCOUNTS_ERROR =
  'e-mail e provedor pertencem a contas distintas; regularização administrativa necessária';
const LEGACY_ACCOUNT_MERGE_CONFIRMATION_ERROR =
  'merge de contas requer confirmacao do usuario';

export function getSocialAuthErrorMessage(message?: string | null): string | null {
  if (!message) {
    return null;
  }

  const normalized = message.trim().toLowerCase();
  if (normalized === 'account_consolidated') {
    return 'Esta conta foi unificada. Entre novamente com um dos provedores já comprovados.';
  }

  if (normalized === 'account_reconciliation_required') {
    return 'Detectamos dados de contas que precisam de reconciliação. Acesse a conta original do site para verificar seus provedores. Se houver conflitos, solicite uma revisão de identidade.';
  }

  if (
    normalized === 'account_link_required' ||
    normalized === DISTINCT_SOCIAL_ACCOUNTS_ERROR ||
    normalized === LEGACY_ACCOUNT_MERGE_CONFIRMATION_ERROR
  ) {
    return 'Se você já tem conta no site, entre com Google ou e-mail e use “Conectar Discord” no painel para comprovar as duas identidades. Caso não consiga acessar sua conta antiga, use “Esqueceu a senha?” para recuperá-la.';
  }

  return message;
}
