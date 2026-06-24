import type { Contact } from '../service/contacts-service'

type MockPlacementMatchInput = Pick<
  Contact,
  'placementLocation' | 'locationType' | 'locationSubType' | 'placementStatus'
>

type PlacementDisplayInput = Pick<
  Contact,
  | 'placementLocation'
  | 'locationType'
  | 'locationSubType'
  | 'placementStatus'
  | 'actualStartDate'
  | 'actualEndDate'
  | 'paidUnpaid'
  | 'sourcePlacement'
  | 'placeOfServiceName'
>

export interface PlacementDisplayValues {
  placementLocation: string
  locationType: string
  locationSubType: string
  placementStatus: string
  actualStartDate: string
  actualEndDate: string
  paidUnpaid: string
  sourcePlacement: string
  placeOfServiceName: string
}

export const normalizeMatchValue = (value?: string): string => (value ?? '').trim().toUpperCase()

export const isMockSection54Placement = (contact: MockPlacementMatchInput): boolean =>
  normalizeMatchValue(contact.placementLocation) === '0' &&
  normalizeMatchValue(contact.locationType) === 'PL' &&
  normalizeMatchValue(contact.locationSubType) === '54' &&
  normalizeMatchValue(contact.placementStatus) === 'ACTIVE'

const hasPlacementDetails = (contact: PlacementDisplayInput): boolean =>
  Boolean(contact.placementLocation?.trim())

export const buildPlacementDisplayValues = (
  contact: PlacementDisplayInput,
  formatDateYMD: (dateString: string) => string,
): PlacementDisplayValues => {
  const hidePlacementDetails =
    isMockSection54Placement(contact) || !hasPlacementDetails(contact)

  return {
    placementLocation: hidePlacementDetails ? '' : contact.placementLocation || '',
    locationType: hidePlacementDetails ? '' : contact.locationType || '',
    locationSubType: hidePlacementDetails ? '' : contact.locationSubType || '',
    placementStatus: hidePlacementDetails ? '' : contact.placementStatus || '',
    actualStartDate:
      hidePlacementDetails || !contact.actualStartDate
        ? ''
        : formatDateYMD(contact.actualStartDate),
    actualEndDate:
      hidePlacementDetails || !contact.actualEndDate ? '' : formatDateYMD(contact.actualEndDate),
    paidUnpaid: hidePlacementDetails ? '' : contact.paidUnpaid || '',
    sourcePlacement: hidePlacementDetails ? '' : contact.sourcePlacement || '',
    placeOfServiceName: hidePlacementDetails ? '' : contact.placeOfServiceName || '',
  }
}
