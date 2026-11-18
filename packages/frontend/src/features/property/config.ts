import type { PropertyType } from "@argent/shared"

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  house: "House",
  apartment: "Apartment",
  land: "Land",
  vehicle: "Vehicle",
  business: "Business",
  other: "Other",
}

export const PROPERTY_TYPE_OPTIONS = (Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((value) => ({ value, label: PROPERTY_TYPE_LABELS[value] }))
