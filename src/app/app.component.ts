import { Component } from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SeoService } from './core/services/seo-service.service';
import { StaleChunkRecoveryService } from './core/services/stale-chunk-recovery.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: false,
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'BraFurries - Furries do Brasil';

  constructor(
    router: Router,
    seoService: SeoService,
    staleChunkRecovery: StaleChunkRecoveryService
  ) {
    router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe((event) => {
      seoService.updateRobotsForPath(event.urlAfterRedirects);
    });

    router.events.pipe(filter((event): event is NavigationError => event instanceof NavigationError)).subscribe((event) => {
      staleChunkRecovery.recover(event.error);
    });
  }
}
