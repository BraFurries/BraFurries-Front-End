import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardGuard } from './core/guards/dashboard.guard';
import { authRoutes } from './modules/auth/auth-routing.module';

const guardedAuthRoutes: Routes = authRoutes.map((route) => ({
  ...route,
  canActivate: [DashboardGuard],
  data: { ...route.data, guardMode: 'publicOnly' }
}));

const routes: Routes = [
  // The same invitation URL must work for signed-in artists and new visitors.
  // Never put this route behind the publicOnly auth guard.
  {
    path: 'artist-invite',
    loadComponent: () => import('./modules/auth/artist-invite/artist-invite.component')
      .then(m => m.ArtistInviteComponent)
  },
  ...guardedAuthRoutes,
  { 
    path: 'painel',
    canActivate: [DashboardGuard],
    canLoad: [DashboardGuard],
    data: { guardMode: 'authenticatedOnly' }, 
    loadChildren: () => import('./modules/dashboard/dashboard.module').then(m => m.DashboardModule) },
  { path: '', loadChildren: () => import('./modules/home/home.module').then(m => m.HomeModule) },
  { 
    path: '**', 
    redirectTo: '',
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
      anchorScrolling: 'enabled',
      scrollPositionRestoration: 'enabled'
    })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
