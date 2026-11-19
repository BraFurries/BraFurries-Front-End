import { CommonModule } from '@angular/common';
import { CdkDragEnd, CdkDragMove, DragDropModule } from '@angular/cdk/drag-drop';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, OnInit, QueryList, ViewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { distinctUntilChanged, forkJoin, Subject, takeUntil } from 'rxjs';
import { CreatorCalendarItem, CreatorCalendarKind, CreatorStudioService } from '../../../core/services/creator-studio.service';
import { UserService } from '../../../core/services/user.service';

interface CalendarDay {
  date: string;
  number: number;
  inMonth: boolean;
  items: CreatorCalendarItem[];
}
interface MonthMotion { direction: 'next' | 'previous'; month: string; days: CalendarDay[]; loading: boolean; }
interface UnplannedGroup { id: number; title: string; clientName: string; items: CreatorCalendarItem[]; }

/** One private calendar and the commission-specific planning editor use the
 * same mutation contract. No progress or due-date changes here. */
@Component({
  selector: 'app-creator-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DragDropModule],
  templateUrl: './creator-calendar.component.html',
  styleUrls: ['./creator-calendar.component.css']
})
export class CreatorCalendarComponent implements OnInit, OnChanges, OnDestroy {
  @Input() commissionId: number | null = null;
  @ViewChildren('calendarTarget', { read: ElementRef }) private targets!: QueryList<ElementRef<HTMLElement>>;

  readonly weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  readonly dragDelay = { touch: 200, mouse: 0 };
  readonly today = this.localToday();
  month = this.today.slice(0,7) + '-01';
  selectedDay = this.today;
  monthLabel = '';
  days: CalendarDay[] = [];
  events: CreatorCalendarItem[] = [];
  unplanned: CreatorCalendarItem[] = [];
  groups: UnplannedGroup[] = [];
  plannedGroups: UnplannedGroup[] = [];
  unplannedExpanded = true;
  plannedExpanded = false;
  detail: CreatorCalendarItem[] = [];
  filter: 'ALL' | 'PRODUCTION' | 'DELIVERY' = 'ALL';
  loading = false;
  monthMotion: MonthMotion | null = null;
  private unplannedReady = false;
  busy = false;
  loadingMore = false;
  error = '';
  hasMoreEvents = false;
  hasMoreUnplanned = false;
  editing: CreatorCalendarItem | null = null;
  draftDate = '';
  draggedKey: string | null = null;
  hoveredDate: string | null = null;
  private eventPage = 1;
  private unplannedPage = 1;
  private owner: number | null = null;
  private initialized = false;
  private sequence = 0;
  private readonly destroy$ = new Subject<void>();
  private readonly colors = ['border-violet-400 bg-violet-50 text-violet-900',
    'border-blue-400 bg-blue-50 text-blue-900','border-teal-500 bg-teal-50 text-teal-900',
    'border-pink-400 bg-pink-50 text-pink-900','border-indigo-400 bg-indigo-50 text-indigo-900',
    'border-cyan-500 bg-cyan-50 text-cyan-900'];

  constructor(private readonly studio: CreatorStudioService, private readonly users: UserService,
              private readonly zone: NgZone) {}

  ngOnInit(): void {
    this.initialized = true;
    this.users.user$.pipe(distinctUntilChanged((a,b)=>a?.id===b?.id), takeUntil(this.destroy$))
      .subscribe(user => {
        this.owner = user?.id ?? null;
        this.unplannedExpanded = true;
        this.plannedExpanded = false;
        this.filter = 'ALL';
        this.month = this.today.slice(0,7)+'-01';
        this.selectedDay = this.today;
        this.reload();
      });
  }

  ngOnChanges(): void {
    if (this.initialized) this.reload();
  }

  ngOnDestroy(): void {
    this.sequence++;
    this.destroy$.next();
    this.destroy$.complete();
  }

