import { Component, OnInit } from '@angular/core';
import { UserService } from '../../../core/services/user.service';
import { DashboardResponse } from '../../../shared/models/api/dashboard/dashboardResponse';

@Component({
  selector: 'app-inicio',
  standalone: false,
  templateUrl: './inicio.component.html',
  styleUrl: './inicio.component.scss'
})
export class InicioComponent implements OnInit {
  activePanelView: 'global' | 'server' | 'user' = 'server';
  dashboardData: DashboardResponse | null = null;
  leftColumnList: any[] = [];
  leftColumnTitle: string = '';
  rightColumnList: any[] = [];
  rightColumnTitle: string = '';
  selectedServerIndex = 0;
  isLoading = true;
  userName: string = 'visitante';
  userProfileImageUrl: string | null = null;
  userInitial: string = 'V';
  showDiscordWarning: boolean = true;

  constructor(private userService: UserService) {}

  ngOnInit(): void {
    const user = this.userService.getUser();
    
    if (user) {
      this.userName = user.name || (user as any).displayName || 'visitante';
      this.userProfileImageUrl = user.profileImageUrl || null;
      this.userInitial = this.userName !== 'visitante' ? this.userName.charAt(0).toUpperCase() : 'V';
    } else if (typeof window !== 'undefined' && window.localStorage) {
      // Fallback para caso haja um objeto salvo diretamente na chave "user"
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const parsedUser = JSON.parse(userStr);
          this.userName = parsedUser.name || parsedUser.displayName || parsedUser.username || 'visitante';
          this.userProfileImageUrl = parsedUser.profileImageUrl || null;
          this.userInitial = this.userName !== 'visitante' ? this.userName.charAt(0).toUpperCase() : 'V';
        } catch (e) {
          console.error('Erro ao analisar user do localStorage', e);
        }
      }
    }
    
    if (typeof window !== 'undefined' && window.localStorage) {
      this.showDiscordWarning = localStorage.getItem('hideDiscordWarning') !== 'true';
    }
    
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.isLoading = true;
    this.userService.getDashboardData().subscribe({
      next: (data) => {
        this.dashboardData = data;
        
        const events = (data.events || []).sort((a: any, b: any) => new Date(a.startingDatetime).getTime() - new Date(b.startingDatetime).getTime());
        const meets = (data.meets || []).sort((a: any, b: any) => new Date(a.startingDatetime).getTime() - new Date(b.startingDatetime).getTime());
        
        if (events.length >= meets.length) {
          this.leftColumnList = events;
          this.leftColumnTitle = 'Eventos';
          this.rightColumnList = meets;
          this.rightColumnTitle = 'Meets';
        } else {
          this.leftColumnList = meets;
          this.leftColumnTitle = 'Meets';
          this.rightColumnList = events;
          this.rightColumnTitle = 'Eventos';
        }

        if (data.servers && data.servers.length > 0) {
          this.activePanelView = 'server';
        } else {
          this.activePanelView = 'user';
        }

        this.isLoading = false;
      },
      error: (err) => {
        console.error('Erro ao carregar os dados do dashboard', err);
        this.isLoading = false;
      }
    });
  }

  togglePanelView(view: 'global' | 'server' | 'user') {
    if (this.activePanelView !== view && view === 'server') {
      this.selectedServerIndex = 0;
    }
    this.activePanelView = view;
  }

  onServerChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.selectedServerIndex = Number(target.value);
  }

  isServerDropdownOpen = false;

  selectServer(index: number) {
    this.selectedServerIndex = index;
    this.isServerDropdownOpen = false;
  }

  getDisplayValue(value: any): string | number {
    return value !== '' && value != null ? value : '-';
  }

  formatEventDate(start: string, end?: string): string {
    if (!start) return '';
    const startDate = new Date(start);
    const startDay = String(startDate.getDate()).padStart(2, '0');
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const startMonth = months[startDate.getMonth()];
    
    if (end) {
      const endDate = new Date(end);
      const endDay = String(endDate.getDate()).padStart(2, '0');
      
      if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear() && startDate.getDate() !== endDate.getDate()) {
        return `${startDay}-${endDay} de ${startMonth}`;
      } else if (startDate.getMonth() !== endDate.getMonth() || startDate.getFullYear() !== endDate.getFullYear()) {
        const endMonth = months[endDate.getMonth()];
        return `${startDay} de ${startMonth} a ${endDay} de ${endMonth}`;
      }
    }
    
    return `${startDay} de ${startMonth}`;
  }

  dismissDiscordWarning(): void {
    this.showDiscordWarning = false;
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('hideDiscordWarning', 'true');
    }
  }
}
