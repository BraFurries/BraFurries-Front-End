import { NgModule } from '@angular/core';
import { ServerModule } from '@angular/platform-server';
import { provideServerRouting, RenderMode, ServerRoute } from '@angular/ssr';
import { AppComponent } from './app.component';
import { AppModule } from './app.module';

const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'sobre', renderMode: RenderMode.Prerender },
  { path: 'comunidade', renderMode: RenderMode.Prerender },
  { path: 'coddy', renderMode: RenderMode.Prerender },
  { path: 'coddy/docs', renderMode: RenderMode.Prerender },
  { path: 'tos', renderMode: RenderMode.Prerender },
  { path: 'privacidade', renderMode: RenderMode.Prerender },
  { path: 'regras', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];

@NgModule({
  imports: [AppModule, ServerModule],
  providers: [provideServerRouting(serverRoutes)],
  bootstrap: [AppComponent],
})
export class AppServerModule {}
