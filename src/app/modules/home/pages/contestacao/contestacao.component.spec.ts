import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContestacaoComponent } from './contestacao.component';

describe('ContestacaoComponent', () => {
  let component: ContestacaoComponent;
  let fixture: ComponentFixture<ContestacaoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ContestacaoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ContestacaoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
