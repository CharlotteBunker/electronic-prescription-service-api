import {
  convertAddress,
  convertTelecom,
  generateResourceId,
  isSecondaryCare
} from "./common"
import {hl7V3, fhir} from "@models"

export function createOrganization(hl7Organization: hl7V3.Organization): fhir.Organization {
  const organization: fhir.Organization = {
    resourceType: "Organization",
    id: generateResourceId(),
    identifier: [getOrganizationCodeIdentifier(hl7Organization.id._attributes.extension)],
    type: getOrganizationType(hl7Organization)
  }
  if (hl7Organization.name) {
    organization.name = hl7Organization.name._text
  }
  if (hl7Organization.telecom) {
    organization.telecom = convertTelecom(hl7Organization.telecom)
  }
  if (hl7Organization.addr) {
    organization.address = convertAddress(hl7Organization.addr)
  }
  return organization
}

export function createLocations(organization: hl7V3.Organization): Array<fhir.Location> {
  const addresses = convertAddress(organization.addr)
  return addresses.map(
    address => ({
      resourceType: "Location",
      id: generateResourceId(),
      address: address
    })
  )
}

export function createHealthcareService(
  organization: hl7V3.Organization,
  locations: Array<fhir.Location>
): fhir.HealthcareService {
  const healthcareService: fhir.HealthcareService = {
    resourceType: "HealthcareService",
    id: generateResourceId(),
    identifier: [getOrganizationCodeIdentifier(organization.id._attributes.extension)],
    location: locations.map(location => fhir.createReference(location.id))
  }
  if (organization.name) {
    healthcareService.name = organization.name._text
  }
  if (organization.telecom) {
    healthcareService.telecom = convertTelecom(organization.telecom)
  }
  return healthcareService
}

export function getOrganizationCodeIdentifier(organizationId: string): fhir.Identifier {
  return fhir.createIdentifier("https://fhir.nhs.uk/Id/ods-organization-code", organizationId)
}

function getOrganizationType(hl7Organization: hl7V3.Organization) {
  if (isSecondaryCare(hl7Organization)) {
    return [
      {
        coding:  [
          {
            system: "https://fhir.nhs.uk/CodeSystem/organisation-role",
            code: "197",
            display: "NHS TRUST"
          }
        ]
      }
    ]
  } else {
    return [
      {
        coding:  [
          {
            system: "https://fhir.nhs.uk/CodeSystem/organisation-role",
            code: "179",
            display: "PRIMARY CARE TRUST"
          }
        ]
      }
    ]
  }
}
