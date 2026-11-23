// lib/documentVault.ts
// Digital Document Upload & Pre-Verification Vault (FEAT-P1).
// Stores requirement attachments per (appointmentId, requirementKey) in a
// durable JSON-backed vault (.data/document-vault.json) with an in-memory
// fallback for tests, and writes audit entries via writeAudit.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { ApiError, type SessionUser } from '@/lib/http';
import { PUBLIC_ACTOR, userActor, writeAudit, type AuditActor } from '@/lib/audit';
import { syncRequirements, setRequirement } from '@/lib/appointments/service';
import { contactMatches } from '@/lib/appointments/public';
import { normalizeReference } from '@/lib/reference';

export const ALLOWED_DOCUMENT_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedDocumentMime = (typeof ALLOWED_DOCUMENT_MIMES)[number];

export const MAX_DOCUMENT_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

export type DocumentUploadedBy = 'PARISHIONER' | 'STAFF';
export type DocumentReviewStatus = 'UPLOADED' | 'PRE_VERIFIED' | 'NEEDS_RESUBMISSION';

export interface VaultDocument {
  id: string;
  appointmentId: string;
  referenceNumber: string;
  requirementKey: string;
  fileName: string;
  mimeType: AllowedDocumentMime;
  sizeBytes: number;
  dataUrl: string;
  uploadedBy: DocumentUploadedBy;
  uploadedAt: string;
  reviewStatus: DocumentReviewStatus;
  reviewerNote: string | null;
}

export interface DocumentUploadPayload {
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  dataUrl: string;
}

export interface UploadRequirementDocumentInput {
  appointmentId: string;
  referenceNumber?: string;
  requirementKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  dataUrl: string;
  uploadedBy: DocumentUploadedBy;
  actor?: SessionUser | AuditActor | null;
}

export interface ReviewRequirementDocumentInput {
  appointmentId: string;
  requirementKey: string;
  reviewStatus: 'PRE_VERIFIED' | 'NEEDS_RESUBMISSION';
  reviewerNote?: string | null;
  actor: SessionUser;
}

export interface MergedRequirementDocumentItem {
  key: string;
  label: string;
  isMet: boolean;
  verifiedAt: Date | null;
  document: {
    id: string;
    fileName: string;
    mimeType: AllowedDocumentMime;
    sizeBytes: number;
    dataUrl: string;
    uploadedBy: DocumentUploadedBy;
    uploadedAt: string;
    reviewStatus: DocumentReviewStatus;
    reviewerNote: string | null;
  } | null;
}

interface VaultStoreData {
  version: 1;
  documents: Record<string, VaultDocument>;
}

const DEFAULT_VAULT_PATH = path.join(process.cwd(), '.data', 'document-vault.json');

let memoryVault: Record<string, VaultDocument> = {};
let customVaultPath: string | null = null;
let forceInMemoryOnly = false;

function vaultCompositeKey(appointmentId: string, requirementKey: string): string {
  return `${appointmentId}::${requirementKey}`;
}

