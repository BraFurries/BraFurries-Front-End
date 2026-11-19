import { CdkDragEnd, CdkDragMove } from '@angular/cdk/drag-drop';
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
