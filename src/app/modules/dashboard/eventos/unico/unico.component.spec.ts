import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UnicoComponent } from './unico.component';

describe('UnicoComponent', () => {
  let component: UnicoComponent;
  let fixture: ComponentFixture<UnicoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [UnicoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UnicoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
