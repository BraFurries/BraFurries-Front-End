import { Component, Input, OnChanges } from '@angular/core';

export interface MetricMarker {
  x: number;
  y: number;
  value: number;
  date: string;
}

export interface MetricChart {
  segments: { points: string }[];
  markers: MetricMarker[];
  ticks: { value: number; y: number }[];
  count: number;
  min: number | null;
  max: number | null;
}

/** Shared SVG graph for real daily observations. Null gaps are prepared by its parent. */
@Component({
  selector: 'app-admin-metric-line-chart',
  standalone: false,
  templateUrl: './metric-line-chart.component.html'
})
export class AdminMetricLineChartComponent implements OnChanges {
  @Input({ required: true }) chart!: MetricChart;
  @Input({ required: true }) label = '';
  @Input() lineColor = '#7c3aed';
  @Input() unit = '';

  activePoint: MetricMarker | null = null;

  ngOnChanges(): void {
    // A changed period must not keep a tooltip from the previous data set.
    this.activePoint = null;
  }

  dateLabel(iso: string): string {
    const [year,month,day] = iso.slice(0,10).split('-');
    return day + '/' + month + '/' + year;
  }

  formatValue(value: number): string {
    return Math.round(value).toLocaleString('pt-BR');
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.chart?.markers.length) return;
    const bounds=(event.currentTarget as SVGSVGElement).getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x=(event.clientX-bounds.left)*640/bounds.width;
    const y=(event.clientY-bounds.top)*200/bounds.height;
    // Do not present readings when hovering the numeric Y-axis labels.
    if (x<66 || x>632 || y<12 || y>182) {
      this.activePoint = null;
      return;
    }
    this.activePoint=this.chart.markers.reduce((nearest,point)=>
      Math.abs(point.x-x)<Math.abs(nearest.x-x)?point:nearest);
  }

  tooltipX(point: MetricMarker): number {
    return Math.min(442,Math.max(78,point.x-82));
  }

  tooltipY(point: MetricMarker): number {
    return point.y>84 ? point.y-62 : point.y+14;
  }
}
