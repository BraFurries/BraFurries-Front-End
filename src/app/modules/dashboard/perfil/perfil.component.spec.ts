import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CommunityAccessService } from '../../../core/services/community-access.service';
import { MemberProfileService } from '../../../core/services/member-profile.service';
import { SeoService } from '../../../core/services/seo-service.service';
import { UserService } from '../../../core/services/user.service';
import { MemberCommunityContextResponse, MemberProfileResponse } from '../../../shared/models/api/member-profile/member-profile';
import { PerfilComponent } from './perfil.component';

describe('PerfilComponent', () => {
  let component: PerfilComponent;
  let fixture: ComponentFixture<PerfilComponent>;
  let service: jasmine.SpyObj<MemberProfileService>;
  let communityAccessService: jasmine.SpyObj<CommunityAccessService>;
  let userService: jasmine.SpyObj<UserService>;
  let router: jasmine.SpyObj<Router>;
  const context = (state = 'AVAILABLE'): MemberCommunityContextResponse => ({
    community: { communityId: 7, communityName: 'Comunidade real', guildId: '123' },
    membership: { state: state as any, recordCount: 1, memberSince: '2025-01-01', lastJoinDate: null, approved: true, approvedAt: null, present: true, leftAt: null, vip: false, partner: false },
    progression: { state: state as any, recordCount: 1, level: 3, totalXp: 120 },
    economy: { state: state as any, recordCount: 1, balance: 50 }, inventory: [],
    moderation: { totalWarnings: 2, activeWarnings: 1, totalBans: 1, activeBans: 0 }
  });
  const profile = (communities: MemberProfileResponse['communities'] = [{ communityId: 7, communityName: 'Comunidade real', guildId: '123', membershipState: 'AVAILABLE', membershipRecordCount: 1 }]): MemberProfileResponse => ({
    userId: 1, displayName: 'Luna', username: 'luna', profileImageUrl: null, birthday: null,
    discord: { state: 'NOT_FOUND', recordCount: 0, username: null, displayName: null },
    telegram: { state: 'NOT_FOUND', recordCount: 0, username: null, displayName: null },
    communityCount: communities.length, firstKnownCommunity: { state: 'NOT_FOUND', communityId: null, communityName: null, memberSince: null }, communities
  });

  beforeEach(async () => {
    service = jasmine.createSpyObj<MemberProfileService>('MemberProfileService', ['getProfile', 'getCommunityContext', 'getModeration', 'updateDisplayName', 'uploadProfileImage', 'deleteProfileImage']);
    communityAccessService = jasmine.createSpyObj<CommunityAccessService>('CommunityAccessService', ['getAccess']);
    userService = jasmine.createSpyObj<UserService>('UserService', [
      'updateCachedUser', 'beginDiscordLink', 'openDiscordLinkOAuth',
      'previewDiscordLink', 'confirmDiscordLink', 'consolidateDiscordLink',
      'finishAccountConsolidation', 'getSocialLogins', 'disableSocialLogin',
      'enableDiscordLogin', 'finishSocialLoginSecurityChange',
      'getLocalEmailProof', 'requestLocalEmailProof'
    ]);
    userService.getSocialLogins.and.returnValue(of([]));
    userService.getLocalEmailProof.and.returnValue(of({email: 'luna@example.com', verified: true}));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.returnValue(Promise.resolve(true));
    service.getProfile.and.returnValue(of(profile()));
    communityAccessService.getAccess.and.callFake((communityId) => of({
      communityId,
      owner: false,
      communityAdmin: false,
      activeMember: true,
      canManageCommunityAdmins: false,
      activeRoleIds: [],
      capabilities: [],
      teamScopes: []
    }));
    service.getCommunityContext.and.returnValue(of(context()));
    service.getModeration.and.returnValue(of({ items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 0 }));
    await TestBed.configureTestingModule({ declarations: [PerfilComponent], imports: [CommonModule, FormsModule], providers: [
      { provide: MemberProfileService, useValue: service }, { provide: CommunityAccessService, useValue: communityAccessService }, { provide: UserService, useValue: userService }, { provide: SeoService, useValue: { updateMetaTags: jasmine.createSpy() } },
      { provide: Router, useValue: router }
    ] }).compileComponents();
    fixture = TestBed.createComponent(PerfilComponent); component = fixture.componentInstance; fixture.detectChanges();
  });

  it('loads the profile, selects the first real community by id and removes prototype content', () => {
    expect(service.getCommunityContext).toHaveBeenCalledWith(7);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Luna');
    expect(text).not.toContain('Fernando'); expect(text).not.toContain('São Paulo'); expect(text).not.toContain('LVL 42');
    expect(text).not.toContain('4.500'); expect(text).not.toContain('Tempo em Call'); expect(text).not.toContain('Servidor do Café');
  });

  it('orders the canonical BraFurries guild before owned, administered and other communities', () => {
    service.getProfile.and.returnValue(of(profile([
      { communityId: 11, communityName: 'BraFurries', guildId: '11', membershipState: 'AVAILABLE', membershipRecordCount: 1 },
      { communityId: 12, communityName: 'Admin A', guildId: '12', membershipState: 'AVAILABLE', membershipRecordCount: 1 },
      { communityId: 13, communityName: 'Dono A', guildId: '13', membershipState: 'AVAILABLE', membershipRecordCount: 1 },
      { communityId: 14, communityName: 'BraFurries Renomeada', guildId: '753321055682035712', membershipState: 'AVAILABLE', membershipRecordCount: 1 },
      { communityId: 15, communityName: 'Dono B', guildId: '15', membershipState: 'AVAILABLE', membershipRecordCount: 1 },
      { communityId: 16, communityName: 'Admin B', guildId: '16', membershipState: 'AVAILABLE', membershipRecordCount: 1 },
      { communityId: 17, communityName: 'Outro B', guildId: '17', membershipState: 'AVAILABLE', membershipRecordCount: 1 }
    ])));

    communityAccessService.getAccess.and.callFake((communityId) => of({
      communityId,
      owner: communityId === 13 || communityId === 15,
      communityAdmin: communityId === 12 || communityId === 16,
      activeMember: true,
      canManageCommunityAdmins: false,
      activeRoleIds: [],
      capabilities: [],
      teamScopes: []
    }));

    const fresh = TestBed.createComponent(PerfilComponent);
    fresh.detectChanges();

    expect(fresh.componentInstance.profile?.communities.map(item => item.communityId)).toEqual([
      14, 13, 15, 12, 16, 11, 17
    ]);
    expect(service.getCommunityContext).toHaveBeenCalledWith(14);
  });

  it('keeps profile errors separate', () => {
    service.getProfile.and.returnValue(throwError(() => new Error('offline')));
    const fresh = TestBed.createComponent(PerfilComponent); fresh.detectChanges();
    expect(fresh.componentInstance.profileError).toContain('Não foi possível');
    expect(fresh.componentInstance.context).toBeNull();
  });

  it('uses avatar data or a display-name initial fallback', () => {
    expect(fixture.nativeElement.textContent).toContain('L');
    component.profile!.profileImageUrl = 'https://cdn.example/avatar.png'; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img[alt="Luna"]')).toBeTruthy();
  });

  it('handles available and ambiguous accounts without inventing an account', () => {
    component.profile!.discord = { state: 'AVAILABLE', recordCount: 1, username: 'luna_discord', displayName: null };
    component.profile!.telegram = { state: 'AMBIGUOUS', recordCount: 2, username: null, displayName: null }; fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('luna_discord');
    expect(fixture.nativeElement.textContent).toContain('vínculo não pôde ser determinado');
  });

  it('does not request context when there are no communities', () => {
    service.getProfile.and.returnValue(of(profile([])));
    const fresh = TestBed.createComponent(PerfilComponent); fresh.detectChanges();
    expect(fresh.nativeElement.textContent).toContain('não possui vínculos comunitários');
  });

  it('cancels a stale context request when a newer community is selected', () => {
    const first = new Subject<MemberCommunityContextResponse>(); const second = new Subject<MemberCommunityContextResponse>();
    service.getProfile.and.returnValue(of(profile([
      { communityId: 7, communityName: 'A', guildId: null, membershipState: 'AVAILABLE', membershipRecordCount: 1 },
      { communityId: 8, communityName: 'B', guildId: null, membershipState: 'AVAILABLE', membershipRecordCount: 1 }
    ])));
    service.getCommunityContext.and.callFake((id) => id === 7 ? first : second);
    const fresh = TestBed.createComponent(PerfilComponent); fresh.detectChanges();
    fresh.componentInstance.selectCommunity(8); first.next(context()); second.next({ ...context(), community: { communityId: 8, communityName: 'B', guildId: null } });
    expect(fresh.componentInstance.context?.community.communityId).toBe(8);
  });

  it('keeps context visible when moderation fails and renders defensive states', () => {
    service.getModeration.and.returnValue(throwError(() => new Error('history')));
    const fresh = TestBed.createComponent(PerfilComponent); fresh.detectChanges();
    expect(fresh.componentInstance.context).toBeTruthy(); expect(fresh.componentInstance.moderationError).toContain('Não foi possível');
    fresh.componentInstance.context!.progression = { state: 'AMBIGUOUS', recordCount: 2, level: null, totalXp: null };
    fresh.componentInstance.context!.economy = { state: 'NOT_FOUND', recordCount: 0, balance: null }; fresh.detectChanges();
    expect(fresh.nativeElement.textContent).toContain('Não foi possível determinar a progressão');
    expect(fresh.nativeElement.textContent).not.toContain('Nível 0');
  });

  it('edits, validates and cancels the display name without changing other profile data', () => {
    component.startDisplayNameEdit();
    expect(component.editingDisplayName).toBeTrue();
    expect(component.displayNameDraft).toBe('Luna');
    component.displayNameDraft = '   ';
    component.saveDisplayName();
    expect(component.displayNameError).toContain('Informe');
    component.displayNameDraft = 'a'.repeat(33);
    component.saveDisplayName();
    expect(component.displayNameError).toContain('32');
    component.cancelDisplayNameEdit();
    expect(component.editingDisplayName).toBeFalse();
    expect(component.displayNameDraft).toBe('Luna');
  });

  it('applies the display name returned by the API to the profile and cached session', () => {
    service.updateDisplayName.and.returnValue(of({ userId: 1, displayName: 'Nome Confirmado' }));
    component.startDisplayNameEdit(); component.displayNameDraft = 'Nome local'; component.saveDisplayName();
    expect(component.profile?.displayName).toBe('Nome Confirmado');
    expect(userService.updateCachedUser).toHaveBeenCalledWith({ name: 'Nome Confirmado' });
    expect(component.editingDisplayName).toBeFalse();
  });

  it('keeps the prior display name when saving fails', () => {
    service.updateDisplayName.and.returnValue(throwError(() => new Error('offline')));
    component.startDisplayNameEdit(); component.displayNameDraft = 'Outro nome'; component.saveDisplayName();
    expect(component.profile?.displayName).toBe('Luna');
    expect(component.displayNameError).toContain('Não foi possível');
  });

  it('rejects invalid profile image files locally', () => {
    component.onProfileImageSelected({ target: { files: [new File(['x'], 'avatar.gif', { type: 'image/gif' })], value: '' } } as unknown as Event);
    expect(component.profileImageError).toContain('JPEG');
    component.onProfileImageSelected({ target: { files: [new File([new ArrayBuffer(5 * 1024 * 1024 + 1)], 'avatar.png', { type: 'image/png' })], value: '' } } as unknown as Event);
    expect(component.profileImageError).toContain('5 MB');
    expect(service.uploadProfileImage).not.toHaveBeenCalled();
  });

  it('starts Discord verification from the authenticated website profile', () => {
    userService.beginDiscordLink.and.returnValue(of({ ticket: 'ticket-123' }));
    component.startDiscordLink();
    expect(userService.beginDiscordLink).toHaveBeenCalledTimes(1);
    expect(userService.openDiscordLinkOAuth).toHaveBeenCalledWith('ticket-123');
    expect(fixture.nativeElement.textContent).toContain('Conectar Discord');
  });

  it('requires explicit confirmation after seeing the verified Discord identity', () => {
    component.discordLinkTicket = 'ticket-123';
    component.discordLinkPreview = { discordUsername: 'Furry', hasExistingHistory: false,
      status: 'CONNECT_READY', nextActions: ['CONFIRM_LINK'], consolidationPlan: null,
      notice: 'Discord disponível para conectar' };
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Furry');
    expect(fixture.nativeElement.textContent).toContain('Conectar Discord');
    expect(userService.confirmDiscordLink).not.toHaveBeenCalled();

    userService.confirmDiscordLink.and.returnValue(of({
      status: 'CONNECTED', notice: 'Conta vinculada'
    }));
    component.confirmDiscordLink();
    expect(userService.confirmDiscordLink).toHaveBeenCalledOnceWith('ticket-123');
    expect(component.discordLinkPreview).toBeNull();
    expect(component.discordLinkTicket).toBe('');
    expect(component.discordLinkSuccess).toContain('Discord conectado');
  });

  it('never consumes a proof when the member cancels the review', () => {
    component.discordLinkTicket = 'ticket-123';
    component.discordLinkPreview = { discordUsername: 'Furry', hasExistingHistory: false,
      status: 'CONNECT_READY', nextActions: ['CONFIRM_LINK'], consolidationPlan: null,
      notice: 'Confirme seu Discord' };
    component.cancelDiscordLink();
    expect(component.discordLinkPreview).toBeNull();
    expect(component.discordLinkTicket).toBe('');
    expect(userService.confirmDiscordLink).not.toHaveBeenCalled();
  });

  it('keeps a preview available when confirmation fails', () => {
    component.discordLinkTicket = 'ticket-123';
    component.discordLinkPreview = { discordUsername: 'Furry', hasExistingHistory: false,
      status: 'CONNECT_READY', nextActions: ['CONFIRM_LINK'], consolidationPlan: null,
      notice: 'Confirme seu Discord' };
    userService.confirmDiscordLink.and.returnValue(throwError(() => ({error: {message: 'Conflito de contas'}})));
    component.confirmDiscordLink();
    expect(component.discordLinkPreview).not.toBeNull();
    expect(component.discordLinkError).toContain('Conflito de contas');
    expect(component.discordLinkConfirming).toBeFalse();
  });

  const legacyPreview = () => ({
    discordUsername: 'Furry', hasExistingHistory: true,
    status: 'PRECHECK_REQUIRED' as const, nextActions: ['CHECK_ACCOUNT_CONFLICTS'],
    notice: 'As duas identidades foram comprovadas.',
    consolidationPlan: {
      status: 'AUTO_MERGE_CANDIDATE' as const,
      preferredCanonicalAccount: 'DISCORD_HISTORY_OWNER' as const,
      preservationPolicies: ['PRESERVE_DISCORD_COMMUNITY_IN_PLACE'],
      nextActions: ['VERIFY_CANONICAL_ACCOUNT_AND_TRANSACTION_POLICY']
    }
  });

  it('never shows link-only confirmation for a Discord owned by another account', () => {
    component.discordLinkTicket = 'proof-123';
    component.discordLinkPreview = legacyPreview();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Unificar contas');
    expect(fixture.nativeElement.textContent).not.toContain('Confirmar conexão');
    expect(component.canConsolidateDiscord).toBeTrue();
    component.confirmDiscordLink();
    expect(userService.confirmDiscordLink).not.toHaveBeenCalled();
    expect(userService.consolidateDiscordLink).not.toHaveBeenCalled();
  });

  it('explains that email/password-only accounts do not need Google OAuth', () => {
    component.discordLinkTicket = 'proof-123';
    component.discordLinkPreview = legacyPreview();
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('não precisa vincular o Google');
    expect(content).toContain('e-mail e senha');
    expect(content).toContain('Unificar contas');
  });

  it('explains operational and Community conflicts without enabling an unsafe merge', () => {
    component.discordLinkTicket = 'proof-123';
    component.discordLinkPreview = {
      ...legacyPreview(),
      status: 'RESOLUTION_REQUIRED',
      nextActions: ['TRANSFER_WEBSITE_COMMUNITY_DATA', 'RECONCILE_DOMAIN_DATA'],
      consolidationPlan: {
        status: 'RESOLUTION_REQUIRED',
        preferredCanonicalAccount: 'UNDECIDED',
        preservationPolicies: [],
        nextActions: ['TRANSFER_WEBSITE_COMMUNITY_DATA']
      }
    };
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('vínculos de cada Community');
    expect(text).toContain('não serão descartados nem somados automaticamente');
    expect(component.canConsolidateDiscord).toBeFalse();
    expect(userService.consolidateDiscordLink).not.toHaveBeenCalled();
  });

  it('offers an access recovery explanation instead of requiring Google for a local-only user', () => {
    component.discordLinkTicket = 'proof-123';
    component.discordLinkPreview = {
      ...legacyPreview(),
      status: 'RESOLUTION_REQUIRED',
      nextActions: ['VERIFY_GOOGLE_OR_RECOVER_LOCAL_LOGIN'],
      consolidationPlan: {
        status: 'RESOLUTION_REQUIRED',
        preferredCanonicalAccount: 'UNDECIDED',
        preservationPolicies: [],
        nextActions: ['VERIFY_GOOGLE_OR_RECOVER_LOCAL_LOGIN']
      }
    };
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('pode recuperar o acesso pelo e-mail');
    expect(component.canConsolidateDiscord).toBeFalse();
    expect(userService.consolidateDiscordLink).not.toHaveBeenCalled();
  });

  it('requires a distinct canonical-owner consent before performing an irreversible merge', () => {
    component.discordLinkTicket = 'proof-123';
    component.discordLinkPreview = legacyPreview();
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((item: any) => item.textContent.includes('Unificar contas')) as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.disabled).toBeTrue();
    component.consolidateDiscordAccounts();
    expect(userService.consolidateDiscordLink).not.toHaveBeenCalled();

    component.discordHistoryOwnerConsent = true;
    userService.consolidateDiscordLink.and.returnValue(of({
      status: 'CONSOLIDATED_RELOGIN_REQUIRED', canonicalUserId: 20,
      notice: 'Entre novamente'
    }));
    component.consolidateDiscordAccounts();

    expect(userService.consolidateDiscordLink).toHaveBeenCalledOnceWith('proof-123', true);
    expect(userService.finishAccountConsolidation).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledOnceWith(['/login']);
    expect(component.discordLinkTicket).toBe('');
    expect(component.discordLinkPreview).toBeNull();
  });

  it('keeps the original session and verified proof if consolidation fails', () => {
    component.discordLinkTicket = 'proof-123';
    component.discordLinkPreview = legacyPreview();
    component.discordHistoryOwnerConsent = true;
    userService.consolidateDiscordLink.and.returnValue(
      throwError(() => ({ status: 409, error: { message: 'ACCOUNT_DATA_RECONCILIATION_REQUIRED' } }))
    );
    component.consolidateDiscordAccounts();
    expect(userService.finishAccountConsolidation).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.discordLinkPreview).not.toBeNull();
    expect(component.discordLinkError).toContain('não foi concluída');
  });

  it('does not present automatic merge action when ownership data require review', () => {
    component.discordLinkTicket = 'proof-123';
    component.discordLinkPreview = {
      ...legacyPreview(),
      status: 'REVIEW_REQUIRED',
      consolidationPlan: {
        status: 'REVIEW_REQUIRED', preferredCanonicalAccount: 'UNDECIDED',
        preservationPolicies: [], nextActions: ['REQUEST_IDENTITY_REVIEW']
      }
    };
    fixture.detectChanges();
    expect(component.canConsolidateDiscord).toBeFalse();
    expect(component.discordConflictNeedsReview).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('A unificação automática não está disponível');
    component.consolidateDiscordAccounts();
    component.confirmDiscordLink();
    expect(userService.confirmDiscordLink).not.toHaveBeenCalled();
    expect(userService.consolidateDiscordLink).not.toHaveBeenCalled();
  });

  it('updates the avatar after upload and restores its fallback after deletion', () => {
    const file = new File(['x'], 'avatar.png', { type: 'image/png' });
    service.uploadProfileImage.and.returnValue(of({ userId: 1, profileImageUrl: 'https://cdn.example/avatar.webp' }));
    component.onProfileImageSelected({ target: { files: [file], value: '' } } as unknown as Event);
    expect(component.profile?.profileImageUrl).toContain('avatar.webp');
    expect(userService.updateCachedUser).toHaveBeenCalledWith({ profileImageUrl: 'https://cdn.example/avatar.webp' });
    service.deleteProfileImage.and.returnValue(of({ userId: 1, profileImageUrl: null }));
    component.removeProfileImage();
    expect(component.profile?.profileImageUrl).toBeNull();
    expect(userService.updateCachedUser).toHaveBeenCalledWith({ profileImageUrl: null });
  });
  it('keeps community identities when explaining provider login controls', () => {
    component.socialLogins = [{identityId: 15, provider: 'discord', loginEnabled: true}];
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('não apaga seu vínculo comunitário');
    expect(fixture.nativeElement.textContent).toContain('Discord');
    expect(userService.disableSocialLogin).not.toHaveBeenCalled();
  });

  it('requires local password to disable a provider and clears the revoked session', () => {
    component.socialLogins = [{identityId: 15, provider: 'discord', loginEnabled: true}];
    component.disableSocialLogin(component.socialLogins[0]);
    expect(userService.disableSocialLogin).not.toHaveBeenCalled();
    expect(component.socialLoginsError).toContain('senha');
    component.socialLoginPassword = 'local-password';
    userService.disableSocialLogin.and.returnValue(of({status: 'RELOGIN_REQUIRED'}));
    component.disableSocialLogin(component.socialLogins[0]);
    expect(userService.disableSocialLogin).toHaveBeenCalledOnceWith(15, 'local-password');
    expect(userService.finishSocialLoginSecurityChange).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(component.socialLoginPassword).toBe('');
  });

  it('only re-enables Discord after both OAuth ticket and local password', () => {
    component.socialLogins = [{identityId: 15, provider: 'discord', loginEnabled: false}];
    component.discordLinkTicket = 'fresh-verified-ticket';
    component.socialLoginPassword = 'local-password';
    component.discordLinkPreview = {
      discordUsername: 'Furry', hasExistingHistory: false,
      status: 'CONNECT_READY', nextActions: ['CONFIRM_LINK'], consolidationPlan: null,
      notice: 'Discord comprovado'
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reativar login com Discord');
    expect(fixture.nativeElement.textContent).not.toContain('Desvincular Discord');
    userService.enableDiscordLogin.and.returnValue(of({status: 'RELOGIN_REQUIRED'}));
    component.reenableDiscordLogin();
    expect(userService.enableDiscordLogin).toHaveBeenCalledOnceWith('fresh-verified-ticket', 'local-password');
    expect(userService.confirmDiscordLink).not.toHaveBeenCalled();
    expect(userService.finishSocialLoginSecurityChange).toHaveBeenCalled();
  });

  it('shows an unverified legacy email as unknown rather than importing provider proof', () => {
    userService.getLocalEmailProof.and.returnValue(of({email: 'legacy@example.com', verified: false}));
    const fresh = TestBed.createComponent(PerfilComponent); fresh.detectChanges();
    expect(fresh.nativeElement.textContent).toContain('ainda não tem confirmação local comprovada');
    expect(fresh.componentInstance.localEmailDraft).toBe('legacy@example.com');
    expect(userService.requestLocalEmailProof).not.toHaveBeenCalled();
  });

  it('requests local email verification only after password and clears revoked session', () => {
    component.localEmailProof = {email: 'old@example.com', verified: false};
    component.localEmailDraft = 'new@example.com';
    component.requestLocalEmailProof();
    expect(userService.requestLocalEmailProof).not.toHaveBeenCalled();
    expect(component.localEmailProofError).toContain('senha');
    component.socialLoginPassword = 'local-password';
    userService.requestLocalEmailProof.and.returnValue(of({
      status: 'VERIFICATION_SENT_RELOGIN_REQUIRED'
    }));
    component.requestLocalEmailProof();
    expect(userService.requestLocalEmailProof).toHaveBeenCalledOnceWith('new@example.com', 'local-password');
    expect(userService.finishSocialLoginSecurityChange).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

});
