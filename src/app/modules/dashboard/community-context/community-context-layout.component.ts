import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';

import {
  CommunityContextService,
  CommunityScopedFeature
} from '../../../core/services/community-context.service';

type ContextViewState = 'loading' | 'ready' | 'denied' | 'unavailable' | 'error';

@Component({
  selector: 'app-community-context-layout',
  standalone: false,
  templateUrl: './community-context-layout.component.html'
})
export class CommunityContextLayoutComponent implements OnInit, OnDestroy {
  viewState: ContextViewState = 'loading';
  countdown = 5;
  featureLabel = '';
  communityName = '';
  errorMessage = '';

  private resolutionSubscription?: Subscription;
  private redirectTimer?: ReturnType<typeof setInterval>;
  private routeSubscription?: Subscription;
  private navigationSubscription?: Subscription;
  private lastResolutionKey = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly context: CommunityContextService
  ) {}

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe(() => this.resolve());
    this.navigationSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => this.resolve());
  }

  ngOnDestroy(): void {
    this.cancelRedirect();
    this.resolutionSubscription?.unsubscribe();
    this.routeSubscription?.unsubscribe();
    this.navigationSubscription?.unsubscribe();
  }

  retry(): void {
    this.lastResolutionKey = '';
    this.resolve(true);
  }

  goNow(): void {
    this.cancelRedirect();
    this.router.navigate(['/painel']);
  }

  private resolve(forceRefresh = false): void {
    const rawCommunityId = this.route.snapshot.paramMap.get('communityId');
    const communityId = Number(rawCommunityId);
    const feature = this.currentFeature();
    const key = `${rawCommunityId ?? ''}:${feature ?? ''}`;

    if (!forceRefresh && key === this.lastResolutionKey) return;
    this.lastResolutionKey = key;

    this.cancelRedirect();
    this.resolutionSubscription?.unsubscribe();
    this.viewState = 'loading';
    this.errorMessage = '';
    this.featureLabel = feature ? this.context.featureLabel(feature) : '';

    if (!Number.isInteger(communityId) || communityId <= 0 || !feature) {
      this.viewState = 'unavailable';
      this.communityName = '';
      this.startRedirect();
      return;
    }

    this.resolutionSubscription = this.context.resolveCommunity(
      communityId,
      forceRefresh
    ).subscribe(result => {
      if (result.kind === 'error') {
        this.viewState = 'error';
        this.errorMessage = result.state.errorMessage;
        return;
      }

      if (result.kind === 'not-visible' || result.kind === 'empty') {
        this.viewState = 'unavailable';
        this.communityName = '';
        this.startRedirect();
        return;
      }

      this.communityName = result.state.activeCommunity?.name ?? '';

      if (result.kind === 'denied') {
        this.viewState = 'denied';
        this.startRedirect();
        return;
      }

      if (feature === 'coddy' && !result.state.managedServersAvailable) {
        this.viewState = 'error';
        this.errorMessage = 'Não foi possível verificar os servidores Discord que você administra.';
        return;
      }

      if (!this.context.canAccessFeature(feature, result.state)) {
        this.viewState = 'denied';
        this.startRedirect();
        return;
      }

      this.viewState = 'ready';
    });
  }

  private currentFeature(): CommunityScopedFeature | null {
    return this.route.firstChild?.snapshot.data['communityFeature'] ?? null;
  }

  private startRedirect(): void {
    this.cancelRedirect();
    this.countdown = 5;
    this.redirectTimer = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) this.goNow();
    }, 1000);
  }

  private cancelRedirect(): void {
    if (this.redirectTimer !== undefined) {
      clearInterval(this.redirectTimer);
      this.redirectTimer = undefined;
    }
  }
}
