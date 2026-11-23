// app/api/appointments/[id]/requirements/route.ts
// Requirement checklist for one appointment: GET (admin, assigned priest), PUT (admin).

import { NextRequest } from 'next/server';
import { ApiError, errorResponse, json, parseBody, requireUser } from '@/lib/http';
import { requirementUpdateSchema } from '@/lib/validation';
import { listRequirements, setRequirement } from '@/lib/appointments/service';

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
    return json(requirements);
  } catch (error) {
    return errorResponse(error, 'GET /api/appointments/[id]/requirements');
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser(['ADMIN'], 'Only administrators can update the checklist');
    const { id } = await params;
    const { key, isMet } = await parseBody(request, requirementUpdateSchema);
    const row = await setRequirement(user, id, key, isMet);
    return json(row);
  } catch (error) {
    return errorResponse(error, 'PUT /api/appointments/[id]/requirements');
  }
}
