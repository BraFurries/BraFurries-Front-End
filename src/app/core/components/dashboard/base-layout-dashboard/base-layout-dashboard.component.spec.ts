import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterModule } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';

import {
  CommunityContextService,
  CommunityContextState
} from '../../../services/community-context.service';
import { UserPermissionsService } from '../../../services/user-permissions.service';
import { UserService } from '../../../services/user.service';
import { User } from '../../../../shared/models/user';
import { BaseLayoutDashboardComponent } from './base-layout-dashboard.component';

@Component({ standalone: false, template: '' })
class TestDashboardPageComponent {}

describe('BaseLayoutDashboardComponent', () => {
  let component: BaseLayoutDashboardComponent;
  let fixture: ComponentFixture<BaseLayoutDashboardComponent>;
  let user$: BehaviorSubject<User | null>;
  let context$: BehaviorSubject<CommunityContextState>;
  let context: jasmine.SpyObj<CommunityContextService>;
  let router: Router;

  const user: User = {
    id: 1,
    name: 'Luna',
    email: 'luna@example.com',
    roles: [],
    permissions: [],
    profileImageUrl: null
  };

  const community = {
    communityId: 1,
    name: 'BraFurries',
    ownedByMe: false,
    ownerAssigned: true,
    member: true,
    networks: [{ type: 'DISCORD', externalId: '123', name: 'BraFurries', active: true }]
  };

  const baseState: CommunityContextState = {
    status: 'ready',
    communities: [community],
    activeCommunity: community,
    activeAccess: {
      communityId: 1,
      owner: false,
      communityAdmin: false,
      activeMember: true,
      canManageCommunityAdmins: false,
      activeRoleIds: [],
      capabilities: [],
      teamScopes: []
    },
    managedDiscordServers: [],
    managedServersAvailable: true,
    errorMessage: ''
  };

  beforeEach(async () => {
    user$ = new BehaviorSubject<User | null>(user);
    context$ = new BehaviorSubject<CommunityContextState>(baseState);
    context = jasmine.createSpyObj<CommunityContextService>(
      'CommunityContextService',
      ['initialize', 'selectCommunity', 'scopedLocation', 'communityImageUrl'],
      { state$: context$.asObservable() }
    );
    context.initialize.and.returnValue(of({ kind: 'ready', state: baseState }));
    context.selectCommunity.and.returnValue(of({ kind: 'ready', state: baseState }));
    context.scopedLocation.and.returnValue(null);
    context.communityImageUrl.and.returnValue(null);

    await TestBed.configureTestingModule({
      declarations: [BaseLayoutDashboardComponent, TestDashboardPageComponent],
      imports: [CommonModule, RouterModule.forRoot([{ path: 'painel/perfil', component: TestDashboardPageComponent }])],
      providers: [
        { provide: UserPermissionsService, useValue: { isAdmin: () => false } },
        { provide: UserService, useValue: { user$: user$.asObservable(), logout: () => of(true) } },
        { provide: CommunityContextService, useValue: context }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(BaseLayoutDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initializes the persisted Community context once for global navigation', () => {
    expect(context.initialize).toHaveBeenCalledWith();
    expect(component.activeCommunity?.communityId).toBe(1);
  });

  it('highlights the active Community row with an explicit current badge and no checkmark', () => {
    context$.next({
      ...baseState,
      communities: [
        community,
        { ...community, communityId: 2, name: 'Outra', networks: [] }
      ]
    });
    component.toggleCommunityMenu();
    fixture.detectChanges();

    const activeRow = fixture.nativeElement.querySelector('button.border-braPurple') as HTMLButtonElement | null;

    expect(activeRow).toBeTruthy();
    expect(activeRow?.textContent).toContain('BraFurries');
    expect(activeRow?.textContent).toContain('Atual');
    expect(activeRow?.textContent).not.toContain('✓');
  });

  it('shows the managed Discord icon as the Community photo when available', () => {
    context.communityImageUrl.and.returnValue('https://cdn.example/community.webp');
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('img[alt="Foto de BraFurries"]') as HTMLImageElement | null;
    expect(image?.src).toContain('https://cdn.example/community.webp');
  });

  it('falls back to the Community initial when the managed Discord icon fails', () => {
    context.communityImageUrl.and.returnValue('https://cdn.example/community.webp');
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('img[alt="Foto de BraFurries"]') as HTMLImageElement | null;
    expect(image).toBeTruthy();

    image!.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(component.communityImageUrl(community)).toBeNull();
    expect(fixture.nativeElement.querySelector('img[alt="Foto de BraFurries"]')).toBeFalsy();
  });

  it('updates the sidebar name reactively without reload', () => {
    user$.next({ ...user, name: 'Luna Nova' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Luna Nova');
  });

  it('shows only capabilities from the active Community', () => {
    context$.next({
      ...baseState,
      communities: [
        community,
        { ...community, communityId: 2, name: 'Outra', networks: [] }
      ],
      activeAccess: {
        ...baseState.activeAccess!,
        capabilities: ['TEAM_VIEW']
      }
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Times');
    expect(text).not.toContain('Membros');
  });

  it('does not leak a capability from another Community into the active sidebar', () => {
    context$.next({
      ...baseState,
      communities: [
        community,
        { ...community, communityId: 2, name: 'Community com membros', networks: [] }
      ],
      activeAccess: {
        ...baseState.activeAccess!,
        capabilities: []
      }
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Membros');
  });

  it('shows Membros for MEMBERS_VIEW and admin areas only for Owner/Admin', () => {
    context$.next({
      ...baseState,
      activeAccess: {
        ...baseState.activeAccess!,
        communityAdmin: true,
        capabilities: ['MEMBERS_VIEW']
      }
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Membros');
    expect(text).toContain('Acessos');
    expect(text).toContain('Atividade');
    expect(text).not.toContain('Times');
  });

  it('keeps Coddy dependent on a managed Discord network, not Community Admin', () => {
    context$.next({
      ...baseState,
      activeAccess: {
        ...baseState.activeAccess!,
        communityAdmin: true
      },
      managedDiscordServers: []
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('🤖 Coddy');

    context$.next({
      ...baseState,
      activeAccess: baseState.activeAccess,
      managedDiscordServers: [
        { guildId: '123', name: 'BraFurries', memberCount: 5500, botOnline: true }
      ]
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('🤖 Coddy');
  });

  it('preserves the current scoped feature when switching Community', () => {
    context.scopedLocation.and.returnValue({ communityId: 1, feature: 'membros' });
    spyOn(router, 'navigate').and.resolveTo(true);

    component.selectCommunity(2);

    expect(router.navigate).toHaveBeenCalledWith(['/painel/comunidades', 2, 'membros']);
    expect(context.selectCommunity).not.toHaveBeenCalled();
  });

  it('changes persisted context directly on a global page', () => {
    context.scopedLocation.and.returnValue(null);

    component.selectCommunity(2);

    expect(context.selectCommunity).toHaveBeenCalledWith(2);
  });

  it('opens and closes the mobile menu explicitly', () => {
    expect(component.isMobileMenuOpen).toBeFalse();

    component.toggleMobileMenu();
    expect(component.isMobileMenuOpen).toBeTrue();

    component.closeMobileMenu();
    expect(component.isMobileMenuOpen).toBeFalse();
  });

  it('closes the mobile menu after successful navigation', async () => {
    component.isMobileMenuOpen = true;

    await router.navigateByUrl('/painel/perfil');
    fixture.detectChanges();

    expect(component.isMobileMenuOpen).toBeFalse();
  });

  it('uses a scrollable mobile-safe sidebar navigation region', () => {
    const sidebar = fixture.nativeElement.querySelector('.dashboard-sidebar') as HTMLElement;
    const nav = fixture.nativeElement.querySelector('.dashboard-nav') as HTMLElement;

    expect(sidebar).toBeTruthy();
    expect(nav).toBeTruthy();
    expect(nav.className).toContain('dashboard-nav');
  });

  it('uses canonical Community management navigation', () => {
    const link = fixture.nativeElement.querySelector('a[href="/painel/comunidades"]');
    expect(link).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/painel/membros"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('a[href="/painel/servidores"]')).toBeFalsy();
  });
});
