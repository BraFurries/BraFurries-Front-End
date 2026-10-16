import { TestBed } from '@angular/core/testing';
import { CanMatchFn } from '@angular/router';

import { isNumericGuard } from './is-numeric.guard';

describe('isNumericGuard', () => {
  const executeGuard: CanMatchFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => isNumericGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
