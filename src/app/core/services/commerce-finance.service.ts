import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface FinanceCreated { id: number; }
export interface CommerceBatchForSale {
  batchId: number;
  productId: number;
  productName: string;
  sku: string;
  suggestedPrice: number;
  availableUnits: number;
}
export interface SaleLineInput {
  batchId: number;
  quantity: number;
  unitPrice: number;
}
export interface CreateCommerceSale {
  requestKey: string;
  channel: 'EVENT' | 'DIRECT' | 'ONLINE' | 'OTHER';
  externalReference: string | null;
  buyerLabel: string | null;
  soldOn: string;
  notes: string | null;
  items: SaleLineInput[];
  paymentMethod?: string;
  processingProvider?: string | null;
  processingFeePercent?: number;
  processingFeeFixed?: number;
}
export type CommerceOrderStatus = 'OPEN' | 'READY' | 'DELIVERED' | 'CANCELLED';
export interface CommerceOrder {
  id: number; buyerLabel: string; channel: string;
  externalReference: string | null; orderedOn: string;
  expectedDeliveryOn: string | null; status: CommerceOrderStatus;
  totalAmount: number; paidAmount: number;
  notes: string | null; readyAt: string | null;
  deliveredOn: string | null; cancellationReason: string | null;
}
export interface CommerceOrderProductChoice {
  id: number; name: string; suggestedPrice: number;
}
export interface CommerceOrderLineInput {
  productId: number | null; label: string; size: string | null;
  quantity: number; unitPrice: number;
}
export interface CreateCommerceOrder {
  requestKey: string; buyerLabel: string;
  channel: 'EVENT' | 'DIRECT' | 'ONLINE' | 'OTHER';
  externalReference: string | null; orderedOn: string;
  expectedDeliveryOn: string | null; notes: string | null;
  items: CommerceOrderLineInput[];
}
export interface CommerceOrderItem extends CommerceOrderLineInput {
  id: number; lineAmount: number;
}
export interface CommerceOrderPayment {
  id: number; eventKind: 'RECEIPT' | 'REVERSAL';
  originalEventId: number | null; amount: number;
  receivedOn: string; paymentMethod: string;
  externalReference: string | null; notes: string | null;
}
export interface OrderReceiptInput {
  requestKey: string; amount: number; receivedOn: string;
  paymentMethod: string; externalReference: string | null;
  notes: string | null;
}

export interface CommercePhysicalSale {
  id: number;
  channel: string;
  externalReference: string | null;
  buyerLabel: string | null;
  soldOn: string;
  status: 'CONFIRMED' | 'CANCELLED';
  grossAmount: number;
  paymentMethod?: string;
  processingProvider?: string | null;
  processingFeePercent?: number;
  processingFeeFixed?: number;
  processingFeeAmount?: number;
  netReceiptAmount?: number;
  cancellationReason: string | null;
  createdAt: string;
}
export interface CommerceSaleItem {
  id: number;
  productId: number;
  productName: string;
  batchId: number;
  quantity: number;
  unitPrice: number;
  lineGross: number;
}
export interface CommerceRoyaltyEvent {
  id: number;
  artistUserId: number;
  artistName: string;
  artworkId: number;
  contractId: number;
  periodYear: number;
  periodMonth: number;
  eventKind: 'SALE' | 'REVERSAL';
  royaltyMethod: string;
  contractRate: number | null;
  fixedUnit: number | null;
  allocation: number;
  basisAmount: number;
  amount: number;
  saleId: number;
  createdAt: string;
}
export interface CommerceStatement {
  id: number;
  artistUserId: number;
  artistName: string;
  periodYear: number;
  periodMonth: number;
  status: 'DRAFT' | 'APPROVED' | 'PARTIALLY_PAID' | 'PAID';
  totalAmount: number;
  paidAmount: number;
  createdAt: string;
  approvedAt: string | null;
}
export interface CommerceStatementItem {
  accrualId: number;
  amount: number;
  artworkId: number;
  contractId: number;
  royaltyMethod: string;
  eventKind: string;
  saleId: number;
}
export interface CommercePayment {
  id: number;
  amount: number;
  paidOn: string;
  externalReference: string;
  notes: string | null;
  createdAt: string;
}
export interface CreateCommercePayment {
  requestKey: string;
  amount: number;
  paidOn: string;
  externalReference: string;
  notes: string | null;
}

/**
 * BRL commerce API contracts; no conversion to Discord coins and no financial
 * business calculation in Front-End.
 */
export type CashMovementType = 'INCOME' | 'EXPENSE' | 'CONTRIBUTION';
export type ContributionSource = 'OWNER' | 'STAFF' | 'COMMUNITY_MEMBER' | 'EXTERNAL';
export type ContributionNature = 'NON_REPAYABLE' | 'REPAYABLE';

export interface CreateCashMovement {
  requestKey: string;
  movementType: CashMovementType;
  amount: number;
  occurredOn: string;
  category: string;
  description: string;
  counterpartyLabel: string;
  counterpartyUserId: number | null;
  contributorType: ContributionSource | null;
  contributionNature: ContributionNature | null;
  paymentMethod: string;
  externalReference: string | null;
  notes: string | null;
}
export interface CommerceCashMovement extends CreateCashMovement {
  id: number;
  eventKind: 'POSTED' | 'REVERSAL';
  reversalOfId: number | null;
  signedAmount: number;
  reversalReason: string | null;
  createdAt: string;
}
export interface CommerceCashSummary {
  year: number;
  month: number;
  grossSales: number;
  processingFees: number;
  netSales: number;
  otherIncome: number;
  operatingExpenses: number;
  fundingNonRepayable: number;
  fundingRepayable: number;
  artistPayouts: number;
  netCashMovement: number;
}

