import {convertHL7V3DateTimeToIsoDateTimeString} from "../../common/dateTime"
import {hl7V3, fhir, processingErrors as errors} from "@models"
import {generateResourceId, getFullUrl} from "../common"
import {createGroupIdentifier} from "../medication-request"

const MEDICINAL_PRODUCT_CODEABLE_CONCEPT = fhir.createCodeableConcept(
  "http://snomed.info/sct",
  "763158003",
  "Medicinal product"
)

export function extractStatusCode(cancellationResponse: hl7V3.CancellationResponse): PrescriptionStatusInformation {
  const pertinentInformation3 = cancellationResponse.pertinentInformation3
  const cancellationCode = pertinentInformation3.pertinentResponse.value._attributes.code
  const cancellationDisplay = pertinentInformation3.pertinentResponse.value._attributes.displayName
  return getPrescriptionStatusInformation(cancellationCode, cancellationDisplay)
}

export function createMedicationRequest(
  cancellationResponse: hl7V3.CancellationResponse,
  cancelRequesterPractitionerRoleId: string,
  patientId: string,
  originalPrescriptionAuthorPractitionerRoleId: string
): fhir.MedicationRequestOutcome {
  const {prescriptionStatusCode, prescriptionStatusDisplay, medicationRequestStatus} =
    extractStatusCode(cancellationResponse)
  const effectiveTime = convertHL7V3DateTimeToIsoDateTimeString(cancellationResponse.effectiveTime)

  return {
    resourceType: "MedicationRequest",
    id: generateResourceId(),
    extension: createMedicationRequestExtensions(
      prescriptionStatusCode,
      prescriptionStatusDisplay,
      cancelRequesterPractitionerRoleId,
      effectiveTime
    ),
    identifier: createItemNumberIdentifier(cancellationResponse.pertinentInformation1),
    status: medicationRequestStatus,
    intent: fhir.MedicationRequestIntent.ORDER,
    medicationCodeableConcept: MEDICINAL_PRODUCT_CODEABLE_CONCEPT,
    subject: fhir.createReference(patientId),
    authoredOn: undefined, //the v3 message doesnt have enough information for authoredOn
    requester: fhir.createReference(originalPrescriptionAuthorPractitionerRoleId),
    groupIdentifier: createGroupIdentifierFromPertinentInformation2(cancellationResponse.pertinentInformation2)
  }
}

function createPrescriptionStatusHistoryExtension(
  fhirCode: string, fhirDisplay: string, effectiveTime: string
): fhir.PrescriptionStatusHistoryExtension {
  return {
    url: "https://fhir.nhs.uk/StructureDefinition/Extension-DM-PrescriptionTaskStatusReason",
    extension: [
      {
        url: "status",
        valueCoding: {
          system: "https://fhir.nhs.uk/CodeSystem/medicationrequest-status-history",
          code: fhirCode,
          display: fhirDisplay
        }
      },
      {
        url: "statusDate",
        valueDateTime: effectiveTime
      }
    ]
  }
}

function createResponsiblePractitionerExtension(
  practitionerRoleId: string
): fhir.ReferenceExtension<fhir.PractitionerRole> {
  return {
    url: "https://fhir.nhs.uk/StructureDefinition/Extension-DM-ResponsiblePractitioner",
    valueReference: {
      reference: getFullUrl(practitionerRoleId)
    }
  }
}

function createMedicationRequestExtensions(
  fhirCode: string,
  fhirDisplay: string,
  practitionerRoleId: string,
  effectiveTime: string
) {
  return [
    createPrescriptionStatusHistoryExtension(fhirCode, fhirDisplay, effectiveTime),
    createResponsiblePractitionerExtension(practitionerRoleId)
  ]
}

export interface PrescriptionStatusInformation {
  prescriptionStatusCode: string
  prescriptionStatusDisplay: string
  issueCode?: fhir.IssueCodes
  medicationRequestStatus?: fhir.MedicationRequestStatus
}

function getPrescriptionStatusInformation(code: string, display: string) {
  switch (code) {
    case "0001":
      return {
        prescriptionStatusCode: "R-0001",
        prescriptionStatusDisplay: "Prescription/item was cancelled",
        medicationRequestStatus: fhir.MedicationRequestStatus.CANCELLED
      }
    case "0002":
      return {
        prescriptionStatusCode: "R-0002",
        prescriptionStatusDisplay: "Prescription/item was not cancelled. With dispenser. Marked for cancellation",
        medicationRequestStatus: fhir.MedicationRequestStatus.ACTIVE
      }
    case "0003":
      return {
        prescriptionStatusCode: "R-0003",
        // eslint-disable-next-line max-len
        prescriptionStatusDisplay: "Prescription/item was not cancelled. With dispenser active. Marked for cancellation",
        medicationRequestStatus: fhir.MedicationRequestStatus.ACTIVE
      }
    case "0004":
      return {
        prescriptionStatusCode: "R-0004",
        prescriptionStatusDisplay: "Prescription/item was not cancelled. Prescription has been dispensed.",
        medicationRequestStatus: fhir.MedicationRequestStatus.COMPLETED
      }
    case "0005":
      return {
        prescriptionStatusCode: "R-0005",
        prescriptionStatusDisplay: "Prescription/item has expired",
        medicationRequestStatus: fhir.MedicationRequestStatus.STOPPED
      }
    case "0006":
      return {
        prescriptionStatusCode: "R-0006",
        prescriptionStatusDisplay: "Prescription/item had already been cancelled",
        medicationRequestStatus: fhir.MedicationRequestStatus.CANCELLED
      }
    case "0007":
      return {
        prescriptionStatusCode: "R-0007",
        prescriptionStatusDisplay: "Prescription/item cancellation requested by another prescriber",
        medicationRequestStatus: fhir.MedicationRequestStatus.UNKNOWN
      }
    case "0008":
      return {
        prescriptionStatusCode: "R-0008",
        prescriptionStatusDisplay: "Prescription/item not found",
        issueCode: fhir.IssueCodes.NOT_FOUND
      }
    case "0009":
      return {
        prescriptionStatusCode: "R-0009",
        prescriptionStatusDisplay: "Cancellation functionality disabled in SPINE",
        issueCode: fhir.IssueCodes.NOT_SUPPORTED
      }
    case "0010":
      return {
        prescriptionStatusCode: "R-0010",
        prescriptionStatusDisplay: "Prescription/item was not cancelled. Prescription has been not dispensed.",
        medicationRequestStatus: fhir.MedicationRequestStatus.STOPPED
      }
    case "5000":
      return {
        prescriptionStatusCode: "R-5000",
        prescriptionStatusDisplay: display,
        issueCode: fhir.IssueCodes.PROCESSING
      }
    case "5888":
      return {
        prescriptionStatusCode: "R-5888",
        prescriptionStatusDisplay: "Invalid Message.",
        issueCode: fhir.IssueCodes.INVALID
      }
    default:
      throw errors.InvalidValueError
  }
}

function createItemNumberIdentifier(pertinentInformation1: hl7V3.CancellationResponsePertinentInformation1) {
  const id = pertinentInformation1.pertinentLineItemRef.id._attributes.root
  return [fhir.createIdentifier("https://fhir.nhs.uk/Id/prescription-order-item-number", id.toLowerCase())]
}

function createGroupIdentifierFromPertinentInformation2(
  pertinentInformation2: hl7V3.CancellationResponsePertinentInformation2
) {
  const shortFormId = pertinentInformation2.pertinentPrescriptionID.value._attributes.extension
  return createGroupIdentifier(shortFormId, null)
}
