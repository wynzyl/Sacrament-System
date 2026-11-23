import { describe, expect, it } from 'vitest';
import {
  buildDailyLiturgicalRunSheet,
  categorizeMassIntention,
  computeRequirementStatus,
  formatLectorReadingLine,
  getLiturgicalRubric,
} from '@/lib/liturgicalRunSheet';
import { Appointment, AppointmentStatus, SacramentType } from '@/types';

function makeAppointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: overrides.id ?? 'apt-1',
    referenceNumber: overrides.referenceNumber ?? 'ICC-2026-0001',
    sacramentType: overrides.sacramentType ?? SacramentType.BAPTISM,
    participantName: overrides.participantName ?? 'Juan Dela Cruz',
    participantPhone: overrides.participantPhone ?? '09171234567',
    participantEmail: overrides.participantEmail ?? 'juan@example.com',
    barangay: overrides.barangay ?? 'Poblacion',
    city: overrides.city ?? 'Urdaneta City',
    province: overrides.province ?? 'Pangasinan',
    scheduledDate: overrides.scheduledDate ?? '2026-11-24T00:00:00.000Z',
    scheduledTime: overrides.scheduledTime ?? '09:00',
    location: overrides.location ?? 'Immaculate Conception Cathedral Parish',
    notes: overrides.notes ?? null,
    status: overrides.status ?? AppointmentStatus.CONFIRMED,
    fee: overrides.fee ?? 500,
    requirementsMet: overrides.requirementsMet,
    requirementsTotal: overrides.requirementsTotal,
    assignedPriestId: overrides.assignedPriestId ?? 'priest-1',
    assignedPriest: overrides.assignedPriest ?? {
      id: 'priest-1',
      name: 'Rafael Mendoza',
    },
  };
}

