import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import type { MetricChart, MetricMarker } from './metric-line-chart.component';
import { AdminService } from '../../../../../core/services/admin.service';
import {
  AdminCanonicalMetrics, AdminMetricsPeriod
} from '../../../../../shared/models/api/admin/admin';

@Component({
  selector: 'app-admin-metricas',
  standalone: false,
  templateUrl: './metricas.component.html',
  styleUrls: []
})
export class AdminMetricsComponent implements OnInit, OnDestroy {
  metrics: AdminCanonicalMetrics | null = null;
  period: AdminMetricsPeriod = '30d';
  loading = true;
  errorMessage = '';
  private loadSequence = 0;
  private readonly destroy$ = new Subject<void>();

  charts: Record<'members' | 'reach' | 'commands', MetricChart> = {
    members: this.emptyChart(),
    reach: this.emptyChart(),
    commands: this.emptyChart()
  };

  constructor(private readonly adminService: AdminService) {}

  ngOnInit(): void { this.loadMetrics(); }

  ngOnDestroy(): void {
    this.loadSequence++;
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadMetrics(): void {
    const sequence = ++this.loadSequence;
    this.loading = true;
    this.metrics = null;
    this.errorMessage = '';
    this.adminService.getMetrics(this.period).pipe(takeUntil(this.destroy$)).subscribe({
      next: report => {
        if (sequence !== this.loadSequence) return;
        this.metrics = report;
        this.charts = {
          members: this.chart(report.dailySnapshots.map(p => ({
            date:p.date, value:p.brafurriesMembers
          }))),
          reach: this.chart(report.dailySnapshots.map(p => ({
            date:p.date, value:p.coddyReach
          }))),
          commands: this.chart(report.commandUsage.map(p => ({
            date:p.date, value:p.executions
          })))
        };
        this.loading = false;
      },
      error: () => {
        if (sequence !== this.loadSequence) return;
        this.loading = false;
        this.errorMessage = 'Não foi possível consultar as métricas canônicas. ' +
          'Confira se a migration e a coleta foram habilitadas.';
      }
    });
  }

  deltaText(delta: number | null): string {
    if (delta === null) return 'Sem base histórica comparável';
    return (delta > 0 ? '+' : '') + delta.toLocaleString('pt-BR') + ' no período';
  }

  deltaClass(delta: number | null): string {
    return delta === null ? 'text-gray-500' :
      delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-700' : 'text-gray-500';
  }

  dateLabel(iso: string): string {
    const [year,month,day] = iso.slice(0,10).split('-');
    return day + '/' + month + '/' + year;
  }

  commandShare(uses: number): number {
    const total=this.metrics?.summary.commandsExecuted ?? 0;
    return total>0?Math.min(100,uses*100/total):0;
  }

  private emptyChart(): MetricChart {
    return {segments:[],markers:[],ticks:[],count:0,min:null,max:null};
  }

  /** Missing dates break the line instead of being drawn as fictional zeros. */
  private chart(points: { date:string; value:number|null }[]): MetricChart {
    const known=points.filter(p=>p.value!==null && Number.isFinite(p.value))
      .map(p=>p.value as number);
    if (!known.length) return this.emptyChart();
    const min=Math.min(...known);
    const max=Math.max(...known);
    // Counts are integral. Use readable Y-axis steps and a little headroom
    // so the trend and the numeric reference lines share the same scale.
    const step=this.niceStep(max===min ? Math.max(1, Math.abs(min)*0.02) : (max-min)/4);
    const axisMin=max===min
      ? Math.max(0,Math.floor(min/step)*step-2*step)
      : Math.max(0,Math.floor(min/step)*step-step);
    const axisMax=max===min
      ? Math.max(axisMin+4*step,Math.ceil(max/step)*step+2*step)
      : Math.ceil(max/step)*step+step;
    const yFor=(value:number)=>170-((value-axisMin)/(axisMax-axisMin))*148;
    const ticks=Array.from(
      {length:Math.round((axisMax-axisMin)/step)+1},
      (_,i)=>{const value=Math.round(axisMin+i*step);return {value,y:yFor(value)};}
    );
    const segments:{points:string}[]=[];
    const markers:MetricMarker[]=[];
    let current:string[]=[];
    points.forEach((item,index)=>{
      if(item.value===null || !Number.isFinite(item.value)){
        if(current.length) segments.push({points:current.join(' ')});
        current=[];
        return;
      }
      const x=78+(points.length===1?271:(index/(points.length-1))*542);
      const y=yFor(item.value);
      current.push(x.toFixed(2)+','+y.toFixed(2));
      markers.push({x,y,value:item.value,date:item.date});
    });
    if(current.length) segments.push({points:current.join(' ')});
    return {segments,markers,ticks,count:known.length,min,max};
  }

  private niceStep(raw:number): number {
    const candidate=Math.max(1,raw);
    const order=Math.pow(10,Math.floor(Math.log10(candidate)));
    const normalized=candidate/order;
    return (normalized<=1?1:normalized<=2?2:normalized<=5?5:10)*order;
  }
}
