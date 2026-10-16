import { NO_ERRORS_SCHEMA } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, NavigationEnd, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';

import {
  CommunityContextResolution,
  CommunityContextService,
  CommunityContextState
} from '../../../core/services/community-context.service';
import { CommunityContextLayoutComponent } from './community-context-layout.component';

describe('CommunityContextLayoutComponent', () => {
  let routeParams: BehaviorSubject<any>;
  let routerEvents: Subject<any>;
  let router: jasmine.SpyObj<Router>;
  let context: jasmine.SpyObj<CommunityContextService>;
  let activatedRoute: any;

  const state: CommunityContextState = {
    status: 'ready',
    communities: [],
    activeCommunity: {
      communityId: 1,
      name: 'BraFurries',
      ownedByMe: true,
      ownerAssigned: true,
      member: true,
      networks: []
    },
    activeAccess: {
      communityId: 1,
      owner: false,
      communityAdmin: false,
      activeMember: true,
      canManageCommunityAdmins: false,
      activeRoleIds: [],
      capabilities: ['MEMBERS_VIEW'],
      teamScopes: []
    },
    managedDiscordServers: [],
    managedServersAvailable: true,
    errorMessage: ''
  };

  beforeEach(async () => {
    routeParams = new BehaviorSubject(convertToParamMap({ communityId: '1' }));
    routerEvents = new Subject();
    router = jasmine.createSpyObj<Router>('Router', ['navigate'], {
      events: routerEvents.asObservable()
    });
    router.navigate.and.resolveTo(true);

    context = jasmine.createSpyObj<CommunityContextService>(
      'CommunityContextService',
      ['resolveCommunity', 'canAccessFeature', 'featureLabel']
    );
    context.resolveCommunity.and.returnValue(
      of({ kind: 'ready', state } as CommunityContextResolution)
    );
    context.canAccessFeature.and.returnValue(true);
    context.featureLabel.and.returnValue('Membros');

    activatedRoute = {
      paramMap: routeParams.asObservable(),
      snapshot: { paramMap: routeParams.value },
      firstChild: { snapshot: { data: { communityFeature: 'membros' } } }
    };

    await TestBed.configureTestingModule({
      declarations: [CommunityContextLayoutComponent],
      providers: [
        { provide: ActivatedRoute, useValue: activatedRoute },
        { provide: Router, useValue: router },
        { provide: CommunityContextService, useValue: context }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
  });

  it('allows the child outlet only after Community and feature access resolve', () => {
    const fixture = TestBed.createComponent(CommunityContextLayoutComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.viewState).toBe('ready');
    expect(context.resolveCommunity).toHaveBeenCalledWith(1, false);
  });

  it('shows a five-second denied countdown and redirects to dashboard', fakeAsync(() => {
    context.canAccessFeature.and.returnValue(false);
    const fixture = TestBed.createComponent(CommunityContextLayoutComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.viewState).toBe('denied');
    expect(fixture.componentInstance.countdown).toBe(5);

    tick(5000);

    expect(router.navigate).toHaveBeenCalledWith(['/painel']);
    fixture.destroy();
  }));

  it('redirects immediately when Ir agora is used', () => {
    context.canAccessFeature.and.returnValue(false);
    const fixture = TestBed.createComponent(CommunityContextLayoutComponent);
    fixture.detectChanges();

    fixture.componentInstance.goNow();

    expect(router.navigate).toHaveBeenCalledWith(['/painel']);
  });

  it('cancels a denied redirect when another Community becomes allowed', fakeAsync(() => {
    context.canAccessFeature.and.returnValues(false, true);
    const fixture = TestBed.createComponent(CommunityContextLayoutComponent);
    fixture.detectChanges();

    tick(2000);
    activatedRoute.snapshot.paramMap = convertToParamMap({ communityId: '2' });
    routeParams.next(activatedRoute.snapshot.paramMap);
    fixture.detectChanges();

    expect(fixture.componentInstance.viewState).toBe('ready');

    tick(5000);
    expect(router.navigate).not.toHaveBeenCalled();
    fixture.destroy();
  }));

  it('destroys the countdown timer with the layout', fakeAsync(() => {
    context.canAccessFeature.and.returnValue(false);
    const fixture = TestBed.createComponent(CommunityContextLayoutComponent);
    fixture.detectChanges();

    fixture.destroy();
    tick(5000);

    expect(router.navigate).not.toHaveBeenCalled();
  }));

  it('does not expose a name for a Community absent from the visible list', () => {
    context.resolveCommunity.and.returnValue(of({
      kind: 'not-visible',
      state: { ...state, activeCommunity: null, activeAccess: null }
    } as CommunityContextResolution));

    const fixture = TestBed.createComponent(CommunityContextLayoutComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.viewState).toBe('unavailable');
    expect(fixture.componentInstance.communityName).toBe('');
  });

  it('distinguishes managed-server lookup failure from denied Coddy access', () => {
    activatedRoute.firstChild.snapshot.data = { communityFeature: 'coddy' };
    context.featureLabel.and.returnValue('Coddy');
    context.resolveCommunity.and.returnValue(of({
      kind: 'ready',
      state: { ...state, managedServersAvailable: false }
    } as CommunityContextResolution));

    const fixture = TestBed.createComponent(CommunityContextLayoutComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.viewState).toBe('error');
    expect(fixture.componentInstance.errorMessage).toContain('servidores Discord');
  });

  it('re-evaluates the feature when the child route changes', () => {
    const fixture = TestBed.createComponent(CommunityContextLayoutComponent);
    fixture.detectChanges();

    activatedRoute.firstChild.snapshot.data = { communityFeature: 'times' };
    context.featureLabel.and.returnValue('Times');
    routerEvents.next(new NavigationEnd(1, '/a', '/b'));
    fixture.detectChanges();

    expect(context.resolveCommunity).toHaveBeenCalledTimes(2);
  });
});
