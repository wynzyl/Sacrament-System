// lib/arancel.ts
// Standardized Diocesan Arancel Tariff Catalog & Itemized Fee Calculator
// for Immaculate Conception Cathedral Parish (Urdaneta City, Pangasinan).
// All money arithmetic uses integer centavos via lib/money.ts (Constitution II).

import { fromCentavos, sumCentavos, toCentavos } from '@/lib/money';
import type { SacramentKey } from '@/lib/scheduling';

export interface ArancelAddOn {
  key: string;
  label: string;
  amount: number;
}

export interface ArancelTariffItem {
  sacramentType: SacramentKey;
  title: string;
  baseFee: number;
  includedSponsors: number;
  extraSponsorFee: number;
  isVoluntaryOffering: boolean;
  note?: string;
  addOns: ArancelAddOn[];
}

export interface ArancelItemizedLine {
  label: string;
  amount: number;
}

export interface ArancelFeeBreakdown {
  baseFee: number;
  extraSponsorsCount: number;
  extraSponsorsTotal: number;
  addOnsTotal: number;
  totalFee: number;
  itemizedLines: ArancelItemizedLine[];
}

export const SACRAMENT_ARANCEL_CATALOG: Record<SacramentKey, ArancelTariffItem> = {
  BAPTISM: {
    sacramentType: 'BAPTISM',
    title: 'Base Stole & Registration Fee',
    baseFee: 500,
    includedSponsors: 2,
    extraSponsorFee: 100,
    isVoluntaryOffering: false,
    note: 'Includes 1 pair (2) of sponsors/godparents; ₱100.00 per additional sponsor.',
    addOns: [],
  },
  WEDDING: {
    sacramentType: 'WEDDING',
    title: 'Base Nuptial Mass & Choir/Altar Fee',
    baseFee: 3500,
    includedSponsors: 4,
    extraSponsorFee: 150,
    isVoluntaryOffering: false,
    note: 'Includes 2 pairs (4) of principal sponsors; ₱150.00 per additional sponsor.',
    addOns: [
      {
        key: 'nuptial_carpet_flowers',
        label: 'Nuptial Carpet & Sanctuary Flowers',
        amount: 1500,
      },
      {
        key: 'sound_system_organist',
        label: 'Sound System & Cathedral Organist',
        amount: 1000,
      },
    ],
  },
  CONFIRMATION: {
    sacramentType: 'CONFIRMATION',
    title: 'Base Stole & Certificate Fee',
    baseFee: 400,
    includedSponsors: 1,
    extraSponsorFee: 100,
    isVoluntaryOffering: false,
    note: 'Includes 1 sponsor; ₱100.00 per additional sponsor.',
    addOns: [],
  },
  FUNERAL: {
    sacramentType: 'FUNERAL',
    title: 'Funeral Mass & Blessing Stole Fee',
    baseFee: 1500,
    includedSponsors: 0,
    extraSponsorFee: 0,
    isVoluntaryOffering: false,
    addOns: [
      {
        key: 'cemetery_blessing',
        label: 'Cemetery Rite & Graveside Blessing',
        amount: 500,
      },
    ],
  },
  FIRST_COMMUNION: {
    sacramentType: 'FIRST_COMMUNION',
    title: 'Catechesis & Candle/Certificate Fee',
    baseFee: 300,
    includedSponsors: 0,
    extraSponsorFee: 0,
    isVoluntaryOffering: false,
    addOns: [],
  },
  ANOINTING_OF_SICK: {
    sacramentType: 'ANOINTING_OF_SICK',
    title: 'Free / Voluntary Love Offering',
    baseFee: 0,
    includedSponsors: 0,
    extraSponsorFee: 0,
    isVoluntaryOffering: true,
    note: 'Sacrament of healing is free of charge; voluntary love offering optional',
    addOns: [],
  },
  MASS_INTENTION: {
    sacramentType: 'MASS_INTENTION',
    title: 'Standard Mass Stipend Offering',
    baseFee: 200,
    includedSponsors: 0,
    extraSponsorFee: 0,
    isVoluntaryOffering: false,
    note: 'Thanksgiving, Petition, or Repose of the Soul',
    addOns: [],
  },
};

export function isValidSacramentArancelKey(value: string): value is SacramentKey {
  return Object.prototype.hasOwnProperty.call(SACRAMENT_ARANCEL_CATALOG, value);
}

export function getArancelTariff(sacramentType: string): ArancelTariffItem {
  if (isValidSacramentArancelKey(sacramentType)) {
    return SACRAMENT_ARANCEL_CATALOG[sacramentType];
  }
  return SACRAMENT_ARANCEL_CATALOG.BAPTISM;
}

export interface CalculateArancelFeeInput {
  sacramentType: string;
  sponsorCount?: number;
  selectedAddOnKeys?: string[];
}

export function calculateArancelFee({
  sacramentType,
  sponsorCount,
  selectedAddOnKeys = [],
}: CalculateArancelFeeInput): ArancelFeeBreakdown {
  const tariff = getArancelTariff(sacramentType);
  const baseFeeCentavos = toCentavos(tariff.baseFee);

  const normalizedSponsors =
    typeof sponsorCount === 'number' && Number.isFinite(sponsorCount)
      ? Math.max(0, Math.floor(sponsorCount))
      : tariff.includedSponsors;

  const extraSponsorsCount =
    tariff.extraSponsorFee > 0
      ? Math.max(0, normalizedSponsors - tariff.includedSponsors)
      : 0;

  const extraSponsorFeeCentavos = toCentavos(tariff.extraSponsorFee);
  const extraSponsorsTotalCentavos = extraSponsorsCount * extraSponsorFeeCentavos;

  const uniqueAddOnKeys = new Set(selectedAddOnKeys);
  const selectedAddOns = tariff.addOns.filter((addOn) => uniqueAddOnKeys.has(addOn.key));
  const addOnsTotalCentavos = sumCentavos(selectedAddOns.map((addOn) => addOn.amount));

  const totalFeeCentavos = baseFeeCentavos + extraSponsorsTotalCentavos + addOnsTotalCentavos;

  const itemizedLines: ArancelItemizedLine[] = [
    {
      label: tariff.title,
      amount: fromCentavos(baseFeeCentavos),
    },
  ];

  if (extraSponsorsCount > 0) {
    itemizedLines.push({
      label: `Additional Sponsors (${extraSponsorsCount} × ₱${fromCentavos(extraSponsorFeeCentavos).toFixed(2)})`,
      amount: fromCentavos(extraSponsorsTotalCentavos),
    });
  }

  for (const addOn of selectedAddOns) {
    itemizedLines.push({
      label: addOn.label,
      amount: fromCentavos(toCentavos(addOn.amount)),
    });
  }

  return {
    baseFee: fromCentavos(baseFeeCentavos),
    extraSponsorsCount,
    extraSponsorsTotal: fromCentavos(extraSponsorsTotalCentavos),
    addOnsTotal: fromCentavos(addOnsTotalCentavos),
    totalFee: fromCentavos(totalFeeCentavos),
    itemizedLines,
  };
}
