// app/api/public/documents/route.ts
// Public & Parishioner Digital Document Pre-Verification Vault endpoint (FEAT-P1).
// GET  ?reference=SAC-...&contact=... (or authenticated parishioner session owning the booking)
// POST upload/replace a requirement attachment (or quick-attach a sample/declaratory digital copy).

import { NextRequest } from 'next/server';
import { ApiError, clientIp, errorResponse, json, parseBody } from '@/lib/http';
import { validateApiSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';
import { publicDocumentQuerySchema, publicDocumentUploadSchema } from '@/lib/validation';
import { assertPublicBookingEnabled } from '@/lib/appointments/public';
import {
  buildSampleDocumentPayload,
  listMergedRequirementsWithDocuments,
  resolvePublicDocumentAppointment,
  uploadRequirementDocument,
} from '@/lib/documentVault';

export async function GET(request: NextRequest) {
  try {
    assertPublicBookingEnabled();

    const limit = rateLimit(`doc-get:${clientIp(request)}`, 30, 15 * 60_000);
    if (!limit.ok) {
      throw new ApiError(
        429,
        `Too many requests. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).`
      );
    }

    const { searchParams } = new URL(request.url);
    const parsed = publicDocumentQuerySchema.parse({
      reference: searchParams.get('reference') ?? '',
      contact: searchParams.get('contact') ?? undefined,
    });

    const { user } = await validateApiSession();
    const { appointment, requirements } = await resolvePublicDocumentAppointment({
      reference: parsed.reference,
      contact: parsed.contact,
      sessionUser: user,
    });

    const items = await listMergedRequirementsWithDocuments(appointment.id, requirements);

    return json({
      appointmentId: appointment.id,
      referenceNumber: appointment.referenceNumber,
      sacramentType: appointment.sacramentType,
      status: appointment.status,
      requirements: items,
    });
  } catch (error) {
    return errorResponse(error, 'GET /api/public/documents');
  }
}

export async function POST(request: NextRequest) {
  try {
    assertPublicBookingEnabled();

    const limit = rateLimit(`doc-upload:${clientIp(request)}`, 20, 15 * 60_000);
    if (!limit.ok) {
      throw new ApiError(
        429,
        `Too many upload attempts. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).`
      );
    }

    const input = await parseBody(request, publicDocumentUploadSchema);
    const { user } = await validateApiSession();

    const { appointment } = await resolvePublicDocumentAppointment({
      reference: input.reference,
      contact: input.contact,
      sessionUser: user,
    });

    const payload = input.quickSample
      ? buildSampleDocumentPayload(input.requirementKey, appointment.referenceNumber)
      : {
          fileName: input.fileName ?? '',
          mimeType: input.mimeType ?? '',
          sizeBytes: input.sizeBytes,
          dataUrl: input.dataUrl ?? '',
        };

    const uploaded = await uploadRequirementDocument({
      appointmentId: appointment.id,
      referenceNumber: appointment.referenceNumber,
      requirementKey: input.requirementKey,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      sizeBytes: payload.sizeBytes,
      dataUrl: payload.dataUrl,
      uploadedBy: user && user.role !== 'PARISHIONER' ? 'STAFF' : 'PARISHIONER',
      actor: user,
    });

    const items = await listMergedRequirementsWithDocuments(appointment.id);

    return json(
      {
        document: uploaded,
        requirements: items,
      },
      201
    );
  } catch (error) {
    return errorResponse(error, 'POST /api/public/documents');
  }
}
