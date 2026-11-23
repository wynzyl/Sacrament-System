import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  SACRAMENT_ARANCEL_CATALOG,
  calculateArancelFee,
  getArancelTariff,
} from '@/lib/arancel';
import { toCentavos } from '@/lib/money';
import { GET as getArancelRoute } from '@/app/api/arancel/route';

describe('FEAT-A1 Standardized Arancel Tariff Catalog & Itemized Fee Breakdown', () => {
  it('defines canonical Arancel tariffs for all 7 SacramentType values', () => {
    const keys = Object.keys(SACRAMENT_ARANCEL_CATALOG);
    expect(keys).toEqual([
      'BAPTISM',
      'WEDDING',
      'CONFIRMATION',
      'FUNERAL',
      'FIRST_COMMUNION',
      'ANOINTING_OF_SICK',
      'MASS_INTENTION',
    ]);

    expect(getArancelTariff('BAPTISM')).toMatchObject({
      baseFee: 500,
      includedSponsors: 2,
      extraSponsorFee: 100,
      isVoluntaryOffering: false,
    });

    expect(getArancelTariff('WEDDING')).toMatchObject({
      baseFee: 3500,
      includedSponsors: 4,
      extraSponsorFee: 150,
      isVoluntaryOffering: false,
    });
    expect(getArancelTariff('WEDDING').addOns).toEqual([
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
    ]);

    expect(getArancelTariff('CONFIRMATION')).toMatchObject({
      baseFee: 400,
      includedSponsors: 1,
      extraSponsorFee: 100,
      isVoluntaryOffering: false,
    });

    expect(getArancelTariff('FUNERAL')).toMatchObject({
      baseFee: 1500,
      includedSponsors: 0,
      extraSponsorFee: 0,
      isVoluntaryOffering: false,
    });
    expect(getArancelTariff('FUNERAL').addOns).toEqual([
      {
        key: 'cemetery_blessing',
        label: 'Cemetery Rite & Graveside Blessing',
        amount: 500,
      },
    ]);

    expect(getArancelTariff('FIRST_COMMUNION')).toMatchObject({
      baseFee: 300,
      includedSponsors: 0,
      extraSponsorFee: 0,
      isVoluntaryOffering: false,
    });

    expect(getArancelTariff('ANOINTING_OF_SICK')).toMatchObject({
      baseFee: 0,
      includedSponsors: 0,
      extraSponsorFee: 0,
      isVoluntaryOffering: true,
      note: 'Sacrament of healing is free of charge; voluntary love offering optional',
    });

    expect(getArancelTariff('MASS_INTENTION')).toMatchObject({
      baseFee: 200,
      includedSponsors: 0,
      extraSponsorFee: 0,
      isVoluntaryOffering: false,
    });
  });

  it('calculates extra sponsor fees accurately for Baptism, Wedding, and Confirmation', () => {
    // Baptism: 2 sponsors included in ₱500 base; 5 sponsors => 3 extra * ₱100 = ₱800
    const baptism = calculateArancelFee({
      sacramentType: 'BAPTISM',
      sponsorCount: 5,
    });
    expect(baptism).toEqual({
      baseFee: 500,
      extraSponsorsCount: 3,
      extraSponsorsTotal: 300,
      addOnsTotal: 0,
      totalFee: 800,
      itemizedLines: [
        { label: 'Base Stole & Registration Fee', amount: 500 },
        { label: 'Additional Sponsors (3 × ₱100.00)', amount: 300 },
      ],
    });

    // Baptism with fewer sponsors than included (1 sponsor) does not discount below baseFee
    const baptismOneSponsor = calculateArancelFee({
      sacramentType: 'BAPTISM',
      sponsorCount: 1,
    });
    expect(baptismOneSponsor.extraSponsorsCount).toBe(0);
    expect(baptismOneSponsor.totalFee).toBe(500);

    // Wedding: 4 sponsors included in ₱3,500 base; 6 sponsors + both add-ons
    // => ₱3,500 + (2 * ₱150) + ₱1,500 + ₱1,000 = ₱6,300
    const wedding = calculateArancelFee({
      sacramentType: 'WEDDING',
      sponsorCount: 6,
      selectedAddOnKeys: ['nuptial_carpet_flowers', 'sound_system_organist'],
    });
    expect(wedding).toEqual({
      baseFee: 3500,
      extraSponsorsCount: 2,
      extraSponsorsTotal: 300,
      addOnsTotal: 2500,
      totalFee: 6300,
      itemizedLines: [
        { label: 'Base Nuptial Mass & Choir/Altar Fee', amount: 3500 },
        { label: 'Additional Sponsors (2 × ₱150.00)', amount: 300 },
        { label: 'Nuptial Carpet & Sanctuary Flowers', amount: 1500 },
        { label: 'Sound System & Cathedral Organist', amount: 1000 },
      ],
    });

    // Confirmation: 1 sponsor included in ₱400 base; 3 sponsors => 2 extra * ₱100 = ₱600
    const confirmation = calculateArancelFee({
      sacramentType: 'CONFIRMATION',
      sponsorCount: 3,
    });
    expect(confirmation.extraSponsorsCount).toBe(2);
    expect(confirmation.extraSponsorsTotal).toBe(200);
    expect(confirmation.totalFee).toBe(600);
  });

  it('handles Funeral optional cemetery blessing and ignores extra sponsors when extraSponsorFee is 0', () => {
    const funeralWithCemetery = calculateArancelFee({
      sacramentType: 'FUNERAL',
      sponsorCount: 10, // ignored for Funeral
      selectedAddOnKeys: ['cemetery_blessing', 'non_existent_addon'],
    });
    expect(funeralWithCemetery).toEqual({
      baseFee: 1500,
      extraSponsorsCount: 0,
      extraSponsorsTotal: 0,
      addOnsTotal: 500,
      totalFee: 2000,
      itemizedLines: [
        { label: 'Funeral Mass & Blessing Stole Fee', amount: 1500 },
        { label: 'Cemetery Rite & Graveside Blessing', amount: 500 },
      ],
    });
  });

  it('preserves free voluntary offering (₱0.00) for Anointing of the Sick and exact centavo precision', () => {
    const anointing = calculateArancelFee({
      sacramentType: 'ANOINTING_OF_SICK',
      sponsorCount: 4,
    });
    expect(anointing.baseFee).toBe(0);
    expect(anointing.totalFee).toBe(0);
    expect(toCentavos(anointing.totalFee)).toBe(0);
    expect(getArancelTariff('ANOINTING_OF_SICK').isVoluntaryOffering).toBe(true);

    const firstCommunion = calculateArancelFee({ sacramentType: 'FIRST_COMMUNION' });
    expect(toCentavos(firstCommunion.totalFee)).toBe(30_000);

    const massIntention = calculateArancelFee({ sacramentType: 'MASS_INTENTION' });
    expect(toCentavos(massIntention.totalFee)).toBe(20_000);
  });

  it('serves GET /api/arancel catalog and live query calculation', async () => {
    const catalogRes = await getArancelRoute(
      new NextRequest('http://localhost:3000/api/arancel')
    );
    expect(catalogRes.status).toBe(200);
    const catalogBody = await catalogRes.json();
    expect(Object.keys(catalogBody.catalog)).toHaveLength(7);
    expect(catalogBody.defaults.WEDDING.totalFee).toBe(3500);

    const calcRes = await getArancelRoute(
      new NextRequest(
        'http://localhost:3000/api/arancel?sacramentType=WEDDING&sponsors=6&addOns=nuptial_carpet_flowers'
      )
    );
    expect(calcRes.status).toBe(200);
    const calcBody = await calcRes.json();
    expect(calcBody.sacramentType).toBe('WEDDING');
    expect(calcBody.calculation).toEqual({
      baseFee: 3500,
      extraSponsorsCount: 2,
      extraSponsorsTotal: 300,
      addOnsTotal: 1500,
      totalFee: 5300,
      itemizedLines: [
        { label: 'Base Nuptial Mass & Choir/Altar Fee', amount: 3500 },
        { label: 'Additional Sponsors (2 × ₱150.00)', amount: 300 },
        { label: 'Nuptial Carpet & Sanctuary Flowers', amount: 1500 },
      ],
    });

    const invalidRes = await getArancelRoute(
      new NextRequest('http://localhost:3000/api/arancel?sacramentType=INVALID')
    );
    expect(invalidRes.status).toBe(400);
  });
});
