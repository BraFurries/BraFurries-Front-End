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

  it('should present the foundation date and the expansion milestone', () => {
    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(content).toContain('10 de outubro de 2018');
    expect(content).toContain('2020');
    expect(content).toContain('Facebook');
    expect(content).toContain('Discord');
  });
  it('should offer a way to participate', () => {
    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(content).toContain('Faça parte dessa história');
  });
});
