import { of, Subject, throwError } from 'rxjs';
import { UserService } from '../../../core/services/user.service';
import { InicioComponent } from './inicio.component';

describe('InicioComponent Discord linking', () => {
  let userService: jasmine.SpyObj<UserService>;
  let component: InicioComponent;

  beforeEach(() => {
    userService = jasmine.createSpyObj<UserService>(
      'UserService', ['getUser', 'getDashboardData', 'requestDiscordAccountLink']
    );
    userService.getUser.and.returnValue(null);
    userService.getDashboardData.and.returnValue(of({
      discord: { connected: false },
      servers: [],
      events: [],
      meets: []
    } as any));
    component = new InicioComponent(userService);
  });

  it('starts a verified link challenge rather than logging in as another user', () => {
    const result = new Subject<string>();
    userService.requestDiscordAccountLink.and.returnValue(result.asObservable());
    component.connectDiscord();
    expect(userService.requestDiscordAccountLink).toHaveBeenCalledTimes(1);
    expect(component.discordConnecting).toBeTrue();
    result.error(new Error('OAuth unavailable'));
    expect(component.discordConnecting).toBeFalse();
    expect(component.discordConnectError).toContain('Não foi possível');
  });

  it('refuses to navigate to an arbitrary redirect returned by the API', () => {
    userService.requestDiscordAccountLink.and.returnValue(of('https://attacker.example/phishing'));
    component.connectDiscord();
    expect(component.discordConnecting).toBeFalse();
    expect(component.discordConnectError).toContain('conexão segura');
  });

  it('prevents duplicate link attempts while the first challenge is pending', () => {
    const pending = new Subject<string>();
    userService.requestDiscordAccountLink.and.returnValue(pending.asObservable());
    component.connectDiscord();
    component.connectDiscord();
    expect(userService.requestDiscordAccountLink).toHaveBeenCalledTimes(1);
    pending.error(new Error('abort'));
  });

  it('keeps the error provided by the authorized backend', () => {
    userService.requestDiscordAccountLink.and.returnValue(
      throwError(() => ({ error: { message: 'Muitas tentativas de conexão.' } }))
    );
    component.connectDiscord();
    expect(component.discordConnectError).toBe('Muitas tentativas de conexão.');
  });
});
