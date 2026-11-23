// lib/liturgicalRunSheet.ts
// Liturgical Mass Intention (Pamisa) categorizer and Daily Altar & Ceremony Run-Sheet builder
// for Immaculate Conception Cathedral Parish (Urdaneta City).

import { Appointment, SacramentType } from '@/types';
import { DEFAULT_LOCATION, SACRAMENT_ICONS, SACRAMENT_LABELS } from '@/lib/constants';
import { requirementsFor } from '@/lib/requirements';
import { formatTime, parseTime, ruleFor } from '@/lib/scheduling';

export type MassIntentionCategory = 'THANKSGIVING' | 'SOULS' | 'PETITION';

export interface MassIntentionCategoryMeta {
  id: MassIntentionCategory;
  label: string;
  subtitle: string;
  lectorPrompt: string;
  prefix: string;
}

export const MASS_INTENTION_CATEGORIES: Record<MassIntentionCategory, MassIntentionCategoryMeta> = {
  THANKSGIVING: {
    id: 'THANKSGIVING',
    label: 'Thanksgiving & Anniversaries',
    subtitle: 'Pasasalamat, Kaarawan, at Anibersaryo',
    lectorPrompt:
      'In thanksgiving to God for blessings received, birthdays, and wedding anniversaries of:',
    prefix: '',
  },
  SOULS: {
    id: 'SOULS',
    label: 'Repose of the Souls (+)',
    subtitle: 'Para sa Kaluluwa ng mga Yumao',
    lectorPrompt: 'For the eternal repose of the souls of our departed brothers and sisters:',
    prefix: '+ ',
  },
  PETITION: {
    id: 'PETITION',
    label: 'Special Intentions & Petitions',
    subtitle: 'Natatanging Kahilingan, Kagalingan, at Patnubay',
    lectorPrompt:
      'For the special intentions, healing of the sick, and divine guidance requested by:',
    prefix: '',
  },
};

export const LITURGICAL_RUBRICS: Record<string, string> = {
  [SacramentType.BAPTISM]:
    'Rite of Baptism — Prepare Oil of Catechumens, Sacred Chrism, baptismal font, white garment, and candle. Confirm parents & godparents attendance.',
  [SacramentType.WEDDING]:
    'Order of Celebrating Matrimony — Verify marriage license, rings, arrhae, veil, cord, and witness signatures at the sacristy table.',
  [SacramentType.CONFIRMATION]:
    'Order of Confirmation — Prepare Sacred Chrism, bishop/celebrant gremial, and verify sponsor certificates.',
  [SacramentType.FUNERAL]:
    'Order of Christian Funerals — Prepare Paschal candle, holy water sprinkler (aspergillum), thurible & incense, and verify death certificate/burial permit.',
  [SacramentType.FIRST_COMMUNION]:
    'First Holy Communion — Prepare baptismal candles for renewal of promises and reserved pews for communicants.',
  [SacramentType.ANOINTING_OF_SICK]:
    'Rite of Anointing of the Sick — Bring Oil of the Sick (Oleum Infirmorum), purple/white stole, and pyx with Viaticum if the patient can receive.',
  [SacramentType.MASS_INTENTION]:
    'Pamisa / Prayers of the Faithful — Read intention clearly at the ambo before Mass and include in the Universal Prayer.',
};

export interface CategorizedMassIntention {
  id: string;
  referenceNumber?: string;
  category: MassIntentionCategory;
  participantName: string;
  lectorLine: string;
  scheduledDate: string;
  scheduledTime: string;
  location: string;
  notes: string | null;
  status: string;
  barangay: string | null;
  participantPhone: string | null;
  assignedPriestId: string | null;
  assignedPriestName: string | null;
  requirementsMet: number;
  requirementsTotal: number;
  requirementsSummary: string;
  isRequirementsReady: boolean;
}

