import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminService } from './admin.service';

describe('AdminService log contract', () => {
  let service: AdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the consumed cursor, including zero, and preserves the proxy metadata', () => {
    const response = {
      status: 'available', items: [], totalBuffered: 600, limit: 100,
      oldestSequence: 1, latestSequence: 600, nextSequence: 100, cursorExpired: false
    };
    service.getBotLogs(100, 'WARNING', 0).subscribe(value => {
      expect(value.nextSequence).toBe(100);
      expect(value.latestSequence).toBe(600);
      expect(value.cursorExpired).toBeFalse();
      expect('botStatus' in value).toBeFalse();
    });
    const request = http.expectOne(req => req.url.endsWith('/admin/bot/logs'));
    expect(request.request.params.get('after')).toBe('0');
    expect(request.request.params.get('level')).toBe('WARNING');
    expect(request.request.params.get('limit')).toBe('100');
    request.flush(response);
  });

  it('forwards every minimum severity level unchanged on a full load', () => {
    for (const level of ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']) {
      service.getBotLogs(100, level).subscribe();
      const request = http.expectOne(req => req.url.endsWith('/admin/bot/logs'));
      expect(request.request.params.has('after')).toBeFalse();
      expect(request.request.params.get('level')).toBe(level);
      request.flush({ status: 'available', items: [], nextSequence: 0 });
    }
  });

  it('forwards before independently from after with a 1000 item batch', () => {
    service.getBotLogs(1000, 'INFO', null, 5000).subscribe();
    const request = http.expectOne(req => req.url.endsWith('/admin/bot/logs'));
    expect(request.request.params.get('limit')).toBe('1000');
    expect(request.request.params.get('level')).toBe('INFO');
    expect(request.request.params.get('before')).toBe('5000');
    expect(request.request.params.has('after')).toBeFalse();
    request.flush({ status: 'available', items: [], nextSequence: 9000 });
  });

  it('loads one partner by id from the detail endpoint', () => {
    service.getPartner(7).subscribe();
    const request = http.expectOne(req => req.url.endsWith('/admin/partners/7'));
    expect(request.request.method).toBe('GET');
    request.flush({ id: 7, name: 'Parceiro', status: 'active', category: 'community', links: [], clicks: 0, invites: 0 });
  });

  it('loads normalized linkable partner resources with category, search and bounded limit', () => {
    service.getPartnerLinkableResources('artist', '  Nick  ', 80).subscribe(response => {
      expect(response[0].resourceType).toBe('user');
      expect(response[0].name).toBe('Nick');
    });

    const request = http.expectOne(req => req.url.endsWith('/admin/partners/linkable-resources'));
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('category')).toBe('artist');
    expect(request.request.params.get('search')).toBe('Nick');
    expect(request.request.params.get('limit')).toBe('50');
    request.flush([{ resourceType: 'user', id: 12, externalRef: null, name: 'Nick', subtitle: 'Usuário', imageUrl: null, prefill: { name: 'Nick', links: [] } }]);
  });

  it('uploads and removes partner images using the expected endpoints and file field', () => {
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    service.uploadPartnerImage(7, file).subscribe();
    const upload = http.expectOne(req => req.url.endsWith('/admin/partners/7/image'));
    expect(upload.request.method).toBe('POST');
    expect((upload.request.body as FormData).get('file')).toBe(file);
    upload.flush({ partnerId: 7, imageUrl: 'https://cdn.example/logo.webp' });

    service.deletePartnerImage(7).subscribe();
    const remove = http.expectOne(req => req.url.endsWith('/admin/partners/7/image'));
    expect(remove.request.method).toBe('DELETE');
    remove.flush({ partnerId: 7, imageUrl: null });
  });

  it('uses the neutral identity and community-scoped moderation contracts', () => {
    service.getUserIdentity(25).subscribe();
    const identity = http.expectOne(req => req.url.endsWith('/admin/users/25/identity'));
    expect(identity.request.method).toBe('GET');
    identity.flush({ requestedUserId: 25, confirmedAccounts: [], confirmedLinks: [], suspectedLinks: [] });

    service.getUserIdentityModerationHistory(25, 7).subscribe();
    const history = http.expectOne(req => req.url.endsWith('/admin/users/25/moderation-history'));
    expect(history.request.method).toBe('GET');
    expect(history.request.params.get('communityId')).toBe('7');
    history.flush({ requestedUserId: 25, communityId: 7, confirmedUserIds: [], warnings: [], bans: [], notes: [], suspectedLinks: [] });
  });

  it('loads the profile dossier and updates the platform role without using the list endpoint', () => {
    service.getUserProfile(25, 2, 10).subscribe();
    const profile = http.expectOne(req => req.url.endsWith('/admin/users/25/profile'));
    expect(profile.request.method).toBe('GET');
    expect(profile.request.params.get('page')).toBe('2');
    expect(profile.request.params.get('pageSize')).toBe('10');
    profile.flush({ identity: { id: 25, status: 'active', role: 'member' }, communities: [], moderation: { records: [] } });

    service.getUserReliability(25).subscribe();
    const reliability = http.expectOne(req => req.url.endsWith('/admin/users/25/reliability'));
    expect(reliability.request.method).toBe('GET');
    reliability.flush({ user: { id: 25 }, moderation: {}, events: {}, communities: {}, account: {}, reliability: {} });

    service.updateUserRole(25, 'moderator').subscribe();
    const role = http.expectOne(req => req.url.endsWith('/admin/users/25/role'));
    expect(role.request.method).toBe('PATCH');
    expect(role.request.body).toEqual({ role: 'moderator' });
    role.flush({ id: 25, role: 'moderator' });
  });

  it('loads persisted community context and live Discord state through separate endpoints', () => {
    service.getUserCommunityContext(25, 7).subscribe();
    const context = http.expectOne(req => req.url.endsWith('/admin/users/25/communities/7/context'));
    expect(context.request.method).toBe('GET');
    context.flush({ userId: 25, communityId: 7 });

    service.getUserDiscordMember(25, 7).subscribe();
    const discord = http.expectOne(req => req.url.endsWith('/admin/users/25/communities/7/discord-member'));
    expect(discord.request.method).toBe('GET');
    discord.flush({ guildId: '7', discordUserId: '8', roles: [] });
  });

  it('previews and links Discord identities without coercing snowflakes to numbers', () => {
    const discordId = '123456789012345678';

    service.previewDiscordIdentity(25, discordId).subscribe(response => {
      expect(response.discordUserId).toBe(discordId);
      expect(response.existingUserId).toBeNull();
    });
    const preview = http.expectOne(req =>
      req.url.endsWith(`/admin/users/25/discord-identities/${discordId}/preview`)
    );
    expect(preview.request.method).toBe('GET');
    preview.flush({
      discordUserId: discordId,
      username: 'outside.user',
      displayName: 'Outside User',
      bot: false,
      existingUserId: null,
      existingUserDisplayName: null,
      alreadyInConfirmedCluster: false
    });

    service.linkDiscordIdentity(25, discordId, 'mesma pessoa').subscribe();
    const link = http.expectOne(req => req.url.endsWith('/admin/users/25/discord-identities'));
    expect(link.request.method).toBe('POST');
    expect(link.request.body).toEqual({ discordUserId: discordId, reason: 'mesma pessoa' });
    link.flush({ targetUserId: 30, createdUser: true, link: {} });
  });

  it('creates, confirms and revokes links with explicit reasons', () => {
    service.createUserIdentityLink(10, 25, 'SUSPECTED', 'indícios').subscribe();
    const create = http.expectOne(req => req.url.endsWith('/admin/users/10/identity-links'));
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ otherUserId: 25, status: 'SUSPECTED', reason: 'indícios' });
    create.flush({});

    service.updateUserIdentityLink(10, 25, 'CONFIRMED', 'confirmado').subscribe();
    const update = http.expectOne(req => req.url.endsWith('/admin/users/10/identity-links/25'));
    expect(update.request.method).toBe('PATCH');
    expect(update.request.body).toEqual({ status: 'CONFIRMED', reason: 'confirmado' });
    update.flush({});

    service.revokeUserIdentityLink(10, 25, 'incorreto').subscribe();
    const revoke = http.expectOne(req => req.url.endsWith('/admin/users/10/identity-links/25/revoke'));
    expect(revoke.request.method).toBe('POST');
    expect(revoke.request.body).toEqual({ reason: 'incorreto' });
    revoke.flush({});
  });
});
