// app/api/arancel/route.ts
// Publicly readable endpoint returning the canonical Diocesan Arancel Tariff Catalog
// and supporting live itemized fee calculation via query parameters.

import { NextRequest } from 'next/server';
import {
  SACRAMENT_ARANCEL_CATALOG,
  calculateArancelFee,
  getArancelTariff,
  isValidSacramentArancelKey,
  type ArancelFeeBreakdown,
} from '@/lib/arancel';
import { ApiError, errorResponse, json } from '@/lib/http';
import type { SacramentKey } from '@/lib/scheduling';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sacramentTypeParam = searchParams.get('sacramentType');

    const defaultBreakdowns = Object.fromEntries(
      (Object.keys(SACRAMENT_ARANCEL_CATALOG) as SacramentKey[]).map((key) => [
        key,
        calculateArancelFee({ sacramentType: key }),
      ])
    ) as Record<SacramentKey, ArancelFeeBreakdown>;

    if (!sacramentTypeParam) {
      return json({
        catalog: SACRAMENT_ARANCEL_CATALOG,
        defaults: defaultBreakdowns,
      });
    }

    const normalizedType = sacramentTypeParam.trim().toUpperCase();
    if (!isValidSacramentArancelKey(normalizedType)) {
      throw new ApiError(400, `Invalid sacramentType: ${sacramentTypeParam}`);
    }

    const sponsorsParam = searchParams.get('sponsors');
    let sponsorCount: number | undefined;
    if (sponsorsParam !== null && sponsorsParam.trim() !== '') {
      const parsed = Number(sponsorsParam);
      if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
        throw new ApiError(400, 'Query parameter "sponsors" must be a non-negative integer');
      }
      sponsorCount = parsed;
    }

    const rawAddOns = searchParams.getAll('addOns');
    const selectedAddOnKeys = rawAddOns
      .flatMap((entry) => entry.split(','))
      .map((k) => k.trim())
      .filter(Boolean);

    const tariff = getArancelTariff(normalizedType);
    const calculation = calculateArancelFee({
      sacramentType: normalizedType,
      sponsorCount,
      selectedAddOnKeys,
    });

    return json({
      sacramentType: normalizedType,
      tariff,
      calculation,
      catalog: SACRAMENT_ARANCEL_CATALOG,
      defaults: defaultBreakdowns,
    });
  } catch (error) {
    return errorResponse(error, 'GET /api/arancel');
  }
}
