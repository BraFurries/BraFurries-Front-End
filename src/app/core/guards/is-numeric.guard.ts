import { CanMatchFn, Route, UrlSegment } from '@angular/router';

export const isNumericGuard: CanMatchFn = (route: Route, segments: UrlSegment[]) => {
  const id = segments[0]?.path; 
  
  return /^\d+$/.test(id); 
};
