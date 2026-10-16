import { getSocialAuthErrorMessage } from './social-auth-error-message';

describe('getSocialAuthErrorMessage', () => {
  it('maps the current distinct social accounts error', () => {
    expect(
      getSocialAuthErrorMessage(
        'e-mail e provedor pertencem a contas distintas; regularização administrativa necessária'
      )
    ).toContain('contas distintas');
  });

  it('keeps the legacy merge-confirmation error user-friendly during rollout', () => {
    const raw = 'merge de contas requer confirmacao do usuario';
    const message = getSocialAuthErrorMessage(raw);

    expect(message).not.toBe(raw);
    expect(message).toContain('contas distintas');
  });

  it('preserves unrelated errors', () => {
    expect(getSocialAuthErrorMessage('erro qualquer')).toBe('erro qualquer');
  });
});
