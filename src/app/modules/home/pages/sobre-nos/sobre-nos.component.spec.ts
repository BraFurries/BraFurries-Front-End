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

  it('should display a compact thumbnail and preserve the full-resolution photograph in the dialog', () => {
    const root = fixture.nativeElement as HTMLElement;
    const figure = root.querySelector('figure');
    const trigger = figure?.querySelector('button');
    const thumbnail = figure?.querySelector('img');
    const fullImage = root.querySelector('dialog img');

    expect(trigger?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger?.getAttribute('aria-controls')).toBe('meet-photo-dialog');
    expect(thumbnail?.getAttribute('src')).toContain('primeiro-meet-brafurries-2026-preview.webp');
    expect(thumbnail?.getAttribute('alt')).toContain('primeiro meet oficial');
    expect(thumbnail?.getAttribute('loading')).toBe('lazy');
    expect(figure?.querySelector('figcaption')?.textContent).toContain('08/08/2026');
    expect(fullImage?.getAttribute('src')).toContain('primeiro-meet-brafurries-2026-full.webp');
    expect(fullImage?.getAttribute('width')).toBe('2048');
    expect(root.querySelector('dialog')?.getAttribute('aria-modal')).toBe('true');
  });

  it('should open and close the image dialog and restore focus to the thumbnail', () => {
    const root = fixture.nativeElement as HTMLElement;
    const trigger = root.querySelector('figure button') as HTMLButtonElement;
    const dialog = root.querySelector('dialog') as HTMLDialogElement;
    const closeButton = dialog.querySelector('button') as HTMLButtonElement;

    trigger.click();
    expect(dialog.open).toBeTrue();

    closeButton.click();
    expect(dialog.open).toBeFalse();
    expect(document.activeElement).toBe(trigger);
  });

  it('should close the photo on backdrop click and ignore clicks inside its content', () => {
    const root = fixture.nativeElement as HTMLElement;
    const trigger = root.querySelector('figure button') as HTMLButtonElement;
    const dialog = root.querySelector('dialog') as HTMLDialogElement;
    const image = dialog.querySelector('img') as HTMLImageElement;

    trigger.click();
    image.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dialog.open).toBeTrue();

    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dialog.open).toBeFalse();
  });
  it('should offer a way to participate', () => {
    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(content).toContain('Faça parte dessa história');
  });
});
