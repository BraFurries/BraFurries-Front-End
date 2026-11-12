import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CreatedCommerceEntity { id: number; }
export interface CommerceContractTemplate {
  id: number; name: string; description: string | null; fullText: string | null; modality: string;
  royaltyMethod: string; royaltyPercent: number | null; royaltyFixedAmount: number | null; active: boolean;
}
export interface CommerceArtist { id: number; name: string; }
export interface CommerceArtwork {
  id: number; title: string; description: string | null; artistUserId: number;
  artistName: string; creationCost: number; status: string;
}
export interface CommerceArtworkFile {
  id: number; artworkId: number;
  kind: 'SOURCE' | 'PRINT_READY' | 'EXPORT' | 'REFERENCE';
  originalName: string; extension: string; mediaType: string;
  description: string | null; sha256: string; sizeBytes: number;
  status: 'ACTIVE' | 'ARCHIVED'; uploadedByUserId: number;
  createdAt: string; archivedAt: string | null;
}

export interface CommerceSupplierOption { id: number; name: string; }
export interface CommerceSupplier {
  id: number; name: string; contactName: string | null; email: string | null;
  phone: string | null; notes: string | null; active: boolean;
}
export interface CommerceProduct {
  id: number; sku: string; name: string; description: string | null;
  estimatedUnitCost: number; suggestedPrice: number; active: boolean;
  preferredSupplierId: number | null; preferredSupplierName: string | null;
}
export interface CommerceBatch {
  id: number; productId: number; productName: string; supplierId: number; supplierName: string;
  quantity: number; unitCost: number; additionalCost: number; totalCost: number;
  producedOn: string; reference: string | null;
}
export interface CommerceProductArtwork {
  artworkId: number; title: string; royaltyAllocationPercent: number | null;
}
export interface CommerceSignedAgreement {
  id: number; artworkId: number; templateId: number; artistUserId: number;
  modality: string; royaltyMethod: string; royaltyPercent: number | null;
  royaltyFixedAmount: number | null; oneTimeAmount: number;
  effectiveFrom: string; effectiveUntil: string | null;
  sha256: string; sizeBytes: number; status: 'ACTIVE' | 'TERMINATED';
}
export interface CreateTemplateInput {
  name: string; description: string | null; fullText: string; modality: string;
  royaltyMethod: string; royaltyPercent: number | null; royaltyFixedAmount: number | null;
}
export interface ContractPartyInput {
  legalName: string; document: string; address: string; representative: string | null;
}
export interface PrepareContractInput {
  templateId: number;
  effectiveFrom: string; effectiveUntil: string | null; oneTimeAmount: number;
  contractor: ContractPartyInput; artist: ContractPartyInput;
}
export interface CommerceContractPreparation {
  id: number; artworkId: number; templateId: number; artistUserId: number;
  templateName: string; status: 'PENDING' | 'SIGNED' | 'CANCELLED';
  signedContractId: number | null; effectiveFrom: string; effectiveUntil: string | null;
  createdAt: string; completedAt: string | null;
}
export interface CreateArtworkInput {
  title: string; description: string | null; artistUserId: number; creationCost: number;
}
export interface CreateSupplierInput {
  name: string; contactName: string | null; email: string | null;
  phone: string | null; notes: string | null;
}
export interface CreateProductInput {
  sku: string; name: string; description: string | null;
  estimatedUnitCost: number; suggestedPrice: number; preferredSupplierId: number | null;
}
export interface CommerceBatchRevision {
  id: number; beforeJson: string; afterJson: string; reason: string;
  actorUserId: number; createdAt: string;
}
export interface CreateBatchInput {
  productId: number; supplierId: number; quantity: number; unitCost: number;
  additionalCost: number; producedOn: string; reference: string | null;
}

@Injectable({ providedIn: 'root' })
export class CommerceCatalogService {
  private readonly base = `${environment.apiBaseUrl}/user/me/brafurries-commerce/catalog`;

