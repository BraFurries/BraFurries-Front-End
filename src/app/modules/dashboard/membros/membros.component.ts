import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';

import { CommunityAccess } from '../../../core/services/community-access.service';
import {
  CommunityContextService,
  CommunityContextState
} from '../../../core/services/community-context.service';
import {
  CommunityMemberDetail,
  CommunityMemberStatus,
  CommunityMemberSummary,
  CommunityMembersPagination,
  CommunityMembersService
} from '../../../core/services/community-members.service';
import {
  CommunityMemberNote,
  CommunityMemberNotesService
} from '../../../core/services/community-member-notes.service';

@Component({
  selector: 'app-membros',
  standalone: false,
  templateUrl: './membros.component.html'
})
export class MembrosComponent implements OnInit, OnDestroy {

  members: CommunityMemberSummary[] = [];
  pagination: CommunityMembersPagination = { page: 1, pageSize: 20, totalElements: 0, totalPages: 0 };
  searchTerm = '';

  loadingMembers = false;
  loadingDetail = false;
  errorMessage = '';
  detailErrorMessage = '';
  selectedMember?: CommunityMemberSummary;
  selectedMemberDetail?: CommunityMemberDetail;

  notes: CommunityMemberNote[] = [];
  loadingNotes = false;
  notesErrorMessage = '';
  includeArchivedNotes = false;
  noteDraft = '';
  editingNoteId: number | null = null;
  noteSaving = false;

  private readonly destroy$ = new Subject<void>();
  private activeCommunityId: number | null = null;
  private membersLoadGeneration = 0;
  private detailLoadGeneration = 0;
  private notesLoadGeneration = 0;

  constructor(
    private readonly communityContext: CommunityContextService,
    private readonly communityMembers: CommunityMembersService,
    private readonly memberNotes: CommunityMemberNotesService
  ) {}

  get selectedCommunityId(): number | null {
    return this.communityContext.snapshot.activeCommunity?.communityId ?? null;
  }

  get selectedAccess(): CommunityAccess | null {
    return this.communityContext.snapshot.activeAccess;
  }

  ngOnInit(): void {
    this.communityContext.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => this.applyCommunityContext(state));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private applyCommunityContext(state: CommunityContextState): void {
    const communityId = state.activeCommunity?.communityId ?? null;
    if (
      state.status !== 'ready'
      || communityId === null
      || !state.activeAccess
      || communityId === this.activeCommunityId
    ) return;

    this.activeCommunityId = communityId;
    this.members = [];
    this.pagination = { page: 1, pageSize: 20, totalElements: 0, totalPages: 0 };
    this.searchTerm = '';
    this.selectedMember = undefined;
    this.selectedMemberDetail = undefined;
    this.detailErrorMessage = '';
    this.detailLoadGeneration++;
    this.resetNotesState();
    this.loadMembers(1);
  }

  search(): void {
    this.loadMembers(1);
  }

  clearSearch(): void {
    if (!this.searchTerm) return;
    this.searchTerm = '';
    this.loadMembers(1);
  }

  goToPage(page: number): void {
    if (page < 1 || (this.pagination.totalPages > 0 && page > this.pagination.totalPages)) return;
    this.loadMembers(page);
  }

  loadMembers(page = this.pagination.page): void {
    if (this.selectedCommunityId == null) return;
    const communityId = this.selectedCommunityId;
    const generation = ++this.membersLoadGeneration;
    this.loadingMembers = true;
    this.errorMessage = '';

    this.communityMembers.listCommunity(
      communityId,
      page,
      this.pagination.pageSize,
      this.searchTerm
    ).subscribe({
      next: response => {
        if (communityId !== this.selectedCommunityId || generation !== this.membersLoadGeneration) return;
        this.members = response.items;
        this.pagination = response.pagination;
        this.loadingMembers = false;
      },
      error: error => {
        if (communityId !== this.selectedCommunityId || generation !== this.membersLoadGeneration) return;
        this.loadingMembers = false;
        this.errorMessage = error?.error?.message || 'Não foi possível carregar os membros da Comunidade.';
      }
    });
  }

  canViewMemberDetails(): boolean {
    return this.selectedAccess?.capabilities.includes('MEMBER_DETAILS_VIEW') === true;
  }

  canViewMemberNotes(): boolean {
    return this.selectedAccess?.capabilities.includes('MEMBER_NOTES_VIEW') === true;
  }

  canManageMemberNotes(): boolean {
    return this.selectedAccess?.capabilities.includes('MEMBER_NOTES_MANAGE') === true;
  }

  canOpenMember(): boolean {
    return this.canViewMemberDetails() || this.canViewMemberNotes();
  }

  openMember(member: CommunityMemberSummary): void {
    if (this.selectedCommunityId == null || !this.canOpenMember()) return;

    const communityId = this.selectedCommunityId;
    this.selectedMember = member;
    this.selectedMemberDetail = undefined;
    this.detailErrorMessage = '';
    this.resetNotesState(false);

    if (this.canViewMemberDetails()) {
      const generation = ++this.detailLoadGeneration;
      this.loadingDetail = true;

      this.communityMembers.getCommunityDetail(communityId, member.userId).subscribe({
        next: detail => {
          if (
            communityId !== this.selectedCommunityId
            || generation !== this.detailLoadGeneration
            || member.userId !== this.selectedMember?.userId
          ) return;
          this.selectedMemberDetail = detail;
          this.loadingDetail = false;
        },
        error: error => {
          if (
            communityId !== this.selectedCommunityId
            || generation !== this.detailLoadGeneration
            || member.userId !== this.selectedMember?.userId
          ) return;
          this.loadingDetail = false;
          this.detailErrorMessage = error?.error?.message || 'Não foi possível carregar os detalhes do membro.';
        }
      });
    } else {
      this.loadingDetail = false;
      this.detailLoadGeneration++;
    }

    if (this.canViewMemberNotes()) {
      this.loadNotes();
    }
  }

