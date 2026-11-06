import { getSocialAuthErrorMessage } from './social-auth-error-message';

describe('getSocialAuthErrorMessage', () => {
  it('maps the current distinct social accounts error', () => {
    expect(
      getSocialAuthErrorMessage(
        'e-mail e provedor pertencem a contas distintas; regularização administrativa necessária'
      )
    ).toContain('Conectar Discord');
  });

  it('keeps the legacy merge-confirmation error user-friendly during rollout', () => {
    const raw = 'merge de contas requer confirmacao do usuario';
    const message = getSocialAuthErrorMessage(raw);

    expect(message).not.toBe(raw);
    expect(message).toContain('Conectar Discord');
  });

  it('guides verified Discord email conflicts to self-service recovery', () => {
    expect(getSocialAuthErrorMessage('ACCOUNT_LINK_REQUIRED')).toContain('Google');
    expect(getSocialAuthErrorMessage('ACCOUNT_LINK_REQUIRED')).toContain('Conectar Discord');
  });

  it('never describes conflicted identities as already connected', () => {
    const message = getSocialAuthErrorMessage('ACCOUNT_RECONCILIATION_REQUIRED');
    expect(message).toContain('reconciliação');
    expect(message).not.toContain('já foram unificadas');
  });

  it('explains authentication when the old account became a provenance alias', () => {
    const message = getSocialAuthErrorMessage('ACCOUNT_CONSOLIDATED');
    expect(message).toContain('Entre novamente');
  });

  it('preserves unrelated errors', () => {
    expect(getSocialAuthErrorMessage('erro qualquer')).toBe('erro qualquer');
  });
});
