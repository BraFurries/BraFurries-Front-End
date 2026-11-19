import { CdkDragEnd, CdkDragMove } from '@angular/cdk/drag-drop';
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { CreatorCalendarItem, CreatorCalendarPage, CreatorStudioService } from '../../../core/services/creator-studio.service';
import { UserService } from '../../../core/services/user.service';
import { User } from '../../../shared/models/user';
import { CreatorCalendarComponent } from './creator-calendar.component';

describe('CreatorCalendarComponent',()=>{
  let fixture:ComponentFixture<CreatorCalendarComponent>;
  let component:CreatorCalendarComponent;
  let studio:jasmine.SpyObj<CreatorStudioService>;
  let users$:BehaviorSubject<User|null>;
  const user:User={id:71,name:'Artist',email:'artist@example.invalid',roles:[],permissions:[],profileImageUrl:null};
  const step:CreatorCalendarItem={kind:'STEP',commissionId:80,stepId:81,title:'Ref sheet',
    clientName:'Client',stepName:'Rascunho',commissionStatus:'PAUSED',stepStatus:'PENDING',date:null};
  const delivery:CreatorCalendarItem={...step,kind:'DELIVERY',stepId:null,stepName:null,stepStatus:null,date:'2026-11-20'};
  const done:CreatorCalendarItem={...step,stepId:82,stepStatus:'DONE',date:'2026-11-21'};

  beforeEach(async()=>{
    users$=new BehaviorSubject<User|null>(user);
    studio=jasmine.createSpyObj<CreatorStudioService>('CreatorStudioService',
      ['calendar','unplannedCalendar','commissionPlanning','setPlanningDate']);
    studio.calendar.and.returnValue(of({items:[delivery,done],hasMore:false}));
    studio.unplannedCalendar.and.returnValue(of({items:[step],hasMore:false}));
    studio.commissionPlanning.and.returnValue(of([step,done]));
    studio.setPlanningDate.and.returnValue(of(undefined));
    await TestBed.configureTestingModule({
      imports:[CreatorCalendarComponent,RouterModule.forRoot([])],
      providers:[{provide:CreatorStudioService,useValue:studio},
        {provide:UserService,useValue:{user$:users$.asObservable(),getUser:()=>users$.value}}]
    }).compileComponents();
    fixture=TestBed.createComponent(CreatorCalendarComponent);
    component=fixture.componentInstance;
    fixture.detectChanges();
    component.month='2026-11-01';component.selectedDay='2026-11-19';component.reload();
    fixture.detectChanges();
  });

  afterEach(()=>{fixture.destroy();users$.complete();});

  it('uses 42 civil dates with correct weekdays, separate delivery and per-order colors',()=>{
    expect(component.days.length).toBe(42);
    expect(component.days[0].date).toBe('2026-11-01');
    expect(component.days[41].date).toBe('2026-12-12');
    expect(studio.calendar).toHaveBeenCalledWith('2026-11-01','2026-12-12',1,100);
    expect(component.groups[0].items).toEqual([step]);
    expect(component.color(step)).toBe(component.color(done));
    expect(component.color(delivery)).not.toBe(component.color(step));
    expect(component.movable(delivery)).toBeFalse();
    expect(component.movable(done)).toBeFalse();
    expect(component.movable(step)).toBeTrue();
    expect(component.days.find(day=>day.date==='2026-11-20')?.items).toEqual([delivery]);
    component.setFilter('PRODUCTION');
    expect(component.days.find(day=>day.date==='2026-11-20')?.items).toEqual([]);
    component.setFilter('DELIVERY');
    expect(component.movable(step)).toBeFalse();
  });

  it('updates only the individual planned date after a valid drag, not during movement',()=>{
    const zones=Array.from(fixture.nativeElement.querySelectorAll('[data-calendar-date]')) as HTMLElement[];
    for(const zone of zones){
      const target=zone.dataset['calendarDate']==='2026-11-19';
      spyOn(zone,'getBoundingClientRect').and.returnValue({
        left:target?100:-1000,right:target?160:-950,top:100,bottom:160,width:60,height:60
      } as DOMRect);
    }
    component.dragStart(step);
    const event={source:{data:step},event:{clientX:120,clientY:120}};
    component.dragMove(event as unknown as CdkDragMove<CreatorCalendarItem>);
    expect(component.hoveredDate).toBe('2026-11-19');
    expect(studio.setPlanningDate).not.toHaveBeenCalled();
    component.dragEnd(event as unknown as CdkDragEnd<CreatorCalendarItem>,step);
    expect(studio.setPlanningDate).toHaveBeenCalledOnceWith(80,81,'2026-11-19');
    expect(component.draggedKey).toBeNull();
  });

  it('supports detail editing, explicit clearing and historical read-only stages',()=>{
    fixture.componentRef.setInput('commissionId',80);
    fixture.detectChanges();
    expect(studio.commissionPlanning).toHaveBeenCalledWith(80);
    const scheduled={...step,date:'2026-11-19'};
    studio.commissionPlanning.and.returnValue(of([scheduled,done]));
    component.reload();
    component.openEditor(scheduled);
    component.draftDate='2026-02-30';
    component.saveEditor();
    expect(studio.setPlanningDate).not.toHaveBeenCalled();
    component.draftDate='2026-11-22';
    component.saveEditor();
    expect(studio.setPlanningDate).toHaveBeenCalledWith(80,81,'2026-11-22');
    component.openEditor(scheduled);component.saveEditor(true);
    expect(studio.setPlanningDate).toHaveBeenCalledWith(80,81,null);
    component.openEditor(done);
    expect(component.editing).toBeNull();
  });

  it('ignores stale responses after month or account switch and clears private results',()=>{
    const late=new Subject<CreatorCalendarPage>();
    studio.calendar.and.returnValue(late);
    component.changeMonth(1);
    studio.calendar.and.returnValue(of({items:[],hasMore:false}));
    studio.unplannedCalendar.and.returnValue(of({items:[],hasMore:false}));
    users$.next({...user,id:99});
    late.next({items:[delivery],hasMore:false});late.complete();
    expect(component.events).toEqual([]);
    expect(component.groups).toEqual([]);
    users$.next(null);
    expect(component.events).toEqual([]);
    expect(component.detail).toEqual([]);
  });

  it('slides in a dated skeleton without reloading or removing the unplanned queue',()=>{
    const pending=new Subject<CreatorCalendarPage>();
    studio.calendar.and.returnValue(pending);
    const originalAside=fixture.nativeElement.querySelector('aside');
    const unplannedCalls=studio.unplannedCalendar.calls.count();
    component.changeMonth(1);
    fixture.detectChanges();
    expect(component.monthMotion?.direction).toBe('next');
    expect(component.monthMotion?.days.some(day=>day.items.includes(delivery))).toBeTrue();
    expect(component.loading).toBeTrue();
    expect(component.days[0].date).toBe('2026-11-29');
    expect(fixture.nativeElement.querySelectorAll('.calendar-current .calendar-skeleton').length).toBe(42);
    expect(fixture.nativeElement.querySelector('.calendar-outgoing').getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.querySelector('aside')).toBe(originalAside);
    expect(originalAside.textContent).toContain('Rascunho');
    expect(component.movable(step)).toBeFalse();
    expect(studio.unplannedCalendar.calls.count()).toBe(unplannedCalls);
    pending.next({items:[],hasMore:false});pending.complete();
    fixture.detectChanges();
    expect(component.loading).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('.calendar-current .calendar-skeleton').length).toBe(0);
    expect(component.groups[0].items).toEqual([step]);
    expect(component.movable(step)).toBeTrue();
    const grid=fixture.nativeElement.querySelector('.calendar-current');
    component.finishMonthMotion({target:grid,currentTarget:grid,animationName:'scoped_creator-calendar-enter-next'} as AnimationEvent,component.month);
    expect(component.monthMotion).toBeNull();
  });

  it('keeps only the latest month when navigation is rapid and clears the outgoing snapshot on account change',()=>{
    const first=new Subject<CreatorCalendarPage>(), second=new Subject<CreatorCalendarPage>();
    studio.calendar.and.returnValue(first);
    component.changeMonth(1);
    studio.calendar.and.returnValue(second);
    component.changeMonth(-1);
    expect(component.monthMotion?.direction).toBe('previous');
    second.next({items:[done],hasMore:false});second.complete();
    first.next({items:[delivery],hasMore:false});first.complete();
    expect(component.events).toEqual([done]);
    studio.calendar.and.returnValue(of({items:[],hasMore:false}));
    studio.unplannedCalendar.and.returnValue(of({items:[],hasMore:false}));
    users$.next({...user,id:99});
    expect(component.monthMotion).toBeNull();
    expect(component.groups).toEqual([]);
    expect(component.events).toEqual([]);
  });

  it('clears the old month and unplanned queue when access is revoked during navigation',()=>{
    const pending=new Subject<CreatorCalendarPage>();
    studio.calendar.and.returnValue(pending);
    component.changeMonth(1);
    pending.error(new HttpErrorResponse({status:403}));
    fixture.detectChanges();
    expect(component.monthMotion).toBeNull();
    expect(component.events).toEqual([]);
    expect(component.groups).toEqual([]);
    expect(fixture.nativeElement.querySelector('.calendar-outgoing')).toBeNull();
    expect(fixture.nativeElement.querySelector('aside').textContent).not.toContain('Ref sheet');
  });

  it('shows each order title and client only once in the compact sidebar and keeps planning accessible',()=>{
    studio.unplannedCalendar.and.returnValue(of({items:[step,{...step,stepId:83,stepName:'Pintura'}],hasMore:false}));
    component.reload();
    fixture.detectChanges();
    const aside=fixture.nativeElement.querySelector('aside') as HTMLElement;
    expect(aside.querySelectorAll('a').length).toBe(1);
    expect(aside.textContent?.match(/Ref sheet/g)?.length).toBe(1);
    expect(aside.textContent?.match(/Client/g)?.length).toBe(1);
    const button=aside.querySelector('button[aria-label="Planejar Rascunho de Ref sheet"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    expect(component.editing).toEqual(step);
  });

  it('collapses both sidebar sections independently and keeps their state while navigating',()=>{
    const aside=fixture.nativeElement.querySelector('aside') as HTMLElement;
    const unplanned=aside.querySelector('[data-sidebar-toggle="unplanned"]') as HTMLButtonElement;
    const planned=aside.querySelector('[data-sidebar-toggle="planned"]') as HTMLButtonElement;
    expect(unplanned.getAttribute('aria-expanded')).toBe('true');
    expect(planned.getAttribute('aria-expanded')).toBe('false');
    expect(component.plannedCount).toBe(1);
    unplanned.click();planned.click();fixture.detectChanges();
    expect(aside.querySelector('[data-sidebar-body="unplanned"]')).toBeNull();
    expect(aside.querySelector('[data-calendar-date="unplanned"]')).not.toBeNull();
    expect(aside.querySelector('[data-sidebar-body="planned"]')?.textContent).toContain('21/11');
    expect(aside.querySelector('[data-sidebar-body="planned"]')?.textContent).not.toContain('Prazo de entrega');
    const pending=new Subject<CreatorCalendarPage>();
    studio.calendar.and.returnValue(pending);
    component.changeMonth(1);fixture.detectChanges();
    expect(unplanned.getAttribute('aria-expanded')).toBe('false');
    expect(planned.getAttribute('aria-expanded')).toBe('true');
    expect(aside.querySelector('[data-sidebar-body="planned"] .calendar-skeleton')).not.toBeNull();
    pending.next({items:[delivery,done],hasMore:false});pending.complete();fixture.detectChanges();
    expect(component.plannedCount).toBe(0);
    expect(aside.textContent).toContain('Nenhuma produção planejada neste mês.');
  });

  it('keeps toolbar, calendar and sidebar top positions stable through initial reload and month loading',()=>{
    const root=fixture.nativeElement as HTMLElement;
    const positions=()=>['.calendar-toolbar','.calendar-viewport','aside'].map(selector=>
      root.querySelector(selector)!.getBoundingClientRect().top-root.getBoundingClientRect().top);
    const before=positions();
    const pending=new Subject<CreatorCalendarPage>();
    studio.calendar.and.returnValue(pending);
    component.reload();fixture.detectChanges();
    expect(positions()).toEqual(before);
    expect(root.querySelector('.calendar-toolbar [role="status"]')?.textContent).toContain('Carregando');
    pending.next({items:[delivery,done],hasMore:false});pending.complete();fixture.detectChanges();
    expect(positions()).toEqual(before);
    const next=new Subject<CreatorCalendarPage>();
    studio.calendar.and.returnValue(next);
    component.changeMonth(1);fixture.detectChanges();
    expect(positions()).toEqual(before);
    next.next({items:[],hasMore:false});next.complete();fixture.detectChanges();
    expect(positions()).toEqual(before);
  });

  it('keeps every day the same height, truncates busy days, and exposes every item in day details',()=>{
    const date='2026-11-20';
    const entries=Array.from({length:8},(_,i)=>({...step,stepId:100+i,stepName:'Etapa longa '+i+' com texto muito comprido',date}));
    studio.calendar.and.returnValue(of({items:entries,hasMore:false}));component.reload();fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    const busy=root.querySelector('[data-calendar-date="2026-11-20"]') as HTMLElement;
    const empty=root.querySelector('[data-calendar-date="2026-11-19"]') as HTMLElement;
    expect(busy.getBoundingClientRect().height).toBe(empty.getBoundingClientRect().height);
    expect(busy.querySelectorAll('.calendar-chip').length).toBe(2);
    expect(busy.querySelector('.calendar-more')?.textContent).toContain('+6 mais');
    (busy.querySelector('.calendar-more') as HTMLButtonElement).click();fixture.detectChanges();
    expect(component.selectedDay).toBe(date);
    const dialog=root.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBeTrue();
    expect(dialog.querySelectorAll('.calendar-detail-row').length).toBe(8);
    expect(root.querySelector('.calendar-layout .calendar-detail-row')).toBeNull();
  });

  it('opens a modal for empty and busy days without changing calendar height, then focuses the date in agenda',()=>{
    const root=fixture.nativeElement as HTMLElement;
    const viewport=root.querySelector('.calendar-viewport')!;
    const height=viewport.getBoundingClientRect().height;
    const calls=studio.calendar.calls.count();
    (root.querySelector('[data-calendar-date="2026-11-19"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const dialog=root.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBeTrue();
    expect(root.querySelectorAll('dialog').length).toBe(1);
    expect(dialog.textContent).toContain('19 de novembro');
    expect(dialog.textContent).toContain('Nada planejado neste dia.');
    expect(document.activeElement).toBe(dialog.querySelector('[aria-label="Fechar detalhes do dia"]'));
    expect(viewport.getBoundingClientRect().height).toBe(height);
    const link=Array.from(dialog.querySelectorAll('button')).find(button=>button.textContent?.includes('Ver na agenda'))!;
    link.click();fixture.detectChanges();
    expect(dialog.open).toBeFalse();
    expect(component.viewMode).toBe('agenda');
    expect(component.agendaFocusDay).toBe('2026-11-19');
    const focused=root.querySelector('[data-agenda-date="2026-11-19"]');
    expect(focused?.classList.contains('agenda-focused')).toBeTrue();
    expect(document.activeElement).toBe(focused?.querySelector('h3') as HTMLElement);
    expect(focused?.textContent).toContain('Nada planejado neste dia.');
    expect(studio.calendar.calls.count()).toBe(calls);
  });

  it('focuses adjacent-month days in their actual agenda month',()=>{
    const root=fixture.nativeElement as HTMLElement;
    studio.calendar.and.returnValue(of({items:[{...step,date:'2026-12-01'}],hasMore:false}));
    component.reload();fixture.detectChanges();
    component.selectDay('2026-12-01');fixture.detectChanges();
    component.openDayInAgenda();fixture.detectChanges();
    expect(component.month).toBe('2026-12-01');
    expect(component.agendaFocusDay).toBe('2026-12-01');
    expect(root.querySelector('[data-agenda-date="2026-12-01"].agenda-focused')).not.toBeNull();
    expect(studio.calendar).toHaveBeenCalledWith('2026-11-29','2027-01-09',1,100);
  });

  it('keeps editing in the modal, refreshes after saving and closes on account change',()=>{
    const scheduled={...step,date:'2026-11-20'};
    studio.calendar.and.returnValue(of({items:[scheduled,delivery],hasMore:false}));
    component.reload();fixture.detectChanges();
    component.selectDay('2026-11-20');fixture.detectChanges();
    const dialog=fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    (dialog.querySelector('.calendar-detail-row button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(dialog.querySelector('input[type="date"]')).not.toBeNull();
    component.draftDate='2026-11-23';component.saveEditor();fixture.detectChanges();
    expect(studio.setPlanningDate).toHaveBeenCalledOnceWith(80,81,'2026-11-23');
    expect(dialog.open).toBeTrue();
    expect(component.editing).toBeNull();
    const cancel=new Event('cancel',{cancelable:true});
    dialog.dispatchEvent(cancel);fixture.detectChanges();
    expect(cancel.defaultPrevented).toBeTrue();
    expect(dialog.open).toBeFalse();
    component.selectDay('2026-11-20');fixture.detectChanges();
    users$.next(null);fixture.detectChanges();
    expect(dialog.open).toBeFalse();
    expect(dialog.textContent).not.toContain('Ref sheet');
    expect(component.dayModalOpen).toBeFalse();
  });

  it('shows a chronological agenda of the selected month with the same filters and dates, without fetching again',()=>{
    const scheduled={...step,date:'2026-11-19'};
    const spillover={...step,stepId:99,date:'2026-12-01'};
    studio.calendar.and.returnValue(of({items:[done,spillover,delivery,scheduled],hasMore:false}));
    component.reload();fixture.detectChanges();
    const calls=studio.calendar.calls.count();
    component.setViewMode('agenda');fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    expect(Array.from(root.querySelectorAll('[data-agenda-date]')).map(el=>el.getAttribute('data-agenda-date')))
      .toEqual(['2026-11-19','2026-11-20','2026-11-21']);
    expect(root.querySelector('.calendar-viewport')).toBeNull();
    expect(root.querySelectorAll('.calendar-detail-row').length).toBe(3);
    expect(root.textContent).toContain('Pedido em pausa');
    expect(root.textContent).toContain('Pendente');
    expect(studio.calendar.calls.count()).toBe(calls);
    const edit=root.querySelector('.calendar-detail-row button') as HTMLButtonElement;
    edit.click();
    expect(component.editing).toEqual(scheduled);
    component.draftDate='2026-11-25';component.saveEditor();
    expect(studio.setPlanningDate).toHaveBeenCalledOnceWith(80,81,'2026-11-25');
    const refreshedCalls=studio.calendar.calls.count();
    component.setFilter('DELIVERY');fixture.detectChanges();
    expect(root.querySelectorAll('.calendar-detail-row').length).toBe(1);
    expect(root.querySelector('.calendar-detail-row button')).toBeNull();
    component.setFilter('ALL');component.setViewMode('month');fixture.detectChanges();
    expect(root.querySelector('.calendar-viewport')).not.toBeNull();
    expect(studio.calendar.calls.count()).toBe(refreshedCalls);
  });

  it('navigates in agenda mode without retaining outgoing private snapshots',()=>{
    component.setViewMode('agenda');
    const pending=new Subject<CreatorCalendarPage>();
    studio.calendar.and.returnValue(pending);
    component.changeMonth(1);fixture.detectChanges();
    expect(component.monthMotion).toBeNull();
    expect(fixture.nativeElement.querySelector('.agenda-loading')).not.toBeNull();
    pending.next({items:[{...step,date:'2026-12-03'}],hasMore:false});pending.complete();fixture.detectChanges();
    expect(component.agendaDays.map(day=>day.date)).toEqual(['2026-12-03']);
    users$.next(null);fixture.detectChanges();
    expect(component.agendaDays).toEqual([]);
    expect(component.viewMode).toBe('month');
  });

  it('keeps paginated results without duplicating the same event',()=>{
    studio.calendar.and.returnValue(of({items:[delivery],hasMore:true}));
    component.reload();
    studio.calendar.and.returnValue(of({items:[delivery,done],hasMore:false}));
    component.loadMore('events');
    expect(studio.calendar).toHaveBeenCalledWith('2026-11-01','2026-12-12',2,100);
    expect(component.events).toEqual([delivery,done]);
    expect(component.hasMoreEvents).toBeFalse();
  });
});
