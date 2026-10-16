import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { CommunityAccess } from '../../../core/services/community-access.service';
import {
  CommunityContextService,
  CommunityContextState
} from '../../../core/services/community-context.service';
import {
  CommunityMemberDetail,
  CommunityMemberSummary,
  CommunityMemberSummaryResponse,
  CommunityMembersService
} from '../../../core/services/community-members.service';
import {
  CommunityMemberNote,
  CommunityMemberNotesService
} from '../../../core/services/community-member-notes.service';
import { MembrosComponent } from './membros.component';

describe('MembrosComponent', () => {
  let context$: BehaviorSubject<CommunityContextState>;
  let context: CommunityContextService;
  let membersService: jasmine.SpyObj<CommunityMembersService>;
  let notesService: jasmine.SpyObj<CommunityMemberNotesService>;
  let component: MembrosComponent;

  const community = {
    communityId: 10,
    name: 'BraFurries',
    ownedByMe: false,
    ownerAssigned: true,
    member: true,
    networks: []
  };
  const access: CommunityAccess = {
    communityId: 10,
    owner: false,
    communityAdmin: false,
    activeMember: true,
    canManageCommunityAdmins: false,
    activeRoleIds: [],
    capabilities: ['MEMBERS_VIEW', 'MEMBER_DETAILS_VIEW'],
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
  const summary: CommunityMemberSummary = {
    userId: 7,
    displayName: 'Fox',
    username: 'fox',
    profileImageUrl: null,
    status: 'active',
    roleIds: [2]
  };
  const detail: CommunityMemberDetail = {
    userId: 7,
    displayName: 'Fox',
    username: 'fox',
    profileImageUrl: null,
    membershipDataState: 'AVAILABLE',
    membershipRecordCount: 1,
    memberSince: '2026-01-01T00:00:00',
    lastJoinDate: '2026-09-30T20:00:00',
    status: 'active',
    approved: true,
    approvedAt: '2026-01-02T00:00:00',
    banned: false,
    present: true,
    leftAt: null,
    vip: false,
    partner: false,
    roleIds: [2]
  };
  const note: CommunityMemberNote = {
    id: 100,
    userId: 7,
    authorUserId: 1,
    authorDisplayName: 'Admin',
    updatedByUserId: 1,
    updatedByDisplayName: 'Admin',
    content: 'Contexto interno',
    createdAt: '2026-10-01T20:00:00',
    updatedAt: '2026-10-01T20:00:00',
    archivedAt: null
  };

  const response = (
    items: CommunityMemberSummary[],
    page = 1
  ): CommunityMemberSummaryResponse => ({
    items,
    pagination: {
      page,
      pageSize: 20,
      totalElements: items.length,
      totalPages: items.length ? 1 : 0
    }
  });

  beforeEach(() => {
    context$ = new BehaviorSubject<CommunityContextState>(state);
    context = {
      state$: context$.asObservable(),
      get snapshot() { return context$.value; }
    } as CommunityContextService;

    membersService = jasmine.createSpyObj('CommunityMembersService', [
      'listCommunity',
      'getCommunityDetail'
    ]);
    notesService = jasmine.createSpyObj('CommunityMemberNotesService', [
      'list',
      'create',
      'update',
      'archive'
    ]);

    membersService.listCommunity.and.returnValue(of(response([])));
    membersService.getCommunityDetail.and.returnValue(of(detail));
    notesService.list.and.returnValue(of([]));
    notesService.create.and.returnValue(of(note));
    notesService.update.and.returnValue(of(note));
    notesService.archive.and.returnValue(of({ ...note, archivedAt: '2026-10-01T21:00:00' }));

    component = new MembrosComponent(context, membersService, notesService);
    component.ngOnInit();
  });

  afterEach(() => component.ngOnDestroy());

  it('loads members from the already-authorized global Community context', () => {
    expect(membersService.listCommunity).toHaveBeenCalledWith(10, 1, 20, '');
  });

  it('switches tenant when the global context changes and clears local member state', () => {
    component.members = [summary];
    component.selectedMember = summary;
    component.selectedMemberDetail = detail;
    component.notes = [note];

    context$.next({
      ...state,
      activeCommunity: { ...community, communityId: 20, name: 'Outra' },
      activeAccess: { ...access, communityId: 20 }
    });

    expect(component.selectedCommunityId).toBe(20);
    expect(component.members).toEqual([]);
    expect(component.selectedMember).toBeUndefined();
    expect(component.notes).toEqual([]);
    expect(membersService.listCommunity).toHaveBeenCalledWith(20, 1, 20, '');
  });

  it('ignores a stale member response after context changes', () => {
    const first = new Subject<CommunityMemberSummaryResponse>();
    const second = new Subject<CommunityMemberSummaryResponse>();
    membersService.listCommunity.calls.reset();
    membersService.listCommunity.and.returnValues(first, second);

    context$.next({ ...state, activeCommunity: { ...community, communityId: 11 }, activeAccess: { ...access, communityId: 11 } });
    context$.next({ ...state, activeCommunity: { ...community, communityId: 12 }, activeAccess: { ...access, communityId: 12 } });

    second.next(response([{ ...summary, displayName: 'Atual' }]));
    first.next(response([{ ...summary, displayName: 'Obsoleto' }]));

    expect(component.members.map(item => item.displayName)).toEqual(['Atual']);
  });

  it('does not open details with MEMBERS_VIEW alone', () => {
    context$.next({
      ...state,
      activeAccess: { ...access, capabilities: ['MEMBERS_VIEW'] }
    });

    component.openMember(summary);

    expect(component.selectedMember).toBeUndefined();
    expect(membersService.getCommunityDetail).not.toHaveBeenCalled();
  });

  it('loads detailed membership with MEMBER_DETAILS_VIEW', () => {
    component.openMember(summary);

    expect(membersService.getCommunityDetail).toHaveBeenCalledWith(10, 7);
    expect(component.selectedMemberDetail).toEqual(detail);
  });

  it('loads notes independently with MEMBER_NOTES_VIEW', () => {
    context$.next({
      ...state,
      activeAccess: {
        ...access,
        capabilities: ['MEMBERS_VIEW', 'MEMBER_NOTES_VIEW']
      }
    });
    notesService.list.and.returnValue(of([note]));

    component.openMember(summary);

    expect(membersService.getCommunityDetail).not.toHaveBeenCalled();
    expect(notesService.list).toHaveBeenCalledWith(10, 7, false);
    expect(component.notes).toEqual([note]);
  });

  it('creates, edits and archives notes only with MEMBER_NOTES_MANAGE', () => {
    context$.next({
      ...state,
      activeAccess: {
        ...access,
        capabilities: ['MEMBERS_VIEW', 'MEMBER_NOTES_VIEW', 'MEMBER_NOTES_MANAGE']
      }
    });
    component.selectedMember = summary;

    component.noteDraft = ' Nova nota ';
    component.saveNote();
    expect(notesService.create).toHaveBeenCalledWith(10, 7, 'Nova nota');

    component.startEditNote(note);
    component.noteDraft = 'Atualizada';
    component.saveNote();
    expect(notesService.update).toHaveBeenCalledWith(10, 7, 100, 'Atualizada');

    component.archiveNote(note);
    expect(notesService.archive).toHaveBeenCalledWith(10, 7, 100);
  });

  it('keeps summary visible when detail loading fails', () => {
    membersService.getCommunityDetail.and.returnValue(
      throwError(() => ({ error: { message: 'Falha no detalhe' } }))
    );

    component.openMember(summary);

    expect(component.selectedMember).toEqual(summary);
    expect(component.selectedMemberDetail).toBeUndefined();
    expect(component.detailErrorMessage).toBe('Falha no detalhe');
  });

  it('labels ambiguous membership without guessing state', () => {
    expect(component.statusLabel({ status: 'ambiguous' })).toBe('Dados ambíguos');
  });
});
