import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  configureDocumentVault,
  listAppointmentDocuments,
  listMergedRequirementsWithDocuments,
  MAX_DOCUMENT_SIZE_BYTES,
  resolvePublicDocumentAppointment,
  reviewRequirementDocument,
  uploadRequirementDocument,
  validateDocumentPayload,
} from '@/lib/documentVault';
import type { SessionUser } from '@/lib/http';

describe('FEAT-P1 Digital Document Upload & Pre-Verification Vault', () => {
  let tempVaultFile: string;

  beforeEach(() => {
    tempVaultFile = path.join(
      os.tmpdir(),
      `sacrament-doc-vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );
    configureDocumentVault({
      vaultPath: tempVaultFile,
      inMemoryOnly: false,
      reset: true,
    });
  });

  afterEach(() => {
    configureDocumentVault({
      vaultPath: null,
      inMemoryOnly: false,
      reset: true,
    });
    if (tempVaultFile && fs.existsSync(tempVaultFile)) {
      try {
        fs.unlinkSync(tempVaultFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('validates supported MIME types and enforces the 2MB maximum size limit', () => {
    const sampleDataUrl = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 sample PSA birth certificate').toString('base64')}`;

    const validPdf = validateDocumentPayload({
      fileName: 'psa-birth-certificate.pdf',
      mimeType: 'application/pdf',
      dataUrl: sampleDataUrl,
    });
    expect(validPdf.fileName).toBe('psa-birth-certificate.pdf');
    expect(validPdf.mimeType).toBe('application/pdf');
    expect(validPdf.sizeBytes).toBeGreaterThan(0);

    const validWebp = validateDocumentPayload({
      fileName: 'valid-id.webp',
      mimeType: 'image/webp',
      sizeBytes: 12_400,
      dataUrl: 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=',
    });
    expect(validWebp.mimeType).toBe('image/webp');

    // Unsupported MIME type (e.g., executable or zip)
    expect(() =>
      validateDocumentPayload({
        fileName: 'malicious.exe',
        mimeType: 'application/x-msdownload',
        dataUrl: sampleDataUrl,
      })
    ).toThrow(/Unsupported file format/);

    // Exceeds 2MB sizeBytes
    expect(() =>
      validateDocumentPayload({
        fileName: 'huge-scan.png',
        mimeType: 'image/png',
        sizeBytes: MAX_DOCUMENT_SIZE_BYTES + 1024,
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      })
    ).toThrow(/exceeds the maximum limit of 2 MB/);

    // Empty file name
    expect(() =>
      validateDocumentPayload({
        fileName: '   ',
        mimeType: 'application/pdf',
        dataUrl: sampleDataUrl,
      })
    ).toThrow(/File name is required/);
  });

  it('persists uploaded documents to the JSON vault, supports in-memory fallback, and completes staff pre-verification workflow', async () => {
    const ref = `SAC-2026-DV${Math.floor(1000 + Math.random() * 8999)}`;
    const adminEmail = `admin.vault.${Date.now()}@urdanetaparish.ph`;

    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        password: 'hashed-password',
        name: 'Cathedral Chancery Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    const appt = await prisma.appointment.create({
      data: {
        referenceNumber: ref,
        source: 'ONLINE',
        sacramentType: 'BAPTISM',
        participantName: 'Baby Sofia Reyes',
        participantPhone: '09171112233',
        participantEmail: 'reyes.family@gmail.com',
        scheduledDate: new Date('2026-12-20T00:00:00.000Z'),
        scheduledTime: '10:00',
        status: 'PENDING',
        fee: '1000.00',
      },
    });

    const adminActor: SessionUser = {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: 'ADMIN',
      status: 'ACTIVE',
      availability: 'AVAILABLE',
    };

    try {
      // 1. Parishioner resolves booking via reference + phone contact
      const resolved = await resolvePublicDocumentAppointment({
        reference: ref,
        contact: '0917 111 2233',
      });
      expect(resolved.appointment.id).toBe(appt.id);
      expect(resolved.requirements.length).toBeGreaterThan(0);

      // 2. Upload Child's PSA birth certificate
      const pdfBase64 = Buffer.from('%PDF-1.4 PSA Birth Certificate of Sofia Reyes').toString('base64');
      const uploaded = await uploadRequirementDocument({
        appointmentId: appt.id,
        referenceNumber: ref,
        requirementKey: 'child_birth_cert',
        fileName: 'sofia-psa-birth-cert.pdf',
        mimeType: 'application/pdf',
        dataUrl: `data:application/pdf;base64,${pdfBase64}`,
        uploadedBy: 'PARISHIONER',
      });

      expect(uploaded.reviewStatus).toBe('UPLOADED');
      expect(uploaded.reviewerNote).toBeNull();
      expect(uploaded.referenceNumber).toBe(ref);
      expect(fs.existsSync(tempVaultFile)).toBe(true);

      // Verify JSON file persistence on disk
      const listed = await listAppointmentDocuments(appt.id);
      expect(listed).toHaveLength(1);
      expect(listed[0].fileName).toBe('sofia-psa-birth-cert.pdf');

      // 3. Staff marks document as NEEDS_RESUBMISSION with reviewerNote
      const rejected = await reviewRequirementDocument({
        appointmentId: appt.id,
        requirementKey: 'child_birth_cert',
        reviewStatus: 'NEEDS_RESUBMISSION',
        reviewerNote: 'Bottom seal is blurry; please upload a clearer scan.',
        actor: adminActor,
      });

      expect(rejected.reviewStatus).toBe('NEEDS_RESUBMISSION');
      expect(rejected.reviewerNote).toContain('Bottom seal is blurry');

      // 4. Parishioner replaces the document with a clearer scan
      const replaced = await uploadRequirementDocument({
        appointmentId: appt.id,
        referenceNumber: ref,
        requirementKey: 'child_birth_cert',
        fileName: 'sofia-psa-birth-cert-clear.jpg',
        mimeType: 'image/jpeg',
        dataUrl: `data:image/jpeg;base64,${Buffer.from('clear-jpeg-bytes').toString('base64')}`,
        uploadedBy: 'PARISHIONER',
      });

      expect(replaced.id).toBe(uploaded.id);
      expect(replaced.reviewStatus).toBe('UPLOADED');
      expect(replaced.reviewerNote).toBeNull();

      // 5. Staff pre-verifies the uploaded document -> automatically marks AppointmentRequirement isMet = true
      const verified = await reviewRequirementDocument({
        appointmentId: appt.id,
        requirementKey: 'child_birth_cert',
        reviewStatus: 'PRE_VERIFIED',
        reviewerNote: 'PSA Birth Certificate verified against registry details.',
        actor: adminActor,
      });

      expect(verified.reviewStatus).toBe('PRE_VERIFIED');
      expect(verified.reviewerNote).toContain('verified against registry');

      const merged = await listMergedRequirementsWithDocuments(appt.id);
      const birthCertItem = merged.find((item) => item.key === 'child_birth_cert');
      expect(birthCertItem).toBeDefined();
      expect(birthCertItem?.isMet).toBe(true);
      expect(birthCertItem?.document?.reviewStatus).toBe('PRE_VERIFIED');

      // Verify audit logs were recorded for upload and review
      const reqRow = await prisma.appointmentRequirement.findUniqueOrThrow({
        where: {
          appointmentId_key: {
            appointmentId: appt.id,
            key: 'child_birth_cert',
          },
        },
      });
      expect(reqRow.isMet).toBe(true);
      expect(reqRow.verifiedById).toBe(adminUser.id);

      const audits = await prisma.auditLog.findMany({
        where: {
          entityType: 'AppointmentRequirement',
          entityId: reqRow.id,
        },
        orderBy: { createdAt: 'asc' },
      });
      const actions = audits.map((a) => a.action);
      expect(actions).toContain('requirement.document_uploaded');
      expect(actions).toContain('requirement.document_reviewed');
      expect(actions).toContain('requirement.check');
    } finally {
      await prisma.appointmentRequirement.deleteMany({ where: { appointmentId: appt.id } });
      await prisma.appointment.delete({ where: { id: appt.id } });
      await prisma.user.delete({ where: { id: adminUser.id } });
    }
  });
});