describe('FEAT-C1 Daily Altar-Ready Mass Intention Sheet & Ceremony Run-Sheet', () => {
  describe('categorizeMassIntention', () => {
    it('categorizes Thanksgiving, Birthday, and Wedding Anniversary intentions as THANKSGIVING', () => {
      expect(categorizeMassIntention('Thanksgiving for blessings received', 'Maria Santos')).toBe(
        'THANKSGIVING'
      );
      expect(categorizeMassIntention('60th Birthday blessing', 'Roberto Reyes')).toBe(
        'THANKSGIVING'
      );
      expect(
        categorizeMassIntention('25th Wedding Anniversary', 'Carlos & Elena Fernandez')
      ).toBe('THANKSGIVING');
      expect(categorizeMassIntention('Pasasalamat sa pamilya', 'Familia Soriano')).toBe(
        'THANKSGIVING'
      );
    });

    it('categorizes Repose of the Soul, Eternal Rest, and +Deceased intentions as SOULS', () => {
      expect(categorizeMassIntention('For the eternal repose of the soul', 'Pedro Penduko')).toBe(
        'SOULS'
      );
      expect(categorizeMassIntention('40th day death anniversary', '+ Don Severino Salazar')).toBe(
        'SOULS'
      );
      expect(categorizeMassIntention(null, '+Lola Rosa Aquino')).toBe('SOULS');
      expect(categorizeMassIntention('Eternal rest grant unto them', 'All Souls')).toBe('SOULS');
    });

    it('categorizes Special Intention, Healing, Guidance, and general petitions as PETITION', () => {
      expect(categorizeMassIntention('Special intention for board exam guidance', 'Ana Lim')).toBe(
        'PETITION'
      );
      expect(categorizeMassIntention('For speedy healing and recovery from surgery', 'Josefa')).toBe(
        'PETITION'
      );
      expect(categorizeMassIntention('Safe travel and family protection', 'Dizon Family')).toBe(
        'PETITION'
      );
      expect(categorizeMassIntention('', 'Anonymous Parishioner')).toBe('PETITION');
    });
  });

  describe('formatLectorReadingLine & computeRequirementStatus', () => {
    it('prefixes SOULS intentions with "+ " without duplicating existing plus signs', () => {
      expect(
        formatLectorReadingLine('+ Severino Salazar', '1st Death Anniversary', 'SOULS')
      ).toBe('+ Severino Salazar — 1st Death Anniversary');
      expect(formatLectorReadingLine('Maria Clara', null, 'SOULS')).toBe('+ Maria Clara');
      expect(
        formatLectorReadingLine('Santos Family', 'Thanksgiving for Birthday', 'THANKSGIVING')
      ).toBe('Santos Family — Thanksgiving for Birthday');
    });

    it('computes requirement verification summaries using explicit or default requirement counts', () => {
      const explicit = computeRequirementStatus({
        sacramentType: SacramentType.WEDDING,
        requirementsMet: 5,
        requirementsTotal: 7,
      });
      expect(explicit.requirementsSummary).toBe('5/7 verified');
      expect(explicit.isRequirementsReady).toBe(false);

      const complete = computeRequirementStatus({
        sacramentType: SacramentType.BAPTISM,
        requirementsMet: 5,
        requirementsTotal: 5,
      });
      expect(complete.requirementsSummary).toBe('5/5 verified');
      expect(complete.isRequirementsReady).toBe(true);
    });
  });

  describe('buildDailyLiturgicalRunSheet', () => {
    const sampleAppointments: Appointment[] = [
      makeAppointment({
        id: 'wed-afternoon',
        sacramentType: SacramentType.WEDDING,
        participantName: 'Mark & Sofia Wedding',
        scheduledDate: '2026-11-24T00:00:00.000Z',
        scheduledTime: '14:00',
        barangay: 'Anonas',
        requirementsMet: 7,
        requirementsTotal: 7,
        notes: 'Full Nuptial Mass with Choir',
      }),
      makeAppointment({
        id: 'bap-morning',
        sacramentType: SacramentType.BAPTISM,
        participantName: 'Baby Lucas Gabriel',
        scheduledDate: '2026-11-24T00:00:00.000Z',
        scheduledTime: '09:00',
        barangay: 'Poblacion',
        requirementsMet: 4,
        requirementsTotal: 5,
        notes: '4 pairs of godparents attending',
      }),
      makeAppointment({
        id: 'mass-souls',
        sacramentType: SacramentType.MASS_INTENTION,
        participantName: '+ Eutiquio & + Cresencia',
        scheduledDate: '2026-11-24T00:00:00.000Z',
        scheduledTime: '06:00',
        notes: 'Repose of the souls',
        requirementsMet: 3,
        requirementsTotal: 3,
      }),
      makeAppointment({
        id: 'mass-thanks',
        sacramentType: SacramentType.MASS_INTENTION,
        participantName: 'Dr. Katrina Orata',
        scheduledDate: '2026-11-24T00:00:00.000Z',
        scheduledTime: '07:30',
        notes: 'Birthday Thanksgiving',
        requirementsMet: 3,
        requirementsTotal: 3,
      }),
      makeAppointment({
        id: 'mass-petition',
        sacramentType: SacramentType.MASS_INTENTION,
        participantName: 'Engr. Paolo Mendoza',
        scheduledDate: '2026-11-24T00:00:00.000Z',
        scheduledTime: '06:00',
        notes: 'Special Intention for Healing and Recovery',
        requirementsMet: 2,
        requirementsTotal: 3,
      }),
      makeAppointment({
        id: 'cancelled-funeral',
        sacramentType: SacramentType.FUNERAL,
        participantName: 'Cancelled Funeral Entry',
        scheduledDate: '2026-11-24T00:00:00.000Z',
        scheduledTime: '11:00',
        status: AppointmentStatus.CANCELLED,
      }),
      makeAppointment({
        id: 'next-day-confirmation',
        sacramentType: SacramentType.CONFIRMATION,
        participantName: 'Confirmation Batch A',
        scheduledDate: '2026-11-25T00:00:00.000Z',
        scheduledTime: '10:00',
      }),
    ];

    it('excludes CANCELLED appointments and filters strictly by selected date', () => {
      const sheet = buildDailyLiturgicalRunSheet(sampleAppointments, '2026-11-24');

      expect(sheet.date).toBe('2026-11-24');
      expect(sheet.totalActiveAppointments).toBe(5);
      expect(sheet.totalCeremonies).toBe(2);
      expect(sheet.totalMassIntentions).toBe(3);
      expect(sheet.allItemsChronological.find((i) => i.id === 'cancelled-funeral')).toBeUndefined();
      expect(sheet.upcomingDates).toEqual(['2026-11-24', '2026-11-25']);
    });

    it('sorts ceremonies in chronological order with end time, rubric, and verification status', () => {
      const sheet = buildDailyLiturgicalRunSheet(sampleAppointments, '2026-11-24');

      expect(sheet.ceremonies.map((c) => c.id)).toEqual(['bap-morning', 'wed-afternoon']);

      const baptism = sheet.ceremonies[0];
      expect(baptism.scheduledTime).toBe('09:00');
      expect(baptism.endTime).toBe('10:00'); // 60 mins
      expect(baptism.requirementsSummary).toBe('4/5 verified');
      expect(baptism.isRequirementsReady).toBe(false);
      expect(baptism.liturgicalRubric).toBe(getLiturgicalRubric(SacramentType.BAPTISM));

      const wedding = sheet.ceremonies[1];
      expect(wedding.scheduledTime).toBe('14:00');
      expect(wedding.endTime).toBe('16:00'); // 120 mins
      expect(wedding.requirementsSummary).toBe('7/7 verified');
      expect(wedding.isRequirementsReady).toBe(true);
      expect(wedding.liturgicalRubric).toBe(getLiturgicalRubric(SacramentType.WEDDING));
    });

    it('groups Mass Intentions into THANKSGIVING, SOULS, and PETITION with formatted lector lines', () => {
      const sheet = buildDailyLiturgicalRunSheet(sampleAppointments, '2026-11-24');

      expect(sheet.intentionsByCategory.THANKSGIVING).toHaveLength(1);
      expect(sheet.intentionsByCategory.THANKSGIVING[0].lectorLine).toBe(
        'Dr. Katrina Orata — Birthday Thanksgiving'
      );

      expect(sheet.intentionsByCategory.SOULS).toHaveLength(1);
      expect(sheet.intentionsByCategory.SOULS[0].lectorLine).toBe(
        '+ Eutiquio & + Cresencia — Repose of the souls'
      );

      expect(sheet.intentionsByCategory.PETITION).toHaveLength(1);
      expect(sheet.intentionsByCategory.PETITION[0].lectorLine).toBe(
        'Engr. Paolo Mendoza — Special Intention for Healing and Recovery'
      );
    });
  });
});
