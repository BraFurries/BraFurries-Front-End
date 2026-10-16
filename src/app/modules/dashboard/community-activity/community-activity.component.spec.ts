import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import {
  CommunityContextService,
  CommunityContextState
} from '../../../core/services/community-context.service';
import {
  CommunityActivityDetails,
  CommunityActivityEvent,
  CommunityActivityPage,
  CommunityActivityService
} from '../../../core/services/community-activity.service';
import { CommunityActivityComponent } from './community-activity.component';

describe('CommunityActivityComponent', () => {
  let component: CommunityActivityComponent;
  let fixture: ComponentFixture<CommunityActivityComponent>;
  let context$: BehaviorSubject<CommunityContextState>;
  let activityService: jasmine.SpyObj<CommunityActivityService>;

  const community = {
    communityId: 1,
    name: 'BraFurries',
    ownedByMe: true,
    ownerAssigned: true,
    member: true,
    networks: []
  };
  const access = {
    communityId: 1,
    owner: true,
    communityAdmin: false,
    activeMember: true,
    canManageCommunityAdmins: true,
    activeRoleIds: [],
    capabilities: [],
    teamScopes: []
  };
  const state: CommunityContextState = {
    status: 'ready',
    communities: [community],
    activeCommunity: community,
    activeAccess: access,
    managedDiscordServers: [],
    managedServersAvailable: true,
    errorMessage: ''
  };

  const firstEvent = event({
    id: 10,
    action: 'TEAM_MEMBER_ASSIGNED',
    category: 'TEAM',
    actorName: 'Magia',
    details: {
      roleId: 3,
      roleName: 'Eventos',
      userId: 7,
      userDisplayName: 'Ninsei'
    }
  });

  beforeEach(async () => {
    context$ = new BehaviorSubject<CommunityContextState>(state);
    const context = {
      state$: context$.asObservable(),
      get snapshot() { return context$.value; }
    };

    activityService = jasmine.createSpyObj('CommunityActivityService', ['list', 'actors']);
    activityService.actors.and.returnValue(of([
      { userId: 4, displayName: 'Magia', avatarUrl: null }
    ]));
    activityService.list.and.returnValue(of({
      items: [firstEvent],
      nextCursor: null,
      hasMore: false
    } satisfies CommunityActivityPage));

    await TestBed.configureTestingModule({
      declarations: [CommunityActivityComponent],
      imports: [CommonModule, FormsModule],
      providers: [
        { provide: CommunityContextService, useValue: context },
        { provide: CommunityActivityService, useValue: activityService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CommunityActivityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads activity only for the active Community context', () => {
    expect(component.selectedCommunityId).toBe(1);
    expect(activityService.list).toHaveBeenCalledWith(1, jasmine.objectContaining({ limit: 30 }));
    expect(activityService.actors).toHaveBeenCalledWith(1);
  });

  it('resets filters and stale data when Community context changes', () => {
    component.category = 'NOTES';
    component.events = [firstEvent];

    context$.next({
      ...state,
      activeCommunity: { ...community, communityId: 2, name: 'Outra' },
      activeAccess: { ...access, communityId: 2 }
    });

    expect(component.selectedCommunityId).toBe(2);
    expect(component.category).toBe('');
    expect(activityService.list).toHaveBeenCalledWith(2, jasmine.objectContaining({ cursor: null }));
  });

  it('maps known events to friendly copy', () => {
    expect(component.eventText(firstEvent))
      .toBe('Magia adicionou Ninsei ao cargo Eventos');
    expect(component.isUnknown(firstEvent)).toBeFalse();
  });

  it('falls back safely for future actions', () => {
    const unknown = event({
      id: 11,
      action: 'SOME_FUTURE_TEAM_ACTION',
      category: 'TEAM',
      actorName: 'Magia'
    });

    expect(component.eventText(unknown)).toBe('Foi registrada uma atividade administrativa');
    expect(component.isUnknown(unknown)).toBeTrue();
  });

  it('sends filters with an explicit Community id and resets pagination', () => {
    component.category = 'ACCESS';
    component.actorUserId = 4;
    component.fromDate = '2026-10-01';
    component.toDate = '2026-10-04';

    component.applyFilters();

    expect(activityService.list).toHaveBeenCalledWith(1, {
      category: 'ACCESS',
      actorUserId: 4,
      from: '2026-10-01T00:00:00',
      to: '2026-10-04T23:59:59.999999',
      cursor: null,
      limit: 30
    });
  });

  it('appends cursor pagination instead of replacing the timeline', () => {
    activityService.list.calls.reset();
    activityService.list.and.returnValues(
      of({ items: [firstEvent], nextCursor: 'next', hasMore: true }),
      of({
        items: [event({ id: 9, action: 'TEAM_ROLE_CREATED', category: 'TEAM', actorName: 'Titio' })],
        nextCursor: null,
        hasMore: false
      })
    );

    component.applyFilters();
    component.loadMore();

    expect(component.events.map(item => item.id)).toEqual([10, 9]);
    expect(activityService.list.calls.mostRecent().args[1]?.cursor).toBe('next');
  });

  it('ignores an older response after the Community changes', () => {
    const old = new Subject<CommunityActivityPage>();
    activityService.list.calls.reset();
    activityService.list.and.callFake((communityId: number) =>
      communityId === 1
        ? old.asObservable()
        : of({ items: [], nextCursor: null, hasMore: false })
    );

    component.applyFilters();
    context$.next({
      ...state,
      activeCommunity: { ...community, communityId: 2 },
      activeAccess: { ...access, communityId: 2 }
    });
    old.next({ items: [firstEvent], nextCursor: null, hasMore: false });

    expect(component.selectedCommunityId).toBe(2);
    expect(component.events).toEqual([]);
  });

  it('shows data-loading errors without converting them into access denial', () => {
    activityService.list.and.returnValue(
      throwError(() => ({ error: { message: 'Serviço indisponível' } }))
    );

    component.applyFilters();

    expect(component.errorMessage).toBe('Serviço indisponível');
  });
});

function event(input: {
  id: number;
  action: string;
  category: CommunityActivityEvent['category'];
  actorName: string | null;
  details?: Partial<CommunityActivityDetails>;
  targetDisplayName?: string | null;
}): CommunityActivityEvent {
  const details: CommunityActivityDetails = {
    capability: null,
    active: null,
    roleId: null,
    roleName: null,
    userId: null,
    userDisplayName: null,
    memberUserId: null,
    memberDisplayName: null,
    parentRoleId: null,
    parentRoleName: null,
    roleIds: null,
    roleNames: null,
    source: null,
    ...input.details
  };

  return {
    id: input.id,
    action: input.action,
    category: input.category,
    actor: input.actorName === null ? null : {
      userId: 4,
      displayName: input.actorName,
      avatarUrl: null
    },
    target: input.targetDisplayName ? {
      type: 'community',
      id: '1',
      displayName: input.targetDisplayName
    } : null,
    details,
    systemGenerated: input.actorName === null,
    createdAt: '2026-10-04T12:00:00'
  };
}