export interface CeremonyRunSheetItem {
  id: string;
  referenceNumber?: string;
  sacramentType: string;
  sacramentLabel: string;
  sacramentIcon: string;
  scheduledDate: string;
  scheduledTime: string;
  endTime: string;
  durationMin: number;
  location: string;
  participantName: string;
  participantPhone: string | null;
  participantEmail: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  status: string;
  notes: string | null;
  assignedPriestId: string | null;
  assignedPriestName: string | null;
  requirementsMet: number;
  requirementsTotal: number;
  requirementsSummary: string;
  isRequirementsReady: boolean;
  liturgicalRubric: string;
  intentionCategory?: MassIntentionCategory;
}

export interface DailyLiturgicalRunSheet {
  date: string;
  totalActiveAppointments: number;
  totalCeremonies: number;
  totalMassIntentions: number;
  intentionsByCategory: Record<MassIntentionCategory, CategorizedMassIntention[]>;
  ceremonies: CeremonyRunSheetItem[];
  allItemsChronological: CeremonyRunSheetItem[];
  upcomingDates: string[];
}

/**
 * Normalize an ISO date or YYYY-MM-DD string to a strict "YYYY-MM-DD" calendar key.
 */
export function normalizeAppointmentDate(dateValue: string | Date): string {
  if (typeof dateValue === 'string') {
    const trimmed = dateValue.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return trimmed;
  }
  return dateValue.toISOString().slice(0, 10);
}

const SOULS_PATTERNS = [
  /^\s*\+/,
  /\+\s*[a-z]/i,
  /\brepose\b/i,
  /\bsoul(s)?\b/i,
  /\beternal\s+rest\b/i,
  /\bdeceased\b/i,
  /\bdeparted\b/i,
  /\bdeath\s+anniversary\b/i,
  /\b40th\s+day\b/i,
  /\b9th\s+day\b/i,
  /\bpasiyam\b/i,
  /\bkaluluwa\b/i,
  /\byumao\b/i,
  /\bin\s+loving\s+memory\b/i,
  /\bin\s+memory\s+of\b/i,
  /\bmemoriam\b/i,
  /\br\.?i\.?p\.?\b/i,
  /\blate\s+[a-z]/i,
];

const THANKSGIVING_PATTERNS = [
  /\bthanksgiving\b/i,
  /\bthank(s|\s+you)\b/i,
  /\bpasasalamat\b/i,
  /\bbirthday\b/i,
  /\bb-?day\b/i,
  /\bkaarawan\b/i,
  /\banniversary\b/i,
  /\banibersaryo\b/i,
  /\bgraduation\b/i,
  /\bpassed\s+the\b/i,
  /\bboard\s+exam\s+passer\b/i,
  /\bblessings?\s+received\b/i,
];

const PETITION_PATTERNS = [
  /\bpetition(s)?\b/i,
  /\bspecial\s+intention(s)?\b/i,
  /\bhealing\b/i,
  /\bhealth\b/i,
  /\brecovery\b/i,
  /\bsurgery\b/i,
  /\boperation\b/i,
  /\bguidance\b/i,
  /\bsafe\s+(trip|travel|voyage|flight|delivery)\b/i,
  /\bkahilingan\b/i,
  /\bkagalingan\b/i,
  /\bpatnubay\b/i,
  /\bprotection\b/i,
  /\bpeace\b/i,
  /\bexam(ination)?\b/i,
];

/**
 * Categorize a Mass Intention based on appointment `notes` and `participantName`.
 * Priority:
 *  1. SOULS if explicitly marked for the deceased (+Name, Repose of the Soul, Eternal Rest, etc.)
 *  2. THANKSGIVING if marked for Thanksgiving, Birthday, or Wedding Anniversary
 *  3. PETITION for Special Intention, Healing, Guidance, or general petitions (default)
 */
export function categorizeMassIntention(
  notes?: string | null,
  participantName?: string | null
): MassIntentionCategory {
  const combined = `${participantName ?? ''} ${notes ?? ''}`.trim();
  if (!combined) return 'PETITION';

  if (SOULS_PATTERNS.some((pattern) => pattern.test(combined))) {
    return 'SOULS';
  }

  if (THANKSGIVING_PATTERNS.some((pattern) => pattern.test(combined))) {
    return 'THANKSGIVING';
  }

  if (PETITION_PATTERNS.some((pattern) => pattern.test(combined))) {
    return 'PETITION';
  }

  return 'PETITION';
}

