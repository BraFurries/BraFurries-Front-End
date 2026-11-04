import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { SeoService } from '../../../../core/services/seo-service.service';
import { PublicPartnersService } from '../../../../core/services/public-partners.service';
import { HomePageComponent } from './home-page.component';

describe('HomePageComponent', () => {
  let component: HomePageComponent;
  let fixture: ComponentFixture<HomePageComponent>;
  let partnersService: jasmine.SpyObj<PublicPartnersService>;

  beforeEach(async () => {
    partnersService = jasmine.createSpyObj('PublicPartnersService', ['getActive']);
    partnersService.getActive.and.returnValue(of([]));
    await TestBed.configureTestingModule({
      declarations: [HomePageComponent],
      imports: [CommonModule],
      providers: [
        { provide: SeoService, useValue: jasmine.createSpyObj('SeoService', ['updateMetaTags']) },
        { provide: PublicPartnersService, useValue: partnersService }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(HomePageComponent);
    component = fixture.componentInstance;
  });

  it('loads partners from the public API instead of rendering static entries', () => {
    partnersService.getActive.and.returnValue(of([
      { id: 7, name: 'Indie', category: 'discord_server', imageUrl: 'https://cdn.example/indie.png', url: 'https://discord.gg/indie' },
      { id: 8, name: 'Sem link', category: 'community', imageUrl: null, url: null }
    ]));
    fixture.detectChanges();
    const section = fixture.nativeElement.querySelector('#parceiros') as HTMLElement;
    expect(partnersService.getActive).toHaveBeenCalledTimes(1);
    expect(section.textContent).toContain('Indie');
    expect(section.textContent).toContain('Sem link');
    expect(section.querySelector('a[href="https://discord.gg/indie"]')).toBeTruthy();
    expect(section.querySelectorAll('article').length).toBe(2);
    expect(section.querySelectorAll('article a').length).toBe(1);
    expect(section.textContent).not.toContain('NextFur');
  });

  it('keeps an honest empty state when no partner is active', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#parceiros').textContent)
      .toContain('Em breve, novas parcerias');
  });

  it('does not invent fallback partner links on API failure', () => {
    partnersService.getActive.and.returnValue(throwError(() => new Error('network')));
    fixture.detectChanges();
    const section = fixture.nativeElement.querySelector('#parceiros') as HTMLElement;
    expect(component.partnersError).toBeTrue();
    expect(section.textContent).toContain('Não foi possível carregar os parceiros');
    expect(section.querySelectorAll('article')).toHaveSize(0);
  });
});
