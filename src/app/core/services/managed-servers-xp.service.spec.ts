import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';

import { ManagedServersService, XpConfigUpdateRequest, XpSimulationRequest } from './managed-servers.service';

describe('ManagedServersService XP contract', () => {
  let http: jasmine.SpyObj<HttpClient>;
  let service: ManagedServersService;

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get', 'put', 'post']);
    http.get.and.returnValue(of({}));
    http.put.and.returnValue(of({}));
    http.post.and.returnValue(of({}));
    service = new ManagedServersService(http);
  });

  it('uses the guild-scoped XP config endpoint', () => {
    service.getXp('123').subscribe();

    expect(http.get).toHaveBeenCalledOnceWith(
      'http://localhost:8080/user/me/guilds/123/xp'
    );
  });

  it('saves config through the guild-scoped XP endpoint', () => {
    const request = {
      text: { enabled: true, baseMin: 8, baseMax: 16, cooldownMinSeconds: 30, cooldownMaxSeconds: 60 },
      voice: {
        enabled: true, xpPerMinute: 2, socialBonusPct: 0, socialBonusMinHumans: 2,
        diminishingWindow1Minutes: 60, diminishingWindow2Minutes: 120,
        diminishingFactor2: 0.6, diminishingFactor3: 0.3
      },
      progression: { k: 45, p: 2, b: 0 },
      limits: { textDailyCapXp: 300, voiceDailyCapXp: 600, globalDailyCapXp: 900 },
      levelUp: { enabled: true, channelId: '10', message: 'Parabéns {member}!' },
      advanced: { clearOnExit: false, multiplier: 1 }
    } satisfies XpConfigUpdateRequest;

    service.updateXp('123', request).subscribe();

    expect(http.put).toHaveBeenCalledOnceWith(
      'http://localhost:8080/user/me/guilds/123/xp',
      request
    );
  });

  it('sends progression points to the backend simulation endpoint without a client formula', () => {
    const request = {
      progression: { k: 45, p: 2, b: 0 },
      levels: [1, 5, 10, 50]
    } satisfies XpSimulationRequest;

    service.simulateXp('123', request).subscribe();

    expect(http.post).toHaveBeenCalledOnceWith(
      'http://localhost:8080/user/me/guilds/123/xp/simulation',
      request
    );
  });
});
