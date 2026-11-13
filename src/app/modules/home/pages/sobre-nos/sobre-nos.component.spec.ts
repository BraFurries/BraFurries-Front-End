import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SeoService } from '../../../../core/services/seo-service.service';

import { SobreNosComponent } from './sobre-nos.component';

describe('SobreNosComponent', () => {
  let component: SobreNosComponent;
  let fixture: ComponentFixture<SobreNosComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SobreNosComponent],
      providers: [{ provide: SeoService, useValue: jasmine.createSpyObj<SeoService>('SeoService', ['updateMetaTags']) }],
      schemas: [NO_ERRORS_SCHEMA]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(SobreNosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should present historic milestones in chronological order', () => {
    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(content).toContain('10 de outubro de 2018');
    expect(content).toContain('20 de agosto de 2020');
    expect(content).toContain('9 de setembro de 2020');
    expect(content).toContain('8 de agosto de 2026');

    const dates = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('time[datetime]')
    ).map(date => date.getAttribute('datetime'));
    expect(dates).toEqual(['2018-10-10', '2020-08-20', '2020-09-09', '2026-08-08']);
  });

  it('should feature an accessible photograph of the first meet', () => {
    const root = fixture.nativeElement as HTMLElement;
    const photograph = root.querySelector('figure img');
    expect(photograph).not.toBeNull();
    expect(photograph?.getAttribute('src')).toContain('primeiro-meet-brafurries-2026.avif');
    expect(photograph?.getAttribute('alt')).toContain('primeiro meet oficial');
    expect(photograph?.getAttribute('loading')).toBe('lazy');
    expect(root.querySelector('figure figcaption')?.textContent).toContain('08/08/2026');
  });
  it('should offer a way to participate', () => {
    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(content).toContain('Faça parte dessa história');
  });
});
