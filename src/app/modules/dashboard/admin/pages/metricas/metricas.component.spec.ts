import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminService } from '../../../../../core/services/admin.service';
import { AdminCanonicalMetrics } from '../../../../../shared/models/api/admin/admin';
import { AdminMetricsComponent } from './metricas.component';

describe('AdminMetricsComponent: canonical analytics', () => {
  let service:jasmine.SpyObj<AdminService>;
  let report:AdminCanonicalMetrics;

  beforeEach(async () => {
    service=jasmine.createSpyObj('AdminService',['getMetrics']);
    report={
      period:'30d', startDate:'2026-11-01',endDate:'2026-11-03',
      commandTrackingSince:'2026-11-01T00:00:00Z',
      snapshotTrackingSince:'2026-11-01',lastSnapshotAt:'2026-11-03T08:00:00Z',
      summary:{
        brafurriesMembers:4000,brafurriesDelta:null,coddyReach:5100,
        coddyReachDelta:100,reconciledServers:4,activeServers:5,
        commandsExecuted:12,commandCoverageComplete:false,
        previousCommandsExecuted:null,commandsGrowthPercent:null
      },
      dailySnapshots:[
        {date:'2026-11-01',brafurriesMembers:4000,coddyReach:5000,
         reconciledServers:4,activeServers:5,sampledAt:'2026-11-01T08:00:00Z'},
        {date:'2026-11-02',brafurriesMembers:null,coddyReach:null,
         reconciledServers:0,activeServers:5,sampledAt:'2026-11-02T08:00:00Z'},
        {date:'2026-11-03',brafurriesMembers:4000,coddyReach:5100,
         reconciledServers:4,activeServers:5,sampledAt:'2026-11-03T08:00:00Z'}
      ],
      commandUsage:[
        {date:'2026-11-01',executions:5},
        {date:'2026-11-02',executions:0},
        {date:'2026-11-03',executions:7}
      ],
      topCommands:[
        {command:'perfil',executions:8},
        {command:'loja',executions:4}
      ]
    };
    service.getMetrics.and.returnValue(of(report));
    await TestBed.configureTestingModule({
      imports:[CommonModule,FormsModule],
      declarations:[AdminMetricsComponent],
      providers:[{provide:AdminService,useValue:service}]
    }).compileComponents();
  });

  it('renders real guild growth, deduplicated reach and successful commands separately', () => {
    const fixture=TestBed.createComponent(AdminMetricsComponent);
    fixture.detectChanges();
    expect(service.getMetrics).toHaveBeenCalledWith('30d');
    const text=fixture.nativeElement.textContent as string;
    expect(text).toContain('Crescimento da BraFurries');
    expect(text).toContain('Alcance único do Coddy');
    expect(text).toContain('Comandos concluídos');
    expect(text).toContain('12');
    expect(text).toContain('/perfil');
    expect(text).toContain('4 / 5');
    fixture.destroy();
  });

  it('never connects missing observations with fabricated zero in graph lines', () => {
    const fixture=TestBed.createComponent(AdminMetricsComponent);
    fixture.detectChanges();
    const chart=fixture.componentInstance.charts.members;
    expect(chart.count).toBe(2);
    expect(chart.min).toBe(4000);
    expect(chart.segments.length).toBe(2);
    expect(chart.markers.length).toBe(2);
    fixture.destroy();
  });

  it('shows unknown instead of invented zeros when no history was captured', () => {
    report={
      ...report,commandTrackingSince:null,snapshotTrackingSince:null,lastSnapshotAt:null,
      summary:{...report.summary,brafurriesMembers:null,brafurriesDelta:null,
        coddyReach:null,coddyReachDelta:null,commandsExecuted:null},
      dailySnapshots:[],commandUsage:[],topCommands:[]
    };
    service.getMetrics.and.returnValue(of(report));
    const fixture=TestBed.createComponent(AdminMetricsComponent);
    fixture.detectChanges();
    const text=fixture.nativeElement.textContent as string;
    expect(text).toContain('Ainda não há medição confiável');
    expect(text).toContain('Sem eventos de comandos registrados');
    expect(text).toContain('Sem base histórica comparável');
    expect(fixture.componentInstance.charts.members.count).toBe(0);
    fixture.destroy();
  });
});