  closeMember(): void {
    if (this.noteSaving) return;
    this.detailLoadGeneration++;
    this.selectedMember = undefined;
    this.selectedMemberDetail = undefined;
    this.loadingDetail = false;
    this.detailErrorMessage = '';
    this.resetNotesState();
  }

  loadNotes(): void {
    if (
      this.selectedCommunityId == null
      || !this.selectedMember
      || !this.canViewMemberNotes()
    ) return;

    const communityId = this.selectedCommunityId;
    const userId = this.selectedMember.userId;
    const generation = ++this.notesLoadGeneration;
    this.loadingNotes = true;
    this.notesErrorMessage = '';

    this.memberNotes.list(
      communityId,
      userId,
      this.includeArchivedNotes
    ).subscribe({
      next: notes => {
        if (
          communityId !== this.selectedCommunityId
          || userId !== this.selectedMember?.userId
          || generation !== this.notesLoadGeneration
        ) return;
        this.notes = notes;
        this.loadingNotes = false;
      },
      error: error => {
        if (
          communityId !== this.selectedCommunityId
          || userId !== this.selectedMember?.userId
          || generation !== this.notesLoadGeneration
        ) return;
        this.loadingNotes = false;
        this.notesErrorMessage = error?.error?.message || 'Não foi possível carregar as notas internas.';
      }
    });
  }

  toggleArchivedNotes(): void {
    if (this.noteSaving) return;
    this.includeArchivedNotes = !this.includeArchivedNotes;
    this.loadNotes();
  }

  startNewNote(): void {
    if (!this.canManageMemberNotes() || this.noteSaving) return;
    this.editingNoteId = null;
    this.noteDraft = '';
    this.notesErrorMessage = '';
  }

  startEditNote(note: CommunityMemberNote): void {
    if (!this.canManageMemberNotes() || this.noteSaving || note.archivedAt) return;
    this.editingNoteId = note.id;
    this.noteDraft = note.content;
    this.notesErrorMessage = '';
  }

  cancelNoteEdit(): void {
    if (this.noteSaving) return;
    this.editingNoteId = null;
    this.noteDraft = '';
  }

  saveNote(): void {
    if (
      this.selectedCommunityId == null
      || !this.selectedMember
      || !this.canManageMemberNotes()
      || this.noteSaving
    ) return;

    const content = this.noteDraft.trim();
    if (!content) {
      this.notesErrorMessage = 'Escreva o conteúdo da nota antes de salvar.';
      return;
    }
    if (content.length > 4000) {
      this.notesErrorMessage = 'A nota pode ter no máximo 4000 caracteres.';
      return;
    }

    const communityId = this.selectedCommunityId;
    const userId = this.selectedMember.userId;
    const noteId = this.editingNoteId;
    this.noteSaving = true;
    this.notesErrorMessage = '';

    const request = noteId === null
      ? this.memberNotes.create(communityId, userId, content)
      : this.memberNotes.update(communityId, userId, noteId, content);

    request.subscribe({
      next: () => {
        if (
          communityId !== this.selectedCommunityId
          || userId !== this.selectedMember?.userId
        ) return;
        this.noteSaving = false;
        this.editingNoteId = null;
        this.noteDraft = '';
        this.loadNotes();
      },
      error: error => {
        if (
          communityId !== this.selectedCommunityId
          || userId !== this.selectedMember?.userId
        ) return;
        this.noteSaving = false;
        this.notesErrorMessage = error?.error?.message || 'Não foi possível salvar a nota.';
      }
    });
  }

  archiveNote(note: CommunityMemberNote): void {
    if (
      this.selectedCommunityId == null
      || !this.selectedMember
      || !this.canManageMemberNotes()
      || this.noteSaving
      || note.archivedAt
    ) return;

    const communityId = this.selectedCommunityId;
    const userId = this.selectedMember.userId;
    this.noteSaving = true;
    this.notesErrorMessage = '';

    this.memberNotes.archive(communityId, userId, note.id).subscribe({
      next: () => {
        if (
          communityId !== this.selectedCommunityId
          || userId !== this.selectedMember?.userId
        ) return;
        this.noteSaving = false;
        if (this.editingNoteId === note.id) {
          this.editingNoteId = null;
          this.noteDraft = '';
        }
        this.loadNotes();
      },
      error: error => {
        if (
          communityId !== this.selectedCommunityId
          || userId !== this.selectedMember?.userId
        ) return;
        this.noteSaving = false;
        this.notesErrorMessage = error?.error?.message || 'Não foi possível arquivar a nota.';
      }
    });
  }

  private resetNotesState(incrementGeneration = true): void {
    if (incrementGeneration) this.notesLoadGeneration++;
    this.notes = [];
    this.loadingNotes = false;
    this.notesErrorMessage = '';
    this.includeArchivedNotes = false;
    this.noteDraft = '';
    this.editingNoteId = null;
    this.noteSaving = false;
  }

  statusLabel(member: { status: CommunityMemberStatus }): string {
    switch (member.status) {
      case 'active': return 'Presente';
      case 'left': return 'Ausente';
      case 'banned': return 'Banido';
      case 'pending': return 'Pendente';
      case 'ambiguous': return 'Dados ambíguos';
      default: return 'Estado desconhecido';
    }
  }

  memberInitial(member: { displayName: string; username: string | null }): string {
    return (member.displayName || member.username || '?').trim().charAt(0).toUpperCase() || '?';
  }
}