@Injectable({ providedIn: 'root' })
export class CommerceFinanceService {
  private readonly base = `${environment.apiBaseUrl}/user/me/brafurries-commerce/finance`;
  private readonly ordersBase = `${environment.apiBaseUrl}/user/me/brafurries-commerce/orders`;

  constructor(private readonly http: HttpClient) {}

  availableBatches(): Observable<CommerceBatchForSale[]> {
    return this.http.get<CommerceBatchForSale[]>(`${this.base}/sales/available-batches`);
  }

  sales(): Observable<CommercePhysicalSale[]> {
    return this.http.get<CommercePhysicalSale[]>(`${this.base}/sales`);
  }

  saleItems(id: number): Observable<CommerceSaleItem[]> {
    return this.http.get<CommerceSaleItem[]>(`${this.base}/sales/${id}/items`);
  }

  createSale(sale: CreateCommerceSale): Observable<FinanceCreated> {
    return this.http.post<FinanceCreated>(`${this.base}/sales`, sale);
  }

  cancelSale(id: number, reason: string): Observable<void> {
    return this.http.post<void>(`${this.base}/sales/${id}/cancel`, { reason });
  }

  orderProductChoices(): Observable<CommerceOrderProductChoice[]> {
    return this.http.get<CommerceOrderProductChoice[]>(`${this.ordersBase}/product-choices`);
  }

  orders(): Observable<CommerceOrder[]> {
    return this.http.get<CommerceOrder[]>(this.ordersBase);
  }

  createOrder(order: CreateCommerceOrder): Observable<FinanceCreated> {
    return this.http.post<FinanceCreated>(this.ordersBase,order);
  }

  orderItems(id: number): Observable<CommerceOrderItem[]> {
    return this.http.get<CommerceOrderItem[]>(`${this.ordersBase}/${id}/items`);
  }

  transitionOrder(id: number, status: CommerceOrderStatus,
                  deliveredOn: string | null, reason: string | null): Observable<void> {
    return this.http.post<void>(`${this.ordersBase}/${id}/status`,
      { status, deliveredOn, reason });
  }

  orderPayments(id: number): Observable<CommerceOrderPayment[]> {
    return this.http.get<CommerceOrderPayment[]>(`${this.ordersBase}/${id}/payments`);
  }

  receiveOrderPayment(id: number, input: OrderReceiptInput): Observable<FinanceCreated> {
    return this.http.post<FinanceCreated>(`${this.ordersBase}/${id}/payments`,input);
  }

  reverseOrderPayment(id: number, paymentId: number,
                      requestKey: string, reversedOn: string, reason: string): Observable<FinanceCreated> {
    return this.http.post<FinanceCreated>(`${this.ordersBase}/${id}/payments/${paymentId}/reverse`,
      { requestKey,reversedOn,reason });
  }

  royalties(year: number, month: number): Observable<CommerceRoyaltyEvent[]> {
    return this.http.get<CommerceRoyaltyEvent[]>(`${this.base}/royalties`,
      { params: { year: String(year), month: String(month) } });
  }

  statements(year: number, month: number): Observable<CommerceStatement[]> {
    return this.http.get<CommerceStatement[]>(`${this.base}/statements`,
      { params: { year: String(year), month: String(month) } });
  }

  createStatement(artistUserId: number, year: number, month: number): Observable<FinanceCreated> {
    return this.http.post<FinanceCreated>(`${this.base}/statements`,
      { artistUserId, year, month });
  }

  statementItems(id: number): Observable<CommerceStatementItem[]> {
    return this.http.get<CommerceStatementItem[]>(`${this.base}/statements/${id}/items`);
  }

  approveStatement(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/statements/${id}/approve`, {});
  }

  discardStatement(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/statements/${id}/discard`, {});
  }

  payments(id: number): Observable<CommercePayment[]> {
    return this.http.get<CommercePayment[]>(`${this.base}/statements/${id}/payments`);
  }

  recordPayment(id: number, payment: CreateCommercePayment): Observable<FinanceCreated> {
    return this.http.post<FinanceCreated>(`${this.base}/statements/${id}/payments`, payment);
  }

  cashMovements(year: number, month: number): Observable<CommerceCashMovement[]> {
    return this.http.get<CommerceCashMovement[]>(`${this.base}/cash-movements`, {
      params: { year: String(year), month: String(month) }
    });
  }

  cashSummary(year: number, month: number): Observable<CommerceCashSummary> {
    return this.http.get<CommerceCashSummary>(`${this.base}/cash-movements/summary`, {
      params: { year: String(year), month: String(month) }
    });
  }

  createCashMovement(input: CreateCashMovement): Observable<FinanceCreated> {
    return this.http.post<FinanceCreated>(`${this.base}/cash-movements`,input);
  }

  reverseCashMovement(id: number, reason: string): Observable<FinanceCreated> {
    return this.http.post<FinanceCreated>(
      `${this.base}/cash-movements/${id}/reverse`,{reason}
    );
  }
}
