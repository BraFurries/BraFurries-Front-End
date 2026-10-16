import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
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
    userService = jasmine.createSpyObj<UserService>('UserService', ['updateCachedUser']);
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
      { provide: MemberProfileService, useValue: service }, { provide: CommunityAccessService, useValue: communityAccessService }, { provide: UserService, useValue: userService }, { provide: SeoService, useValue: { updateMetaTags: jasmine.createSpy() } }
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
});
