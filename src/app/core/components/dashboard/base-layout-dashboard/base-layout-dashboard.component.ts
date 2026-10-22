import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import {
  CommunityContextService,
  CommunityContextState,
  CommunityScopedFeature
} from '../../../services/community-context.service';
import { CommunitySummary } from '../../../services/community-access.service';
import { UserPermissionsService } from '../../../services/user-permissions.service';
import { UserService } from '../../../services/user.service';
import { User } from '../../../../shared/models/user';

@Component({
  selector: 'app-base-layout-dashboard',
  standalone: false,
  templateUrl: './base-layout-dashboard.component.html',
  styleUrl: './base-layout-dashboard.component.scss'
})
export class BaseLayoutDashboardComponent implements OnInit, OnDestroy {
  activePath = '';
  showAdminMenu = false;
  currentUser: User | null = null;
  isUserMenuOpen = false;
  isCommunityMenuOpen = false;
  isMobileMenuOpen = false;
  isLoggingOut = false;

  communities: CommunitySummary[] = [];
  activeCommunity: CommunitySummary | null = null;
  contextLoading = true;
  contextError = '';

  showCoddyMenu = false;
  showMembersMenu = false;
  showTeamsMenu = false;
  showRecruitmentMenu = false;
  showCommunityAccessMenu = false;
  showActivityMenu = false;

  private readonly destroy$ = new Subject<void>();
  private readonly failedCommunityImageUrls = new Set<string>();

  @ViewChild('userMenuContainer') userMenuContainer?: ElementRef;
  @ViewChild('communityMenuContainer') communityMenuContainer?: ElementRef;

  constructor(
    private readonly userPermissionsService: UserPermissionsService,
    private readonly userService: UserService,
    private readonly communityContext: CommunityContextService,
    private readonly router: Router
  ) {
    this.activePath = window.location.pathname;
    this.showAdminMenu = this.userPermissionsService.isAdmin();

    this.router.events.pipe(takeUntil(this.destroy$)).subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.activePath = event.urlAfterRedirects;
        this.isMobileMenuOpen = false;
      }
    });
  }

  ngOnInit(): void {
    this.userService.user$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => this.currentUser = user);

    this.communityContext.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => this.applyContext(state));

    const scoped = this.communityContext.scopedLocation(this.router.url);
    if (!scoped) {
      this.communityContext.initialize()
        .pipe(takeUntil(this.destroy$))
        .subscribe();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  userInitial(): string {
    return this.currentUser?.name.trim().charAt(0).toUpperCase() || '?';
  }

  communityInitial(community: CommunitySummary): string {
    return community.name.trim().charAt(0).toUpperCase() || '?';
  }

  communityImageUrl(community: CommunitySummary | null): string | null {
    const imageUrl = this.communityContext.communityImageUrl(community);
    if (!imageUrl || this.failedCommunityImageUrls.has(imageUrl)) return null;
    return imageUrl;
  }

  markCommunityImageFailed(community: CommunitySummary): void {
    const imageUrl = this.communityContext.communityImageUrl(community);
    if (imageUrl) this.failedCommunityImageUrls.add(imageUrl);
  }

  scopedLink(feature: CommunityScopedFeature): any[] {
    if (!this.activeCommunity) return ['/painel'];
    return ['/painel/comunidades', this.activeCommunity.communityId, feature];
  }

  selectCommunity(communityId: number): void {
    if (this.activeCommunity?.communityId === communityId) {
      this.isCommunityMenuOpen = false;
      return;
    }

    const scoped = this.communityContext.scopedLocation(this.router.url);
    this.isCommunityMenuOpen = false;

    if (scoped) {
      this.router.navigate(['/painel/comunidades', communityId, scoped.feature]);
      return;
    }

    this.communityContext.selectCommunity(communityId)
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  manageCommunities(): void {
    this.isCommunityMenuOpen = false;
    this.router.navigate(['/painel/comunidades']);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (
      this.isUserMenuOpen
      && this.userMenuContainer
      && !this.userMenuContainer.nativeElement.contains(target)
    ) {
      this.isUserMenuOpen = false;
    }
    if (
      this.isCommunityMenuOpen
      && this.communityMenuContainer
      && !this.communityMenuContainer.nativeElement.contains(target)
    ) {
      this.isCommunityMenuOpen = false;
    }
  }

  toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
    if (this.isUserMenuOpen) this.isCommunityMenuOpen = false;
  }

  toggleCommunityMenu(): void {
    if (!this.communities.length) return;
    this.isCommunityMenuOpen = !this.isCommunityMenuOpen;
    if (this.isCommunityMenuOpen) this.isUserMenuOpen = false;
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen = false;
  }

  logout(): void {
    this.isUserMenuOpen = false;
    this.isLoggingOut = true;

    setTimeout(() => {
      this.userService.logout().subscribe(() => {
        this.router.navigate(['/']);
      });
    }, 1500);
  }

  private applyContext(state: CommunityContextState): void {
    this.communities = state.communities;
    this.activeCommunity = state.activeCommunity;
    this.contextLoading = state.status === 'idle' || state.status === 'loading';
    this.contextError = state.status === 'error' ? state.errorMessage : '';

    const access = state.activeAccess;
    this.showMembersMenu = access?.capabilities.includes('MEMBERS_VIEW') === true;
    this.showTeamsMenu = access?.capabilities.includes('TEAM_VIEW') === true;
    this.showRecruitmentMenu = this.communityContext.canAccessFeature('recrutamento', state);
    this.showCommunityAccessMenu = access?.owner === true || access?.communityAdmin === true;
    this.showActivityMenu = this.showCommunityAccessMenu;
    this.showCoddyMenu = state.managedServersAvailable && state.managedDiscordServers.length > 0;
  }
}