/**
 * Build a clean lector reading line for the altar sheet.
 */
export function formatLectorReadingLine(
  participantName: string,
  notes: string | null | undefined,
  category: MassIntentionCategory
): string {
  const cleanName = participantName.trim().replace(/^\+\s*/, '');
  const prefix = category === 'SOULS' ? '+ ' : '';
  const cleanNotes = (notes ?? '').trim();

  if (!cleanNotes) {
    return `${prefix}${cleanName}`;
  }
  return `${prefix}${cleanName} — ${cleanNotes}`;
}

/**
 * Get the liturgical rubric note for a sacrament type.
 */
export function getLiturgicalRubric(sacramentType: string): string {
  return (
    LITURGICAL_RUBRICS[sacramentType] ??
    'Verify canonical requirements, sacred vessels, and parish register entry before the rite.'
  );
}

/**
 * Format requirement verification counts as "X/Y verified".
 */
export function computeRequirementStatus(apt: Pick<Appointment, 'sacramentType' | 'requirementsMet' | 'requirementsTotal'>): {
  requirementsMet: number;
  requirementsTotal: number;
  requirementsSummary: string;
  isRequirementsReady: boolean;
} {
  const defaultTotal = requirementsFor(apt.sacramentType).length;
  const total =
    typeof apt.requirementsTotal === 'number' && apt.requirementsTotal > 0
      ? apt.requirementsTotal
      : defaultTotal;
  const met = typeof apt.requirementsMet === 'number' ? Math.min(apt.requirementsMet, total) : 0;

  return {
    requirementsMet: met,
    requirementsTotal: total,
    requirementsSummary: `${met}/${total} verified`,
    isRequirementsReady: total === 0 || met >= total,
  };
}

/**
 * Sort comparator for appointments by date then 24h time (and fallback alphabetical).
 */
export function compareChronological(
  a: { scheduledDate: string; scheduledTime: string; participantName: string },
  b: { scheduledDate: string; scheduledTime: string; participantName: string }
): number {
  const dateDiff = a.scheduledDate.localeCompare(b.scheduledDate);
  if (dateDiff !== 0) return dateDiff;

  const aMin = parseTime(a.scheduledTime);
  const bMin = parseTime(b.scheduledTime);
  if (aMin !== null && bMin !== null && aMin !== bMin) {
    return aMin - bMin;
  }
  if (aMin !== null && bMin === null) return -1;
  if (aMin === null && bMin !== null) return 1;

  const timeDiff = a.scheduledTime.localeCompare(b.scheduledTime);
  if (timeDiff !== 0) return timeDiff;

  return a.participantName.localeCompare(b.participantName);
}

/**
 * Build a complete daily liturgical schedule & Mass Intention lector sheet.
 * Pass `date` as "YYYY-MM-DD" for a single day, or `"ALL"` / `""` to include all active appointments.
 */
