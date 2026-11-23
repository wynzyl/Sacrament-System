// lib/requirements.ts
// Sacrament requirement checklists (Constitution I: shown before booking).
//
// ASSUMPTION - these are a sensible default for a Philippine parish, NOT the
// parish's official lists. Confirm with the parish office (docs/PRD.md, Q1).
// Keys are stable identifiers; labels may be reworded without losing history.

import type { SacramentKey } from '@/lib/scheduling';

export interface RequirementDef {
  key: string;
  label: string;
}

export const SACRAMENT_REQUIREMENTS: Record<SacramentKey, RequirementDef[]> = {
  BAPTISM: [
    { key: 'child_birth_cert', label: "Child's PSA birth certificate" },
    { key: 'parents_marriage_cert', label: "Parents' marriage certificate (if married)" },
    { key: 'godparents_list', label: 'Names of at least one godfather or godmother (practising, confirmed Catholics)' },
    { key: 'godparents_cert', label: "Godparents' confirmation certificate or sponsor certificate" },
    { key: 'pre_baptism_seminar', label: 'Pre-baptismal seminar attended by parents and godparents' },
  ],
  WEDDING: [
    { key: 'birth_certs', label: 'PSA birth certificates (bride and groom)' },
    { key: 'cenomar', label: 'PSA Certificate of No Marriage Record (CENOMAR) for both' },
    { key: 'baptism_confirmation_certs', label: 'Recent baptismal and confirmation certificates marked "for marriage purposes"' },
    { key: 'marriage_license', label: 'Marriage license from the civil registrar (or exemption)' },
    { key: 'pre_cana', label: 'Pre-Cana seminar certificate' },
    { key: 'canonical_interview', label: 'Canonical interview with the priest completed' },
    { key: 'sponsors_list', label: 'List of principal sponsors (ninong and ninang)' },
  ],
  CONFIRMATION: [
    { key: 'baptism_cert', label: 'Baptismal certificate (for confirmation)' },
    { key: 'sponsor', label: 'Sponsor details (a confirmed Catholic)' },
    { key: 'catechesis', label: 'Confirmation catechesis / seminar attended' },
  ],
  FUNERAL: [
    { key: 'death_cert', label: 'Death certificate or medical certificate of death' },
    { key: 'catholic_status', label: 'Baptismal record or proof the deceased was Catholic' },
    { key: 'burial_arrangement', label: 'Burial permit / cemetery arrangement' },
    { key: 'contact_person', label: 'Valid ID of the family contact person' },
  ],
  FIRST_COMMUNION: [
    { key: 'baptism_cert', label: 'Baptismal certificate' },
    { key: 'catechesis', label: 'First Communion catechesis completed' },
    { key: 'parent_id', label: 'Valid ID of a parent or guardian' },
  ],
  ANOINTING_OF_SICK: [
    { key: 'patient_location', label: 'Exact location of the patient (address, hospital and room)' },
    { key: 'contact_person', label: 'Contact person and mobile number' },
  ],
  MASS_INTENTION: [
    { key: 'intention_details', label: 'Intention (thanksgiving, petition or for the repose of a soul)' },
    { key: 'names', label: 'Names to be mentioned during the Mass' },
    { key: 'offering', label: 'Mass offering paid at the parish office' },
  ],
};

export function requirementsFor(sacramentType: string): RequirementDef[] {
  return SACRAMENT_REQUIREMENTS[sacramentType as SacramentKey] ?? [];
}
