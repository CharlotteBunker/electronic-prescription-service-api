import * as TestResources from "../../../resources/test-resources"
import {getIdentifierValueForSystem} from "../../../../src/services/translation/common"
import {
  createHealthcareService,
  createLocations,
  createOrganization
} from "../../../../src/services/translation/response/organization"
import {getCancellationResponse} from "../common/test-helpers"
import {hl7V3, fhir} from "@models"

const cancellationResponse = getCancellationResponse(TestResources.spineResponses.cancellationNotFoundError)
const cancellationDispensedResponse = getCancellationResponse(TestResources.spineResponses.cancellationDispensedError)

const authorRepresentedOrganization = cancellationResponse.author.AgentPerson.representedOrganization
const performerRepresentedOrganization = cancellationDispensedResponse.performer.AgentPerson.representedOrganization

const authorOrganization = createOrganization(authorRepresentedOrganization)
const performerOrganization = createOrganization(performerRepresentedOrganization)

describe.each([
  ["authorOrganization", authorOrganization, authorRepresentedOrganization, "197"],
  ["performerOrganization", performerOrganization, performerRepresentedOrganization, "179"]
])(
  "createOrganization",
  (
    organizationName: string,
    fhirOrganization: fhir.Organization,
    hl7Organization: hl7V3.Organization,
    organisationTypeCode: string
  ) => {
    test("%p has an identifier block with the correct value", () => {
      expect(fhirOrganization.identifier).not.toBeUndefined()
      const identifierValue = getIdentifierValueForSystem(
        fhirOrganization.identifier,
        "https://fhir.nhs.uk/Id/ods-organization-code",
        "Organization.identifier"
      )
      expect(identifierValue).toBe(hl7Organization.id._attributes.extension)
    })

    test("%p has a type block with correct coding values", () => {
      expect(fhirOrganization.type).not.toBeUndefined()
      expect(fhirOrganization.type[0].coding[0].code).toBe(organisationTypeCode)
      expect(fhirOrganization.type[0].coding[0].display).toBeTruthy()
    })

    test("%p has correct name value", () => {
      expect(fhirOrganization.name).toBe(hl7Organization.name._text)
    })

    test("%p has correct telecom value", () => {
      expect(fhirOrganization.telecom[0].system).toBe("phone")
      expect(fhirOrganization.telecom[0].value).toBe(hl7Organization.telecom._attributes.value.split(":")[1])
      expect(fhirOrganization.telecom[0].use).toBe("work")
    })

    test("%p has correct address value", () => {
      expect(fhirOrganization.address[0].postalCode).toBe(hl7Organization.addr.postalCode._text)
      fhirOrganization.address[0].line.forEach(
        (line, index) => expect(line).toBe(hl7Organization.addr.streetAddressLine[index]._text)
      )
    })

    test("empty name gets translated", () => {
      const organizationWithoutName = createOrganization(
        {...performerRepresentedOrganization, name: undefined}
      )

      expect(organizationWithoutName.name).toBeUndefined()
    })

    test("empty telecom gets translated", () => {
      const organizationWithoutTelecom = createOrganization(
        {...performerRepresentedOrganization, telecom: undefined}
      )

      expect(organizationWithoutTelecom.telecom).toBeUndefined()
    })

    test("empty address gets translated", () => {
      const organizationWithoutAddress = createOrganization(
        {...performerRepresentedOrganization, addr: undefined}
      )

      expect(organizationWithoutAddress.address).toBeUndefined()
    })
  }
)

const authorLocations = createLocations(authorRepresentedOrganization)
const performerLocations = createLocations(performerRepresentedOrganization)

const authorHealthcareService = createHealthcareService(authorRepresentedOrganization, authorLocations)
const performerHealthcareService = createHealthcareService(performerRepresentedOrganization, performerLocations)

describe.each([
  ["authorOrganization", authorLocations, authorHealthcareService, authorRepresentedOrganization],
  ["performerOrganization", performerLocations, performerHealthcareService, performerRepresentedOrganization]
])(
  "createLocations & createHealthcareService",
  (
    organizationName: string,
    fhirLocations: Array<fhir.Location>,
    fhirHealthcareService: fhir.HealthcareService,
    hl7Organization: hl7V3.Organization
  ) => {
    test("%p has an identifier block with the correct value", () => {
      expect(fhirHealthcareService.identifier).not.toBeUndefined()
      const identifierValue = getIdentifierValueForSystem(
        fhirHealthcareService.identifier,
        "https://fhir.nhs.uk/Id/ods-organization-code",
        "Organization.identifier"
      )
      expect(identifierValue).toBe(hl7Organization.id._attributes.extension)
    })

    test("%p has correct name value", () => {
      expect(fhirHealthcareService.name).toBe(hl7Organization.name._text)
    })

    test("%p has correct telecom value", () => {
      expect(fhirHealthcareService.telecom[0].system).toBe("phone")
      expect(fhirHealthcareService.telecom[0].value).toBe(hl7Organization.telecom._attributes.value.split(":")[1])
      expect(fhirHealthcareService.telecom[0].use).toBe("work")
    })

    test("%p has a reference to the location", () => {
      expect(fhirHealthcareService.location[0].reference).toBe(`urn:uuid:${fhirLocations[0].id}`)
    })

    test("%p has correct address value", () => {
      expect(fhirLocations[0].address.postalCode).toBe(hl7Organization.addr.postalCode._text)
      fhirLocations[0].address.line.forEach(
        (line, index) => expect(line).toBe(hl7Organization.addr.streetAddressLine[index]._text)
      )
    })

    test("empty name gets translated", () => {
      const healthcareServiceWithoutName = createHealthcareService(
        {...performerRepresentedOrganization, name: undefined}, performerLocations
      )

      expect(healthcareServiceWithoutName.name).toBeUndefined()
    })

    test("empty telecom gets translated", () => {
      const healthcareServiceWithoutTelecom = createHealthcareService(
        {...performerRepresentedOrganization, telecom: undefined}, performerLocations
      )

      expect(healthcareServiceWithoutTelecom.telecom).toBeUndefined()
    })
  }
)
