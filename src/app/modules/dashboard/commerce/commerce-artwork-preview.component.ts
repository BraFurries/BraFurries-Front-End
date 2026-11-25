import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Inject, Input, NgZone, OnChanges, OnDestroy, PLATFORM_ID } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommerceCatalogService } from '../../../core/services/commerce-catalog.service';

@Component({
  selector: 'app-commerce-artwork-preview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-gray-50 sm:h-36 sm:w-36">
      <img *ngIf="url; else placeholder" [src]="url" [alt]="'Prévia de ' + title"
        (error)="imageFailed()" class="h-full w-full object-contain" />
      <ng-template #placeholder>
        <span class="px-2 text-center text-xs text-gray-500">{{ failed ? 'Prévia indisponível' : fileId ? 'Carregando prévia' : 'Sem prévia' }}</span>
      </ng-template>
    </div>
  `
})
export class CommerceArtworkPreviewComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() artworkId!: number;
  @Input() fileId: number | null | undefined;
  @Input() title = '';
  url: string | null = null;
  failed = false;
  private visible = false;
  private destroyed = false;
  private observer?: IntersectionObserver;
  private request?: Subscription;

  constructor(private readonly catalog: CommerceCatalogService,
              private readonly host: ElementRef<HTMLElement>,
              private readonly zone: NgZone,
              @Inject(PLATFORM_ID) private readonly platformId: object) {}

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (typeof IntersectionObserver === 'undefined') {
      this.visible = true;
      // Avoid changing bindings during the initial view check.
      Promise.resolve().then(() => { if (this.visible) this.load(); });
      return;
    }
    this.observer = new IntersectionObserver(entries => {
      if (this.destroyed || !entries.some(entry => entry.isIntersecting)) return;
      this.observer?.disconnect();
      this.zone.run(() => { this.visible = true; this.load(); });
    });
    this.observer.observe(this.host.nativeElement);
  }

  ngOnChanges(): void {
    this.clear();
    if (this.visible) this.load();
  }

  private load(): void {
    if (!this.fileId || this.request || this.url) return;
    this.request = this.catalog.artworkPreview(this.artworkId, this.fileId).subscribe({
      next: blob => {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) {
          this.failed = true;
          return;
        }
        this.url = URL.createObjectURL(blob);
      },
      error: () => this.failed = true
    });
  }

  imageFailed(): void {
    this.clear();
    this.failed = true;
  }

  private clear(): void {
    this.request?.unsubscribe();
    this.request = undefined;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.failed = false;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.visible = false;
    this.observer?.disconnect();
    this.clear();
  }
}
