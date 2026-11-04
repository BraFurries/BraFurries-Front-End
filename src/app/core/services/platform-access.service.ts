import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PlatformAccess {
  enabled: boolean;
  owner: boolean;
  permissions: string[];
}

export interface PlatformApprovedPerson {
  userId: number;
  name: string;
  permissions: string[];
}

export interface PlatformEligiblePerson {
  userId: number;
  name: string;
}

export interface PlatformTeamRole {
  roleId: number;
  name: string;
  active: boolean;
  permissions: string[];
}

/** Platform areas, independent of Community tenant authorization. The live catalog comes from API. */
export const PLATFORM_PERMISSIONS = [
  { code: 'ARTWORKS_MANAGE', label: 'Gerenciar artes', description: 'Cadastrar obras, artistas e valores de criação.' },
  { code: 'CONTRACTS_MANAGE', label: 'Gerenciar contratos', description: 'Cadastrar modelos e consultar contratos privados.' },
  { code: 'SUPPLIERS_MANAGE', label: 'Gerenciar fornecedores', description: 'Cadastrar fornecedores e lotes de produção.' },
  { code: 'PRODUCTS_MANAGE', label: 'Gerenciar produtos', description: 'Cadastrar produtos, custos e preços.' },
  { code: 'SALES_MANAGE', label: 'Gerenciar vendas', description: 'Registrar vendas, cancelamentos e estornos.' },
  { code: 'FINANCE_VIEW', label: 'Visualizar financeiro', description: 'Consultar receitas, custos, repasses e saldos.' },
  { code: 'SETTLEMENTS_MANAGE', label: 'Realizar fechamentos', description: 'Apurar e aprovar fechamentos mensais.' },
  { code: 'PAYMENTS_RECORD', label: 'Registrar pagamentos', description: 'Registrar baixas e comprovantes, sem transferir dinheiro.' },
  { code: 'CASHFLOW_MANAGE', label: 'Gerenciar caixa e aportes', description: 'Registrar receitas, despesas, aportes e seus estornos, com FINANCE_VIEW.' },
  { code: 'PARTNERS_MANAGE', label: 'Gerenciar parceiros', description: 'Consultar, cadastrar, editar e remover parcerias, incluindo links e representantes.' }
] as const;

export type PlatformPermissionCode = string;

export interface PlatformPermissionDefinition {
  code: PlatformPermissionCode;
  area: string;
  label: string;
  description: string;
}

@Injectable({ providedIn: 'root' })
export class PlatformAccessService {
  private readonly baseUrl = `${environment.apiBaseUrl}/user/me/platform-access`;

  constructor(private readonly http: HttpClient) {}

  myAccess(): Observable<PlatformAccess> {
    return this.http.get<PlatformAccess>(`${this.baseUrl}/me`);
  }

  permissionCatalog(): Observable<PlatformPermissionDefinition[]> {
    return this.http.get<PlatformPermissionDefinition[]>(`${this.baseUrl}/permissions`);
  }

  approvedPeople(): Observable<PlatformApprovedPerson[]> {
    return this.http.get<PlatformApprovedPerson[]>(`${this.baseUrl}/people`);
  }

  eligiblePeople(search: string): Observable<PlatformEligiblePerson[]> {
    return this.http.get<PlatformEligiblePerson[]>(`${this.baseUrl}/people/search`, {
      params: { search }
    });
  }

  teamRoles(): Observable<PlatformTeamRole[]> {
    return this.http.get<PlatformTeamRole[]>(`${this.baseUrl}/team-roles`);
  }

  approve(userId: number): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/people/${userId}`, {});
  }

  revoke(userId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/people/${userId}`);
  }

  personPermission(userId: number, code: PlatformPermissionCode, granted: boolean): Observable<void> {
    const url = `${this.baseUrl}/people/${userId}/permissions/${code}`;
    return granted ? this.http.put<void>(url, {}) : this.http.delete<void>(url);
  }

  rolePermission(roleId: number, code: PlatformPermissionCode, granted: boolean): Observable<void> {
    const url = `${this.baseUrl}/team-roles/${roleId}/permissions/${code}`;
    return granted ? this.http.put<void>(url, {}) : this.http.delete<void>(url);
  }
}
