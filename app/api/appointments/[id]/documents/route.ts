// app/api/appointments/[id]/documents/route.ts
// Staff Digital Document Pre-Verification Vault endpoint (FEAT-P1).
// GET: staff (ADMIN, PRIEST) view all uploaded documents for the appointment.
// PUT: ADMIN reviews an uploaded document (PRE_VERIFIED or NEEDS_RESUBMISSION with reviewerNote)
//      and automatically marks the corresponding AppointmentRequirement (isMet = true) via setRequirement.

import { NextRequest } from 'next/server';
import { ApiError, errorResponse, json, parseBody, requireUser } from '@/lib/http';
import { staffDocumentReviewSchema } from '@/lib/validation';
import { listRequirements } from '@/lib/appointments/service';
import {
  listAppointmentDocuments,
  listMergedRequirementsWithDocuments,
  reviewRequirementDocument,
} from '@/lib/documentVault';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser(['ADMIN', 'PRIEST']);
    const { id } = await params;

    const { appointment, requirements } = await listRequirements(id);
    if (user.role === 'PRIEST' && appointment.assignedPriestId !== user.id) {
      throw new ApiError(403, 'Access denied');
    }

    const documents = await listAppointmentDocuments(id);
    const mergedRequirements = await listMergedRequirementsWithDocuments(id, requirements);

    return json({
      appointmentId: appointment.id,
      documents,
      requirements: mergedRequirements,
    });
  } catch (error) {
    return errorResponse(error, 'GET /api/appointments/[id]/documents');
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser(
      ['ADMIN'],
      'Only administrators can review and pre-verify requirement documents'
    );
    const { id } = await params;
    const input = await parseBody(request, staffDocumentReviewSchema);

    await listRequirements(id);
    const reviewed = await reviewRequirementDocument({
      appointmentId: id,
      requirementKey: input.requirementKey,
      reviewStatus: input.reviewStatus,
      reviewerNote: input.reviewerNote,
      actor: user,
    });

    const mergedRequirements = await listMergedRequirementsWithDocuments(id);

    return json({
      document: reviewed,
      requirements: mergedRequirements,
    });
  } catch (error) {
    return errorResponse(error, 'PUT /api/appointments/[id]/documents');
  }
}
