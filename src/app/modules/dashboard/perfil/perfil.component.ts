import { Component, OnDestroy, OnInit } from '@angular/core';
import { EMPTY, Observable, Subject, catchError, forkJoin, map, of, switchMap, takeUntil, tap } from 'rxjs';
import { CommunityAccess, CommunityAccessService } from '../../../core/services/community-access.service';
import { MemberProfileService } from '../../../core/services/member-profile.service';
import { UserService } from '../../../core/services/user.service';
import { SeoService } from '../../../core/services/seo-service.service';
import { MemberCommunityContextResponse, MemberCommunitySummary, MemberModerationPage, MemberProfileResponse } from '../../../shared/models/api/member-profile/member-profile';

const BRAFURRIES_MAIN_GUILD_ID = '753321055682035712';

@Component({ selector: 'app-perfil', standalone: false, templateUrl: './perfil.component.html', styleUrl: './perfil.component.scss' })
export class PerfilComponent implements OnInit, OnDestroy {
  profile: MemberProfileResponse | null = null;
  context: MemberCommunityContextResponse | null = null;
  moderationPage: MemberModerationPage | null = null;
  selectedCommunityId: number | null = null;
  profileLoading = true;
  contextLoading = false;
  moderationLoading = false;
  profileError = '';
  contextError = '';
  moderationError = '';
  displayNameError = '';
  profileImageError = '';
  editingDisplayName = false;
  displayNameDraft = '';
  displayNameSaving = false;
  profileImageUploading = false;
  profileImageDeleting = false;
  readonly moderationPageSize = 10;
  private readonly destroy$ = new Subject<void>();
  private readonly communitySelection$ = new Subject<number>();
  private readonly moderationRequest$ = new Subject<{ communityId: number; page: number }>();

  constructor(
    private readonly memberProfileService: MemberProfileService,
    private readonly communityAccessService: CommunityAccessService,
    private readonly userService: UserService,
    private readonly seoService: SeoService
  ) {}