export function buildDailyLiturgicalRunSheet(
  appointments: Appointment[],
  date: string
): DailyLiturgicalRunSheet {
  const activeAppointments = appointments.filter((apt) => apt.status !== 'CANCELLED');

  const upcomingDatesSet = new Set<string>();
  for (const apt of activeAppointments) {
    upcomingDatesSet.add(normalizeAppointmentDate(apt.scheduledDate));
  }
  const upcomingDates = Array.from(upcomingDatesSet).sort((a, b) => a.localeCompare(b));

  const targetDate = date && date !== 'ALL' ? normalizeAppointmentDate(date) : 'ALL';

  const matchingAppointments = activeAppointments.filter((apt) => {
    if (targetDate === 'ALL') return true;
    return normalizeAppointmentDate(apt.scheduledDate) === targetDate;
  });

  const intentionsByCategory: Record<MassIntentionCategory, CategorizedMassIntention[]> = {
    THANKSGIVING: [],
    SOULS: [],
    PETITION: [],
  };

  const ceremonies: CeremonyRunSheetItem[] = [];
  const allItemsChronological: CeremonyRunSheetItem[] = [];

  for (const apt of matchingAppointments) {
    const normalizedDate = normalizeAppointmentDate(apt.scheduledDate);
    const rule = ruleFor(apt.sacramentType);
    const startMin = parseTime(apt.scheduledTime);
    const endTime =
      startMin !== null ? formatTime(startMin + rule.durationMin) : apt.scheduledTime;
    const reqStatus = computeRequirementStatus(apt);
    const isMassIntention = apt.sacramentType === SacramentType.MASS_INTENTION;
    const intentionCategory = isMassIntention
      ? categorizeMassIntention(apt.notes, apt.participantName)
      : undefined;

    const runSheetItem: CeremonyRunSheetItem = {
      id: apt.id,
      referenceNumber: apt.referenceNumber,
      sacramentType: apt.sacramentType,
      sacramentLabel: SACRAMENT_LABELS[apt.sacramentType] ?? apt.sacramentType.replace(/_/g, ' '),
      sacramentIcon: SACRAMENT_ICONS[apt.sacramentType] ?? '⛪',
      scheduledDate: normalizedDate,
      scheduledTime: apt.scheduledTime,
      endTime,
      durationMin: rule.durationMin,
      location: apt.location || DEFAULT_LOCATION,
      participantName: apt.participantName,
      participantPhone: apt.participantPhone,
      participantEmail: apt.participantEmail,
      barangay: apt.barangay,
      city: apt.city,
      province: apt.province,
      status: apt.status,
      notes: apt.notes,
      assignedPriestId: apt.assignedPriestId,
      assignedPriestName: apt.assignedPriest?.name ?? null,
      requirementsMet: reqStatus.requirementsMet,
      requirementsTotal: reqStatus.requirementsTotal,
      requirementsSummary: reqStatus.requirementsSummary,
      isRequirementsReady: reqStatus.isRequirementsReady,
      liturgicalRubric: getLiturgicalRubric(apt.sacramentType),
      intentionCategory,
    };

    allItemsChronological.push(runSheetItem);

    if (isMassIntention && intentionCategory) {
      intentionsByCategory[intentionCategory].push({
        id: apt.id,
        referenceNumber: apt.referenceNumber,
        category: intentionCategory,
        participantName: apt.participantName,
        lectorLine: formatLectorReadingLine(apt.participantName, apt.notes, intentionCategory),
        scheduledDate: normalizedDate,
        scheduledTime: apt.scheduledTime,
        location: apt.location || DEFAULT_LOCATION,
        notes: apt.notes,
        status: apt.status,
        barangay: apt.barangay,
        participantPhone: apt.participantPhone,
        assignedPriestId: apt.assignedPriestId,
        assignedPriestName: apt.assignedPriest?.name ?? null,
        requirementsMet: reqStatus.requirementsMet,
        requirementsTotal: reqStatus.requirementsTotal,
        requirementsSummary: reqStatus.requirementsSummary,
        isRequirementsReady: reqStatus.isRequirementsReady,
      });
    } else {
      ceremonies.push(runSheetItem);
    }
  }

  allItemsChronological.sort(compareChronological);
  ceremonies.sort(compareChronological);
  intentionsByCategory.THANKSGIVING.sort(compareChronological);
  intentionsByCategory.SOULS.sort(compareChronological);
  intentionsByCategory.PETITION.sort(compareChronological);

  const totalMassIntentions =
    intentionsByCategory.THANKSGIVING.length +
    intentionsByCategory.SOULS.length +
    intentionsByCategory.PETITION.length;

  return {
    date: targetDate,
    totalActiveAppointments: allItemsChronological.length,
    totalCeremonies: ceremonies.length,
    totalMassIntentions,
    intentionsByCategory,
    ceremonies,
    allItemsChronological,
    upcomingDates,
  };
}
