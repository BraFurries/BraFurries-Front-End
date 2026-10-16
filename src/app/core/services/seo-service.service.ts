import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private readonly siteUrl = 'https://brafurries.com.br';
  private readonly fallbackImage = `${this.siteUrl}/assets/images/logo-Brafurries/brafurries-sticker.avif`;

  constructor(
    private readonly titleService: Title,
    private readonly metaService: Meta,
    private readonly router: Router,
    @Inject(DOCUMENT) private readonly document: Document
  ) { }

  updateMetaTags(title: string, description: string, options: { image?: string; indexable?: boolean } | string = {}): void {
    const url = this.getCurrentUrl();
    const image = typeof options === 'string' ? options : options.image || this.fallbackImage;
    const indexable = typeof options === 'string' ? !this.isNonIndexableUrl(url) : options.indexable ?? !this.isNonIndexableUrl(url);

    this.titleService.setTitle(title);
    this.metaService.updateTag({ property: 'og:title', content: title });

    this.metaService.updateTag({ name: 'description', content: description });
    this.metaService.updateTag({ property: 'og:description', content: description });

    this.metaService.updateTag({ property: 'og:url', content: url });
    this.metaService.updateTag({ property: 'og:type', content: 'website' });
    this.metaService.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.metaService.updateTag({ name: 'twitter:title', content: title });
    this.metaService.updateTag({ name: 'twitter:description', content: description });
    this.metaService.updateTag({ name: 'twitter:image', content: image });
    this.metaService.updateTag({ name: 'robots', content: indexable ? 'index, follow' : 'noindex, nofollow' });
    this.updateCanonicalUrl(url);

    this.metaService.updateTag({ property: 'og:image', content: image });
  }

  private getCurrentUrl(): string {
    const path = this.router.url.split('#')[0] || '/';
    return `${this.siteUrl}${path}`;
  }

  updateRobotsForPath(path: string): void {
    const isIndexable = !this.isNonIndexableUrl(`${this.siteUrl}${path.split('?')[0].split('#')[0]}`);
    this.metaService.updateTag({ name: 'robots', content: isIndexable ? 'index, follow' : 'noindex, nofollow' });
  }

  private updateCanonicalUrl(url: string): void {
    let canonicalElement = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');

    if (!canonicalElement) {
      canonicalElement = this.document.createElement('link');
      canonicalElement.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonicalElement);
    }

    canonicalElement.setAttribute('href', url);
  }

  private isNonIndexableUrl(url: string): boolean {
    const path = new URL(url).pathname;
    return path === '/login' || path.startsWith('/painel') || path.startsWith('/social-') || path === '/register' || path.startsWith('/forgot-') || path.startsWith('/reset-') || path.startsWith('/confirm-');
  }
}