  ngOnInit(): void {
    this.seoService.updateMetaTags('Perfil - BraFurries', 'Acesse seus dados de perfil e sua participação nas comunidades BraFurries.');
    this.communitySelection$.pipe(
      tap(() => { this.contextLoading = true; this.contextError = ''; this.context = null; this.moderationPage = null; this.moderationError = ''; }),
      switchMap((communityId) => this.memberProfileService.getCommunityContext(communityId).pipe(
        tap(() => this.loadModeration(communityId, 1)),
        catchError(() => { this.contextError = 'Não foi possível carregar os dados desta comunidade.'; this.contextLoading = false; return EMPTY; })
      )),
      takeUntil(this.destroy$)
    ).subscribe({ next: (context) => { this.context = context; this.contextLoading = false; } });

    this.moderationRequest$.pipe(
      tap(() => { this.moderationLoading = true; this.moderationError = ''; }),
      switchMap(({ communityId, page }) => this.memberProfileService.getModeration(communityId, page, this.moderationPageSize).pipe(
        map((moderationPage) => ({ communityId, moderationPage })),
        catchError(() => { this.moderationError = 'Não foi possível carregar o histórico de moderação.'; this.moderationLoading = false; return EMPTY; })
      )),
      takeUntil(this.destroy$)
    ).subscribe({ next: ({ communityId, moderationPage }) => {
      if (this.selectedCommunityId === communityId) this.moderationPage = moderationPage;
      this.moderationLoading = false;
    } });
    this.loadProfile();
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  selectCommunity(communityId: number): void {
    if (this.selectedCommunityId === communityId && this.context) return;
    this.selectedCommunityId = communityId;
    this.communitySelection$.next(communityId);
  }

  loadModeration(communityId: number, page: number): void {
    if (this.selectedCommunityId === communityId) this.moderationRequest$.next({ communityId, page });
  }

  previousModerationPage(): void {
    if (this.selectedCommunityId && this.moderationPage && this.moderationPage.page > 1) this.loadModeration(this.selectedCommunityId, this.moderationPage.page - 1);
  }

  nextModerationPage(): void {
    if (this.selectedCommunityId && this.moderationPage && this.moderationPage.page < this.moderationPage.totalPages) this.loadModeration(this.selectedCommunityId, this.moderationPage.page + 1);
  }

  accountLabel(account: { username: string | null; displayName: string | null }): string | null {
    return account.username?.trim() || account.displayName?.trim() || null;
  }

  profileInitial(): string {
    const value = this.profile?.displayName || this.profile?.username || '?';
    return value.trim().charAt(0).toUpperCase() || '?';
  }

  startDisplayNameEdit(): void {
    if (!this.profile || this.displayNameSaving) return;
    this.displayNameDraft = this.profile.displayName || '';
    this.displayNameError = '';
    this.editingDisplayName = true;
  }

  cancelDisplayNameEdit(): void {
    if (this.displayNameSaving) return;
    this.editingDisplayName = false;
    this.displayNameDraft = this.profile?.displayName || '';
    this.displayNameError = '';
  }

  saveDisplayName(): void {
    if (!this.profile || this.displayNameSaving) return;
    const displayName = this.displayNameDraft.trim();
    if (!displayName) { this.displayNameError = 'Informe um nome de exibição.'; return; }
    if (displayName.length > 32) { this.displayNameError = 'O nome de exibição deve ter no máximo 32 caracteres.'; return; }

    this.displayNameSaving = true;
    this.displayNameError = '';
    this.memberProfileService.updateDisplayName(displayName).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (this.profile) this.profile = { ...this.profile, displayName: response.displayName };
        this.userService.updateCachedUser({ name: response.displayName });
        this.displayNameDraft = response.displayName;
        this.editingDisplayName = false;
        this.displayNameSaving = false;
      },
      error: () => { this.displayNameError = 'Não foi possível atualizar seu nome de exibição.'; this.displayNameSaving = false; }
    });
  }

  onProfileImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.profileImageUploading || this.profileImageDeleting) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { this.profileImageError = 'Escolha uma imagem JPEG, PNG ou WebP.'; return; }
    if (file.size > 5 * 1024 * 1024) { this.profileImageError = 'A foto deve ter no máximo 5 MB.'; return; }

    this.profileImageUploading = true;
    this.profileImageError = '';
    this.memberProfileService.uploadProfileImage(file).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (this.profile) this.profile = { ...this.profile, profileImageUrl: response.profileImageUrl };
        this.userService.updateCachedUser({ profileImageUrl: response.profileImageUrl });
        this.profileImageUploading = false;
      },
      error: () => { this.profileImageError = 'Não foi possível atualizar sua foto de perfil.'; this.profileImageUploading = false; }
    });
  }

  removeProfileImage(): void {
    if (!this.profile || this.profileImageUploading || this.profileImageDeleting) return;
    this.profileImageDeleting = true;
    this.profileImageError = '';
    this.memberProfileService.deleteProfileImage().pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (this.profile) this.profile = { ...this.profile, profileImageUrl: response.profileImageUrl };
        this.userService.updateCachedUser({ profileImageUrl: response.profileImageUrl });
        this.profileImageDeleting = false;
      },
      error: () => { this.profileImageError = 'Não foi possível remover sua foto de perfil.'; this.profileImageDeleting = false; }
    });
  }

  private orderCommunities(profile: MemberProfileResponse): Observable<MemberProfileResponse> {
    if (!profile.communities.length) return of(profile);

    return forkJoin(profile.communities.map((community, index) =>
      this.communityAccessService.getAccess(community.communityId).pipe(
        map((access) => ({ community, index, access })),
        catchError(() => of({ community, index, access: null as CommunityAccess | null }))
      )
    )).pipe(
      map((items) => ({
        ...profile,
        communities: items
          .sort((left, right) =>
            this.communityPriority(left.community, left.access) -
              this.communityPriority(right.community, right.access) ||
            left.index - right.index
          )
          .map(({ community }) => community)
      }))
    );
  }

  private communityPriority(community: MemberCommunitySummary, access: CommunityAccess | null): number {
    if (community.guildId === BRAFURRIES_MAIN_GUILD_ID) return 0;
    if (access?.owner) return 1;
    if (access?.communityAdmin) return 2;
    return 3;
  }

  private loadProfile(): void {
    this.profileLoading = true;
    this.profileError = '';
    this.memberProfileService.getProfile().pipe(
      switchMap((profile) => this.orderCommunities(profile)),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (profile) => {
        this.profile = profile;
        this.profileLoading = false;
        if (profile.communities.length > 0) this.selectCommunity(profile.communities[0].communityId);
      },
      error: () => { this.profileError = 'Não foi possível carregar seu perfil agora.'; this.profileLoading = false; }
    });
  }
}