  private localToday(): string {
    const now = new Date();
    return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),
      String(now.getDate()).padStart(2,'0')].join('-');
  }

  private utcDate(value: string): Date {
    return new Date(value + 'T00:00:00Z');
  }

  private civil(value: Date): string { return value.toISOString().slice(0,10); }

  private buildDays(): void {
    const first = this.utcDate(this.month);
    this.monthLabel = new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
    const start = new Date(first);
    start.setUTCDate(start.getUTCDate()-start.getUTCDay());
    const byDate = new Map<string,CreatorCalendarItem[]>();
    for (const item of this.events) {
      if (!item.date || (this.filter === 'DELIVERY' && item.kind !== 'DELIVERY') ||
          (this.filter === 'PRODUCTION' && item.kind === 'DELIVERY')) continue;
      if (!byDate.has(item.date)) byDate.set(item.date,[]);
      byDate.get(item.date)!.push(item);
    }
    this.days = Array.from({length:42},(_,i)=>{
      const day=new Date(start); day.setUTCDate(day.getUTCDate()+i);
      const date=this.civil(day);
      return {date,number:day.getUTCDate(),inMonth:day.getUTCMonth()===first.getUTCMonth(),
        items:byDate.get(date) || []};
    });
    if (!this.days.some(day=>day.date===this.selectedDay)) this.selectedDay=this.month;
    // Only production in the selected month, not deadlines or spillover dates.
    this.plannedGroups=this.groupItems(this.events.filter(item=>item.kind!=='DELIVERY' &&
      item.date?.startsWith(this.month.slice(0,7))));
  }

  get selectedItems(): CreatorCalendarItem[] {
    return this.days.find(day=>day.date===this.selectedDay)?.items || [];
  }

  trackDay(_index:number,day:CalendarDay):string { return day.date; }
  readonly trackItem = (_index:number,item:CreatorCalendarItem):string => this.key(item);
  trackGroup(_index:number,group:UnplannedGroup):number { return group.id; }
  key(item:CreatorCalendarItem):string {return item.kind+':'+item.commissionId+':'+(item.stepId??'');}
  label(item:CreatorCalendarItem):string {
    return item.kind==='DELIVERY' ? 'Prazo de entrega' : item.kind==='PRODUCTION' ? 'Produção' : item.stepName || 'Etapa';
  }
  historical(item:CreatorCalendarItem):boolean {
    return item.commissionStatus==='COMPLETED' || item.stepStatus==='DONE';
  }
  color(item:CreatorCalendarItem):string {
    return item.kind==='DELIVERY' ? 'border-amber-500 bg-amber-50 text-amber-900' :
      this.colors[Math.abs(item.commissionId)%this.colors.length];
  }
  movable(item:CreatorCalendarItem):boolean {
    return item.kind!=='DELIVERY' && !this.historical(item) && !this.loading &&
      !this.loadingMore && !this.busy && this.owner!==null && this.filter!=='DELIVERY';
  }

  private clearDrag():void {this.draggedKey=null;this.hoveredDate=null;}
  cancelEdit():void {this.editing=null;this.draftDate='';}
  private current(seq:number,owner:number):boolean {
    return seq===this.sequence && this.owner===owner && this.users.getUser()?.id===owner;
  }

  private resetData():void {
    this.monthMotion=null;this.unplannedReady=false;
    this.events=[];this.unplanned=[];this.groups=[];this.detail=[];
    this.eventPage=1;this.unplannedPage=1;
    this.hasMoreEvents=false;this.hasMoreUnplanned=false;
    this.loadingMore=false;this.busy=false;this.error='';
    this.clearDrag();this.cancelEdit();this.buildDays();
  }

  reload():void {
    const seq=++this.sequence, owner=this.owner;
    this.resetData();
    this.loading=owner!==null;
    if (owner===null) return;
    if (this.commissionId!==null) {
      this.studio.commissionPlanning(this.commissionId).pipe(takeUntil(this.destroy$)).subscribe({
        next:items=>{if(this.current(seq,owner)){this.detail=items;this.loading=false;}},
        error:err=>this.fail(seq,owner,err)
      });
      return;
    }
    forkJoin({
      month:this.studio.calendar(this.days[0].date,this.days[41].date,1,100),
      unplanned:this.studio.unplannedCalendar(1,40)
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next:result=>{
        if(!this.current(seq,owner))return;
        this.events=result.month.items;this.hasMoreEvents=result.month.hasMore;
        this.unplanned=result.unplanned.items;this.hasMoreUnplanned=result.unplanned.hasMore;
        this.unplannedReady=true;
        this.buildDays();this.buildGroups();this.loading=false;
      },
      error:err=>this.fail(seq,owner,err)
    });
  }

  private fail(seq:number,owner:number,err:unknown):void {
    if(!this.current(seq,owner))return;
    this.loading=false;this.loadingMore=false;this.busy=false;this.clearDrag();
    if(err instanceof HttpErrorResponse && [401,403,404].includes(err.status)){
      this.resetData();
      this.error='Acesso ou pedido indisponível. Verifique sua assinatura.';
    }else this.error='Não foi possível carregar ou salvar o planejamento. Tente novamente.';
  }

  toggleSidebar(section:'unplanned'|'planned'):void {
    if(this.draggedKey!==null)return;
    if(section==='unplanned')this.unplannedExpanded=!this.unplannedExpanded;
    else this.plannedExpanded=!this.plannedExpanded;
  }

  get plannedCount():number {
    return this.plannedGroups.reduce((total,group)=>total+group.items.length,0);
  }

  private buildGroups():void { this.groups=this.groupItems(this.unplanned); }

  private groupItems(items:CreatorCalendarItem[]):UnplannedGroup[] {
    const groups=new Map<number,UnplannedGroup>();
    for(const item of items){
      if(!groups.has(item.commissionId))groups.set(item.commissionId,{id:item.commissionId,
        title:item.title,clientName:item.clientName,items:[]});
      groups.get(item.commissionId)!.items.push(item);
    }
    return [...groups.values()];
  }

  private mergeItems(old:CreatorCalendarItem[],extra:CreatorCalendarItem[]):CreatorCalendarItem[]{
    const unique=new Map(old.map(item=>[this.key(item),item]));
    extra.forEach(item=>unique.set(this.key(item),item));
    return [...unique.values()];
  }

  loadMore(kind:'events'|'unplanned'):void {
    const owner=this.owner,seq=this.sequence;
    if(owner===null||this.loading||this.busy||this.loadingMore||this.draggedKey!==null||
       !(kind==='events'?this.hasMoreEvents:this.hasMoreUnplanned))return;
    this.loadingMore=true;this.error='';
    const next=(kind==='events'?this.eventPage:this.unplannedPage)+1;
    const request=kind==='events'
      ?this.studio.calendar(this.days[0].date,this.days[41].date,next,100)
      :this.studio.unplannedCalendar(next,40);
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next:page=>{
        if(!this.current(seq,owner))return;
        if(kind==='events'){
          this.eventPage=next;this.events=this.mergeItems(this.events,page.items);
          this.hasMoreEvents=page.hasMore;this.buildDays();
        }else{
          this.unplannedPage=next;this.unplanned=this.mergeItems(this.unplanned,page.items);
          this.hasMoreUnplanned=page.hasMore;this.buildGroups();
        }
        this.loadingMore=false;
      },error:err=>this.fail(seq,owner,err)
    });
  }

  get unplannedLoading():boolean { return this.loading && !this.unplannedReady; }

  get monthNavigationDisabled():boolean {
    return this.owner===null || this.busy || this.draggedKey!==null || this.loadingMore ||
      (this.loading && !this.unplannedReady);
  }

  private navigateMonth(month:string,selectedDay:string):void {
    const owner=this.owner;
    if(owner===null || this.monthNavigationDisabled)return;
    if(month===this.month){this.selectedDay=selectedDay;return;}
    if(!this.unplannedReady){
      this.month=month;this.selectedDay=selectedDay;this.reload();return;
    }
    // The unplanned queue is independent of the visible month. Keep its
    // loaded pages and scroll position, but disable writes during navigation.
    const seq=++this.sequence;
    this.monthMotion={direction:month>this.month?'next':'previous',month,days:this.days,loading:this.loading};
    this.month=month;this.selectedDay=selectedDay;
    this.events=[];this.eventPage=1;this.hasMoreEvents=false;
    this.error='';this.cancelEdit();this.clearDrag();this.loading=true;this.buildDays();
    this.studio.calendar(this.days[0].date,this.days[41].date,1,100)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next:page=>{
          if(!this.current(seq,owner))return;
          this.events=page.items;this.hasMoreEvents=page.hasMore;
          this.buildDays();this.loading=false;
        },error:err=>this.fail(seq,owner,err)
      });
  }

  finishMonthMotion(event:AnimationEvent,month:string):void {
    if(event.target===event.currentTarget && this.monthMotion?.month===month &&
       (event.animationName.endsWith('creator-calendar-enter-next') ||
        event.animationName.endsWith('creator-calendar-enter-previous')))this.monthMotion=null;
  }

  changeMonth(delta:number):void {
    if(this.monthNavigationDisabled)return;
    const first=this.utcDate(this.month);first.setUTCMonth(first.getUTCMonth()+delta);
    if(first.getUTCFullYear()<1901||first.getUTCFullYear()>9998)return;
    const month=this.civil(first);
    this.navigateMonth(month,month);
  }
  goToday():void {
    this.navigateMonth(this.today.slice(0,7)+'-01',this.today);
  }
  setFilter(filter:'ALL'|'PRODUCTION'|'DELIVERY'):void {
    if(this.busy||this.draggedKey!==null)return;
    this.filter=filter;this.cancelEdit();this.buildDays();
  }
  openEditor(item:CreatorCalendarItem):void {
    if(!this.movable(item)||this.draggedKey!==null)return;
    this.editing=item;this.draftDate=item.date||this.selectedDay;this.error='';
  }
  saveEditor(remove=false):void {
    const item=this.editing;
    if(!item)return;
    if(!remove&&!this.validDate(this.draftDate)){
      this.error='Informe uma data válida.';return;
    }
    this.saveDate(item,remove?null:this.draftDate);
  }
  private validDate(date:string):boolean {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<'1900-01-01'||date>'9999-12-31')return false;
    const parsed=this.utcDate(date);
    return Number.isFinite(parsed.getTime())&&this.civil(parsed)===date;
  }
  saveDate(item:CreatorCalendarItem,date:string|null):void {
    const owner=this.owner,seq=this.sequence;
    if(owner===null||!this.current(seq,owner)||!this.movable(item)||
       (date!==null&&!this.validDate(date)))return;
    const source=this.commissionId!==null?this.detail:[...this.events,...this.unplanned];
    if(!source.some(value=>this.key(value)===this.key(item)))return;
    if(date===item.date){this.cancelEdit();return;}
    this.busy=true;this.error='';
    this.studio.setPlanningDate(item.commissionId,item.stepId,date).pipe(takeUntil(this.destroy$)).subscribe({
      next:()=>{if(this.current(seq,owner))this.reload();},
      error:err=>this.fail(seq,owner,err)
    });
  }

  dragStart(item:CreatorCalendarItem):void {
    if(this.movable(item)){
      this.cancelEdit();this.draggedKey=this.key(item);this.hoveredDate=null;
    }
  }
  private targetAt(event:MouseEvent|TouchEvent):string|null {
    const point='changedTouches' in event ? (event.changedTouches[0]||event.touches[0]) : event;
    if(!point||!Number.isFinite(point.clientX)||!Number.isFinite(point.clientY))return null;
    for(const target of this.targets?.toArray()||[]){
      const el=target.nativeElement, rect=el.getBoundingClientRect();
      if(rect.width>0&&rect.height>0&&point.clientX>=rect.left&&point.clientX<=rect.right&&
         point.clientY>=rect.top&&point.clientY<=rect.bottom)return el.dataset['calendarDate']||null;
    }
    return null;
  }
  dragMove(event:CdkDragMove<CreatorCalendarItem>):void {
    if(this.draggedKey!==this.key(event.source.data))return;
    const target=this.targetAt(event.event);
    if(target!==this.hoveredDate)this.zone.run(()=>this.hoveredDate=target);
  }
  dragEnd(event:CdkDragEnd<CreatorCalendarItem>,item:CreatorCalendarItem):void {
    if(this.draggedKey!==this.key(item))return;
    const target=this.targetAt(event.event);
    this.zone.run(()=>{
      this.clearDrag();
      if(target!==null)this.saveDate(item,target==='unplanned'?null:target);
    });
  }
}