  constructor(private readonly http: HttpClient) {}

  templates(): Observable<CommerceContractTemplate[]> {
    return this.http.get<CommerceContractTemplate[]>(`${this.base}/contract-templates`);
  }

  createTemplate(input: CreateTemplateInput): Observable<CreatedCommerceEntity> {
    return this.http.post<CreatedCommerceEntity>(`${this.base}/contract-templates`,input);
  }

  artworks(): Observable<CommerceArtwork[]> {
    return this.http.get<CommerceArtwork[]>(`${this.base}/artworks`);
  }

  searchArtists(search: string): Observable<CommerceArtist[]> {
    return this.http.get<CommerceArtist[]>(`${this.base}/artists/search`, {
      params: { search }
    });
  }

  createArtwork(input: CreateArtworkInput): Observable<CreatedCommerceEntity> {
    return this.http.post<CreatedCommerceEntity>(`${this.base}/artworks`,input);
  }


  updateArtwork(id: number, input: CreateArtworkInput): Observable<void> {
    return this.http.put<void>(`${this.base}/artworks/${id}`,input);
  }

  setArtworkArchived(id: number, archived: boolean): Observable<void> {
    return this.http.post<void>(`${this.base}/artworks/${id}/archive`,{archived});
  }

  deleteArtwork(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/artworks/${id}`);
  }

  updateTemplate(id: number,input: CreateTemplateInput): Observable<void> {
    return this.http.put<void>(`${this.base}/contract-templates/${id}`,input);
  }

  setTemplateActive(id: number,active: boolean): Observable<void> {
    return this.http.post<void>(`${this.base}/contract-templates/${id}/status`,{active});
  }

  deleteTemplate(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/contract-templates/${id}`);
  }

  updateSupplier(id: number,input: CreateSupplierInput): Observable<void> {
    return this.http.put<void>(`${this.base}/suppliers/${id}`,input);
  }

  setSupplierActive(id: number,active: boolean): Observable<void> {
    return this.http.post<void>(`${this.base}/suppliers/${id}/status`,{active});
  }

  deleteSupplier(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/suppliers/${id}`);
  }

  updateProduct(id: number,input: CreateProductInput): Observable<void> {
    return this.http.put<void>(`${this.base}/products/${id}`,input);
  }

  setProductActive(id: number,active: boolean): Observable<void> {
    return this.http.post<void>(`${this.base}/products/${id}/status`,{active});
  }

  deleteProduct(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/products/${id}`);
  }

  unlinkArtwork(productId: number,artworkId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/products/${productId}/artworks/${artworkId}`);
  }

  artworkFiles(artworkId: number): Observable<CommerceArtworkFile[]> {
    return this.http.get<CommerceArtworkFile[]>(`${this.base}/artworks/${artworkId}/files`);
  }

  uploadArtworkFile(artworkId: number, kind: CommerceArtworkFile['kind'],
                    description: string | null, file: File): Observable<CreatedCommerceEntity> {
    const form = new FormData();
    form.append('kind',kind);
    if (description) form.append('description',description);
    form.append('file',file,file.name);
    return this.http.post<CreatedCommerceEntity>(
      `${this.base}/artworks/${artworkId}/files`,form);
  }

  downloadArtworkFile(artworkId: number, fileId: number): Observable<Blob> {
    return this.http.get(`${this.base}/artworks/${artworkId}/files/${fileId}/download`,
      { responseType: 'blob' });
  }

  archiveArtworkFile(artworkId: number, fileId: number): Observable<void> {
    return this.http.post<void>(
      `${this.base}/artworks/${artworkId}/files/${fileId}/archive`,{});
  }

  suppliers(): Observable<CommerceSupplier[]> {
    return this.http.get<CommerceSupplier[]>(`${this.base}/suppliers`);
  }

  createSupplier(input: CreateSupplierInput): Observable<CreatedCommerceEntity> {
    return this.http.post<CreatedCommerceEntity>(`${this.base}/suppliers`,input);
  }

  supplierChoices(): Observable<CommerceSupplierOption[]> {
    return this.http.get<CommerceSupplierOption[]>(`${this.base}/suppliers/choices`);
  }

  products(): Observable<CommerceProduct[]> {
    return this.http.get<CommerceProduct[]>(`${this.base}/products`);
  }

  createProduct(input: CreateProductInput): Observable<CreatedCommerceEntity> {
    return this.http.post<CreatedCommerceEntity>(`${this.base}/products`,input);
  }

  productArtworks(productId: number): Observable<CommerceProductArtwork[]> {
    return this.http.get<CommerceProductArtwork[]>(`${this.base}/products/${productId}/artworks`);
  }

  linkArtwork(productId: number, artworkId: number, royaltyAllocationPercent: number | null): Observable<void> {
    return this.http.put<void>(`${this.base}/products/${productId}/artworks/${artworkId}`,{
      royaltyAllocationPercent
    });
  }

  productionBatches(): Observable<CommerceBatch[]> {
    return this.http.get<CommerceBatch[]>(`${this.base}/production-batches`);
  }

  createProductionBatch(input: CreateBatchInput): Observable<CreatedCommerceEntity> {
    return this.http.post<CreatedCommerceEntity>(`${this.base}/production-batches`,input);
  }

  correctProductionBatch(id: number,input: CreateBatchInput,reason: string): Observable<void> {
    return this.http.put<void>(`${this.base}/production-batches/${id}`,{data:input,reason});
  }

  productionBatchHistory(id: number): Observable<CommerceBatchRevision[]> {
    return this.http.get<CommerceBatchRevision[]>(
      `${this.base}/production-batches/${id}/revisions`
    );
  }

  contracts(artworkId: number): Observable<CommerceSignedAgreement[]> {
    return this.http.get<CommerceSignedAgreement[]>(`${this.base}/artworks/${artworkId}/contracts`);
  }

  contractPreparations(artworkId: number): Observable<CommerceContractPreparation[]> {
    return this.http.get<CommerceContractPreparation[]>(
      `${this.base}/artworks/${artworkId}/contract-preparations`
    );
  }

  prepareContract(artworkId: number,input: PrepareContractInput): Observable<CreatedCommerceEntity> {
    return this.http.post<CreatedCommerceEntity>(
      `${this.base}/artworks/${artworkId}/contract-preparations`,input
    );
  }

  downloadPreparation(artworkId: number,preparationId: number): Observable<Blob> {
    return this.http.get(
      `${this.base}/artworks/${artworkId}/contract-preparations/${preparationId}/download`,
      { responseType:'blob' }
    );
  }

  uploadSignedPreparation(artworkId: number,preparationId: number,file: File): Observable<CreatedCommerceEntity> {
    const body = new FormData();
    body.append('reviewed','true');
    body.append('file',file,file.name);
    return this.http.post<CreatedCommerceEntity>(
      `${this.base}/artworks/${artworkId}/contract-preparations/${preparationId}/signed`,body
    );
  }

  cancelPreparation(artworkId: number,preparationId: number): Observable<void> {
    return this.http.post<void>(
      `${this.base}/artworks/${artworkId}/contract-preparations/${preparationId}/cancel`,{}
    );
  }

  downloadContract(artworkId: number, contractId: number): Observable<Blob> {
    return this.http.get(
      `${this.base}/artworks/${artworkId}/contracts/${contractId}/download`,
      { responseType: 'blob' }
    );
  }

  discardUnusedTestContract(artworkId: number, contractId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/artworks/${artworkId}/contracts/${contractId}/unused-test`
    );
  }

  terminateContract(artworkId: number, contractId: number): Observable<void> {
    return this.http.post<void>(
      `${this.base}/artworks/${artworkId}/contracts/${contractId}/terminate`,{}
    );
  }
}
