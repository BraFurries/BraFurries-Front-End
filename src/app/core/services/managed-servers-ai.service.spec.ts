import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';

import { AiConfigUpdateRequest, ManagedServersService } from './managed-servers.service';

describe('ManagedServersService AI contract', () => {
  let http: jasmine.SpyObj<HttpClient>;
  let service: ManagedServersService;

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get', 'put', 'delete']);
    http.get.and.returnValue(of({}));
    http.put.and.returnValue(of({}));
    http.delete.and.returnValue(of({}));
    service = new ManagedServersService(http);
  });

  it('loads guild-scoped AI config', () => {
    service.getAi('123').subscribe();

    expect(http.get).toHaveBeenCalledOnceWith(
      'http://localhost:8080/user/me/guilds/123/ai'
    );
  });

  it('saves AI config through the guild-scoped endpoint', () => {
    const request: AiConfigUpdateRequest = {
      enabled: true,
      model: 'gpt-5-mini',
      channelLimitEnabled: true,
      channelIds: ['10'],
      adminChannelBypassEnabled: true,
      adminUserIds: ['42']
    };

    service.updateAi('123', request).subscribe();

    expect(http.put).toHaveBeenCalledOnceWith(
      'http://localhost:8080/user/me/guilds/123/ai',
      request
    );
  });

  it('sends a replacement token only to the write-only token endpoint', () => {
    service.rotateAiToken('123', 'secret-value').subscribe();

    expect(http.put).toHaveBeenCalledOnceWith(
      'http://localhost:8080/user/me/guilds/123/ai/token',
      { token: 'secret-value' }
    );
  });

  it('removes a token through the dedicated endpoint', () => {
    service.removeAiToken('123').subscribe();

    expect(http.delete).toHaveBeenCalledOnceWith(
      'http://localhost:8080/user/me/guilds/123/ai/token'
    );
  });
});
