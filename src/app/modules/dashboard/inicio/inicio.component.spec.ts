import { of, throwError } from 'rxjs';
import { UserService } from '../../../core/services/user.service';
import { InicioComponent } from './inicio.component';

describe('InicioComponent Discord connectivity', () => {
  let user: jasmine.SpyObj<UserService>;
  let component: InicioComponent;

  beforeEach(() => {
    user = jasmine.createSpyObj<UserService>('UserService', [
      'getUser', 'getDashboardData', 'beginDiscordLink', 'openDiscordLinkOAuth'
    ]);
    user.getUser.and.returnValue(null);
    user.getDashboardData.and.returnValue(of({} as any));
    component = new InicioComponent(user);
  });

  it('opens OAuth proof when user chooses Connect Discord instead of doing nothing', () => {
    user.beginDiscordLink.and.returnValue(of({ ticket: 'ticket-123' }));
    component.connectDiscord();
    expect(user.beginDiscordLink).toHaveBeenCalledTimes(1);
    expect(user.openDiscordLinkOAuth).toHaveBeenCalledOnceWith('ticket-123');
  });

  it('never redirects to provider if the authenticated API denies initiation', () => {
    user.beginDiscordLink.and.returnValue(throwError(() => new Error('401')));
    component.connectDiscord();
    expect(user.openDiscordLinkOAuth).not.toHaveBeenCalled();
    expect(component.discordLinkLoading).toBeFalse();
    expect(component.discordLinkError).toContain('Não foi possível iniciar');
  });

  it('does not submit concurrent duplicate link challenges', () => {
    user.beginDiscordLink.and.returnValue(of({ ticket: 'ticket-123' }));
    component.connectDiscord();
    component.connectDiscord();
    expect(user.beginDiscordLink).toHaveBeenCalledTimes(1);
  });
});