export function configureDocumentVault(options?: {
  vaultPath?: string | null;
  inMemoryOnly?: boolean;
  reset?: boolean;
}): void {
  if (options?.vaultPath !== undefined) {
    customVaultPath = options.vaultPath;
  }
  if (options?.inMemoryOnly !== undefined) {
    forceInMemoryOnly = options.inMemoryOnly;
  }
  if (options?.reset) {
    memoryVault = {};
    const targetPath = getVaultFilePath();
    if (targetPath && fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

function getVaultFilePath(): string | null {
  if (forceInMemoryOnly) return null;
  if (customVaultPath) return customVaultPath;
  if (process.env.DOCUMENT_VAULT_PATH) return process.env.DOCUMENT_VAULT_PATH;
  return DEFAULT_VAULT_PATH;
}

function readVaultStore(): Record<string, VaultDocument> {
  const filePath = getVaultFilePath();
  if (!filePath) {
    return { ...memoryVault };
  }
  try {
    if (!fs.existsSync(filePath)) {
      return { ...memoryVault };
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return { ...memoryVault };
    const parsed = JSON.parse(raw) as Partial<VaultStoreData>;
    if (parsed && parsed.documents && typeof parsed.documents === 'object') {
      memoryVault = { ...parsed.documents };
      return { ...memoryVault };
    }
    return { ...memoryVault };
  } catch {
    return { ...memoryVault };
  }
}

function writeVaultStore(documents: Record<string, VaultDocument>): void {
  memoryVault = { ...documents };
  const filePath = getVaultFilePath();
  if (!filePath) return;
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload: VaultStoreData = {
      version: 1,
      documents,
    };
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch {
    // Fallback to in-memory store if filesystem is read-only or unavailable
  }
}

function estimateBytesFromDataUrl(dataUrl: string): number {
  const trimmed = dataUrl.trim();
  const base64Match = trimmed.match(/^data:[^;]+;base64,(.+)$/i);
  if (base64Match) {
    const b64 = base64Match[1].replace(/\s/g, '');
    const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
    return Math.max(1, Math.floor((b64.length * 3) / 4) - padding);
  }
  return Math.max(1, Buffer.byteLength(trimmed, 'utf8'));
}

/**
 * Validate document upload metadata and content (MIME types, size up to 2MB, filename, dataUrl).
 */
export function validateDocumentPayload(payload: DocumentUploadPayload): {
  fileName: string;
  mimeType: AllowedDocumentMime;
  sizeBytes: number;
  dataUrl: string;
} {
  const fileName = (payload.fileName ?? '').trim();
  if (!fileName) {
    throw new ApiError(400, 'File name is required', 'INVALID_FILE_NAME');
  }
  if (fileName.length > 180) {
    throw new ApiError(400, 'File name must be at most 180 characters', 'INVALID_FILE_NAME');
  }

  const mimeType = (payload.mimeType ?? '').trim().toLowerCase() as AllowedDocumentMime;
  if (!(ALLOWED_DOCUMENT_MIMES as readonly string[]).includes(mimeType)) {
    throw new ApiError(
      400,
      'Unsupported file format. Please upload a PDF, JPG, PNG, or WEBP document.',
      'UNSUPPORTED_MIME_TYPE'
    );
  }

  const dataUrl = (payload.dataUrl ?? '').trim();
  if (!dataUrl) {
    throw new ApiError(400, 'Document content (dataUrl) is required', 'EMPTY_DOCUMENT');
  }
  if (!dataUrl.startsWith('data:') && !dataUrl.startsWith('simulated://')) {
    throw new ApiError(
      400,
      'Document payload must be a valid base64 data URL or simulated scan preview.',
      'INVALID_DATA_URL'
    );
  }

  const computedBytes = estimateBytesFromDataUrl(dataUrl);
  const sizeBytes =
    typeof payload.sizeBytes === 'number' && Number.isFinite(payload.sizeBytes)
      ? Math.round(payload.sizeBytes)
      : computedBytes;

  if (sizeBytes <= 0) {
    throw new ApiError(400, 'Uploaded document cannot be empty', 'EMPTY_DOCUMENT');
  }

  if (sizeBytes > MAX_DOCUMENT_SIZE_BYTES || computedBytes > MAX_DOCUMENT_SIZE_BYTES) {
    throw new ApiError(
      400,
      'File size exceeds the maximum limit of 2 MB. Please compress or resize the scan.',
      'DOCUMENT_TOO_LARGE'
    );
  }

  return {
    fileName,
    mimeType,
    sizeBytes,
    dataUrl,
  };
}

/**
 * Build a lightweight sample/declaratory digital copy data URL when a parishioner
 * uses the quick-attach declaratory option.
 */
export function buildSampleDocumentPayload(requirementKey: string, referenceNumber: string): {
  fileName: string;
  mimeType: AllowedDocumentMime;
  sizeBytes: number;
  dataUrl: string;
} {
  const safeKey = requirementKey.replace(/[^a-z0-9_-]/gi, '_');
  const content = `DECLARATORY DIGITAL REQUIREMENT COPY\nReference: ${referenceNumber}\nRequirement: ${requirementKey}\nSubmitted to Immaculate Conception Cathedral Parish (Urdaneta City)`;
  const base64 = Buffer.from(content, 'utf8').toString('base64');
  const dataUrl = `data:application/pdf;base64,${base64}`;
  return {
    fileName: `${referenceNumber}-${safeKey}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: Buffer.byteLength(content, 'utf8'),
    dataUrl,
  };
}

function toAuditActor(actor?: SessionUser | AuditActor | null): AuditActor {
  if (!actor) return PUBLIC_ACTOR;
  if ('type' in actor) return actor;
  return userActor(actor);
}

/**
 * List all uploaded documents in the vault for a single appointment.
 */
export async function listAppointmentDocuments(appointmentId: string): Promise<VaultDocument[]> {
  const store = readVaultStore();
  return Object.values(store)
    .filter((doc) => doc.appointmentId === appointmentId)
    .sort((a, b) => a.requirementKey.localeCompare(b.requirementKey));
}

/**
 * Upload or replace a digital requirement document for (appointmentId, requirementKey).
 * Resets reviewStatus to UPLOADED and records a `requirement.document_uploaded` audit row.
 */
export async function uploadRequirementDocument(
  input: UploadRequirementDocumentInput
): Promise<VaultDocument> {
  const validated = validateDocumentPayload({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    dataUrl: input.dataUrl,
  });

  const requirementKey = input.requirementKey.trim();
  if (!requirementKey) {
    throw new ApiError(400, 'Requirement key is required');
  }

  const appt = await prisma.appointment.findFirst({
    where: { id: input.appointmentId, deletedAt: null },
    select: {
      id: true,
      referenceNumber: true,
      sacramentType: true,
      status: true,
    },
  });

  const referenceNumber = appt?.referenceNumber ?? input.referenceNumber ?? 'UNKNOWN';
  if (!appt && !input.referenceNumber) {
    throw new ApiError(404, 'Appointment not found');
  }
  if (appt?.status === 'CANCELLED') {
    throw new ApiError(409, 'Documents cannot be uploaded for a cancelled appointment');
  }

  let requirementRowId = `${input.appointmentId}:${requirementKey}`;
  if (appt) {
    await prisma.$transaction(async (tx) => {
      await syncRequirements(tx, appt.id, appt.sacramentType);
      const reqRow = await tx.appointmentRequirement.findUnique({
        where: { appointmentId_key: { appointmentId: appt.id, key: requirementKey } },
      });
      if (!reqRow) {
        throw new ApiError(404, `Requirement "${requirementKey}" does not exist for this sacrament`);
      }
      requirementRowId = reqRow.id;
    });
  }

  const store = readVaultStore();
  const compositeKey = vaultCompositeKey(input.appointmentId, requirementKey);
  const existing = store[compositeKey] ?? null;

  const doc: VaultDocument = {
    id: existing?.id ?? crypto.randomUUID(),
    appointmentId: input.appointmentId,
    referenceNumber,
    requirementKey,
    fileName: validated.fileName,
    mimeType: validated.mimeType,
    sizeBytes: validated.sizeBytes,
    dataUrl: validated.dataUrl,
    uploadedBy: input.uploadedBy,
    uploadedAt: new Date().toISOString(),
    reviewStatus: 'UPLOADED',
    reviewerNote: null,
  };

  store[compositeKey] = doc;
  writeVaultStore(store);

  await writeAudit(prisma, {
    actor: toAuditActor(input.actor),
    action: 'requirement.document_uploaded',
    entityType: 'AppointmentRequirement',
    entityId: requirementRowId,
    before: existing
      ? {
          appointmentId: existing.appointmentId,
          requirementKey: existing.requirementKey,
          fileName: existing.fileName,
          mimeType: existing.mimeType,
          sizeBytes: existing.sizeBytes,
          reviewStatus: existing.reviewStatus,
        }
      : null,
    after: {
      appointmentId: doc.appointmentId,
      referenceNumber: doc.referenceNumber,
      requirementKey: doc.requirementKey,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      uploadedBy: doc.uploadedBy,
      reviewStatus: doc.reviewStatus,
    },
  });

  return doc;
}

/**
 * Staff (ADMIN) reviews an uploaded requirement document:
 * - Marks it `PRE_VERIFIED` or `NEEDS_RESUBMISSION` with optional `reviewerNote`
 * - Audits `requirement.document_reviewed`
 * - Automatically updates `AppointmentRequirement.isMet = true` via `setRequirement` when `PRE_VERIFIED`
 *   (and `isMet = false` when marked `NEEDS_RESUBMISSION`).
 */
export async function reviewRequirementDocument(
  input: ReviewRequirementDocumentInput
): Promise<VaultDocument> {
  if (input.actor.role !== 'ADMIN') {
    throw new ApiError(403, 'Only administrators can pre-verify requirement documents');
  }

  const requirementKey = input.requirementKey.trim();
  const store = readVaultStore();
  const compositeKey = vaultCompositeKey(input.appointmentId, requirementKey);
  const existing = store[compositeKey];

  if (!existing) {
    throw new ApiError(404, 'No uploaded document found for this requirement');
  }

  const trimmedNote = input.reviewerNote?.trim() || null;
  if (input.reviewStatus === 'NEEDS_RESUBMISSION' && !trimmedNote) {
    throw new ApiError(
      400,
      'Please provide a reviewer note explaining why the document needs resubmission'
    );
  }

  const updatedDoc: VaultDocument = {
    ...existing,
    reviewStatus: input.reviewStatus,
    reviewerNote: trimmedNote,
  };

  store[compositeKey] = updatedDoc;
  writeVaultStore(store);

  let requirementRowId = `${input.appointmentId}:${requirementKey}`;
  const reqRow = await prisma.appointmentRequirement.findUnique({
    where: {
      appointmentId_key: {
        appointmentId: input.appointmentId,
        key: requirementKey,
      },
    },
  });
  if (reqRow) {
    requirementRowId = reqRow.id;
  }

  await writeAudit(prisma, {
    actor: userActor(input.actor),
    action: 'requirement.document_reviewed',
    entityType: 'AppointmentRequirement',
    entityId: requirementRowId,
    before: {
      appointmentId: existing.appointmentId,
      requirementKey: existing.requirementKey,
      reviewStatus: existing.reviewStatus,
      reviewerNote: existing.reviewerNote,
    },
    after: {
      appointmentId: updatedDoc.appointmentId,
      requirementKey: updatedDoc.requirementKey,
      reviewStatus: updatedDoc.reviewStatus,
      reviewerNote: updatedDoc.reviewerNote,
    },
    reason: trimmedNote,
  });

  if (input.reviewStatus === 'PRE_VERIFIED') {
    await setRequirement(input.actor, input.appointmentId, requirementKey, true);
  } else if (input.reviewStatus === 'NEEDS_RESUBMISSION' && reqRow?.isMet) {
    await setRequirement(input.actor, input.appointmentId, requirementKey, false);
  }

  return updatedDoc;
}

/**
 * Resolve an appointment for a public/parishioner document request using either:
 * 1) reference + matching phone/email contact, OR
 * 2) an authenticated parishioner session that owns the booking (createdById or email match).
 */
export async function resolvePublicDocumentAppointment(params: {
  reference: string;
  contact?: string | null;
  sessionUser?: SessionUser | null;
}) {
  const normalizedRef = normalizeReference(params.reference);
  const appt = await prisma.appointment.findFirst({
    where: { referenceNumber: normalizedRef, deletedAt: null },
    include: {
      requirements: { orderBy: { label: 'asc' } },
    },
  });

  const NOT_FOUND_MSG =
    'We could not find a booking with those details. Check the reference number and the phone or email you used.';

  if (!appt) {
    throw new ApiError(404, NOT_FOUND_MSG);
  }

  const user = params.sessionUser;
  const ownsByAccount =
    !!user &&
    (appt.createdById === user.id ||
      (!!appt.participantEmail &&
        appt.participantEmail.trim().toLowerCase() === user.email.trim().toLowerCase()));

  const matchesContact =
    !!params.contact && params.contact.trim().length > 0 && contactMatches(params.contact, appt);

  if (!ownsByAccount && !matchesContact) {
    throw new ApiError(404, NOT_FOUND_MSG);
  }

  // Ensure requirements checklist rows exist
  if (appt.requirements.length === 0) {
    await prisma.$transaction(async (tx) => {
      await syncRequirements(tx, appt.id, appt.sacramentType);
    });
  }

  const requirements = await prisma.appointmentRequirement.findMany({
    where: { appointmentId: appt.id },
    orderBy: { label: 'asc' },
  });

  return { appointment: appt, requirements };
}

/**
 * Merge requirement checklist rows with any uploaded vault documents.
 */
export async function listMergedRequirementsWithDocuments(
  appointmentId: string,
  requirements?: { key: string; label: string; isMet: boolean; verifiedAt: Date | null }[]
): Promise<MergedRequirementDocumentItem[]> {
  const reqRows =
    requirements ??
    (await prisma.appointmentRequirement.findMany({
      where: { appointmentId },
      orderBy: { label: 'asc' },
    }));

  const docs = await listAppointmentDocuments(appointmentId);
  const byKey = new Map(docs.map((d) => [d.requirementKey, d]));

  return reqRows.map((req) => {
    const doc = byKey.get(req.key) ?? null;
    return {
      key: req.key,
      label: req.label,
      isMet: req.isMet,
      verifiedAt: req.verifiedAt,
      document: doc
        ? {
            id: doc.id,
            fileName: doc.fileName,
            mimeType: doc.mimeType,
            sizeBytes: doc.sizeBytes,
            dataUrl: doc.dataUrl,
            uploadedBy: doc.uploadedBy,
            uploadedAt: doc.uploadedAt,
            reviewStatus: doc.reviewStatus,
            reviewerNote: doc.reviewerNote,
          }
        : null,
    };
  });
}
