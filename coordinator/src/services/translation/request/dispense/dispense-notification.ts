import {fhir, hl7V3, processingErrors} from "@models"
import {
  getCodingForSystem,
  getExtensionForUrl,
  getExtensionForUrlOrNull,
  getIdentifierValueForSystem,
  getIdentifierValueOrNullForSystem,
  getMedicationCoding,
  getMessageId,
  onlyElement,
  resolveReference
} from "../../common"
import {
  getContainedMedicationRequestViaReference,
  getContainedPractitionerRoleViaReference,
  getMedicationDispenses,
  getMessageHeader,
  getPatientOrNull
} from "../../common/getResourcesOfType"
import {convertMomentToHl7V3DateTime} from "../../common/dateTime"
import pino from "pino"
import {convertOrganization, createAuthorForDispenseNotification} from "../agent-person"
import moment from "moment"
import {createPriorPrescriptionReleaseEventRef, getRepeatNumberFromRepeatInfoExtension} from "./dispense-common"
import {auditDoseToTextIfEnabled} from "../dosage"
import {isReference} from "../../../../utils/type-guards"

export function convertDispenseNotification(
  bundle: fhir.Bundle,
  logger: pino.Logger
): hl7V3.DispenseNotification {
  const messageId = getMessageId([bundle.identifier], "Bundle.identifier")

  const fhirHeader = getMessageHeader(bundle)
  const fhirPatient = getPatientOrNull(bundle)
  const fhirMedicationDispenses = getMedicationDispenses(bundle)
  const fhirFirstMedicationDispense = fhirMedicationDispenses[0]
  const fhirLineItemIdentifiers = getLineItemIdentifiers(fhirMedicationDispenses)
  const fhirContainedPractitionerRole = getContainedPractitionerRoleViaReference(
    fhirFirstMedicationDispense,
    fhirFirstMedicationDispense.performer[0].actor.reference,
  )

  const fhirOrganisationRef = fhirContainedPractitionerRole.organization
  if (!isReference(fhirOrganisationRef)) {
    throw new processingErrors.InvalidValueError(
      "fhirContainedPractitionerRole.organization should be a Reference",
      'resource("MedicationDispense").contained("organization")'
    )
  }
  const fhirOrganisation = resolveReference(bundle, fhirOrganisationRef)

  const hl7Patient = createPatient(fhirPatient, fhirFirstMedicationDispense)
  const hl7CareRecordElementCategory = createCareRecordElementCategory(fhirLineItemIdentifiers)
  const hl7PriorMessageRef = createPriorMessageRef(fhirHeader)
  const hl7PriorPrescriptionReleaseEventRef = createPriorPrescriptionReleaseEventRef(fhirHeader)
  const hl7AgentOrganisation = new hl7V3.AgentOrganization(
    convertOrganization(fhirOrganisation, fhirContainedPractitionerRole.telecom[0])
  )
  const hl7PertinentInformation1 = createPertinentInformation1(
    bundle,
    messageId,
    fhirMedicationDispenses,
    fhirContainedPractitionerRole,
    fhirFirstMedicationDispense,
    fhirOrganisation,
    logger
  )
  const hl7DispenseNotification = new hl7V3.DispenseNotification(new hl7V3.GlobalIdentifier(messageId))
  hl7DispenseNotification.effectiveTime = convertMomentToHl7V3DateTime(moment.utc())
  hl7DispenseNotification.recordTarget = new hl7V3.RecordTargetReference(hl7Patient)
  hl7DispenseNotification.primaryInformationRecipient =
    new hl7V3.DispenseNotificationPrimaryInformationRecipient(hl7AgentOrganisation)
  hl7DispenseNotification.pertinentInformation1 = hl7PertinentInformation1
  hl7DispenseNotification.pertinentInformation2 = new hl7V3.DispenseNotificationPertinentInformation2(
    hl7CareRecordElementCategory
  )
  if (hl7PriorMessageRef) {
    hl7DispenseNotification.replacementOf = new hl7V3.ReplacementOf(hl7PriorMessageRef)
  }
  hl7DispenseNotification.sequelTo = new hl7V3.SequelTo(hl7PriorPrescriptionReleaseEventRef)

  return hl7DispenseNotification
}

function createPertinentInformation1(
  bundle: fhir.Bundle,
  messageId: string,
  fhirMedicationDispenses: Array<fhir.MedicationDispense>,
  fhirPractitionerRole: fhir.PractitionerRole,
  fhirFirstMedicationDispense: fhir.MedicationDispense,
  fhirOrganization: fhir.Organization,
  logger: pino.Logger
) {
  const fhirFirstMedicationRequest = getContainedMedicationRequestViaReference(
    fhirFirstMedicationDispense,
    fhirFirstMedicationDispense.authorizingPrescription[0].reference,
  )

  const hl7AuthorTime = fhirFirstMedicationDispense.whenHandedOver
  const hl7PertinentPrescriptionStatus = createPrescriptionStatus(fhirFirstMedicationDispense)
  const hl7PertinentPrescriptionIdentifier = createPrescriptionId(fhirFirstMedicationRequest)
  const hl7PriorOriginalRef = createOriginalPrescriptionRef(fhirFirstMedicationRequest)
  const hl7Author = createAuthorForDispenseNotification(
    fhirPractitionerRole,
    fhirOrganization,
    hl7AuthorTime
  )
  const hl7PertinentInformation1LineItems = fhirMedicationDispenses.map(
    medicationDispense => {
      const medicationRequest = getContainedMedicationRequestViaReference(
        medicationDispense,
        medicationDispense.authorizingPrescription[0].reference
      )
      return createDispenseNotificationSupplyHeaderPertinentInformation1(
        medicationDispense,
        medicationRequest,
        getMedicationCoding(bundle, medicationDispense),
        getMedicationCoding(bundle, medicationRequest),
        logger
      )
    }
  )
  const supplyHeader = new hl7V3.DispenseNotificationSupplyHeader(new hl7V3.GlobalIdentifier(messageId), hl7Author)
  supplyHeader.pertinentInformation1 = hl7PertinentInformation1LineItems
  supplyHeader.pertinentInformation3 = new hl7V3.SupplyHeaderPertinentInformation3(hl7PertinentPrescriptionStatus)
  supplyHeader.pertinentInformation4 = new hl7V3.SupplyHeaderPertinentInformation4(hl7PertinentPrescriptionIdentifier)
  supplyHeader.inFulfillmentOf = new hl7V3.InFulfillmentOf(hl7PriorOriginalRef)

  if (isRepeatDispensing(fhirFirstMedicationDispense)) {
    const repeatInfo = getExtensionForUrl(
      fhirFirstMedicationDispense.extension,
      "https://fhir.nhs.uk/StructureDefinition/Extension-EPS-RepeatInformation",
      "MedicationDispense.extension"
    ) as fhir.ExtensionExtension<fhir.IntegerExtension>

    supplyHeader.repeatNumber = getRepeatNumberFromRepeatInfoExtension(repeatInfo, "MedicationDispense.extension")
  }

  return new hl7V3.DispenseNotificationPertinentInformation1(supplyHeader)
}

function getLineItemIdentifiers(fhirMedicationDispenses: Array<fhir.MedicationDispense>) {
  return fhirMedicationDispenses.map(medicationDispense =>
    getIdentifierValueForSystem(
      medicationDispense.identifier,
      "https://fhir.nhs.uk/Id/prescription-dispense-item-number",
      "MedicationDispense.identifier"
    )
  )
}

function getNhsNumber(fhirPatient: fhir.Patient, fhirFirstMedicationDispense: fhir.MedicationDispense) {
  return fhirPatient
    ? getIdentifierValueOrNullForSystem(
      fhirPatient.identifier,
      "https://fhir.nhs.uk/Id/nhs-number",
      "Patient.identifier.value")
    : fhirFirstMedicationDispense.subject.identifier.value
}

function createPatient(patient: fhir.Patient, firstMedicationDispense: fhir.MedicationDispense): hl7V3.Patient {
  const nhsNumber = getNhsNumber(patient, firstMedicationDispense)
  const hl7Patient = new hl7V3.Patient()
  hl7Patient.id = new hl7V3.NhsNumber(nhsNumber)
  return hl7Patient
}

function createCareRecordElementCategory(fhirIdentifiers: Array<string>) {
  const hl7CareRecordElementCategory = new hl7V3.CareRecordElementCategory()
  hl7CareRecordElementCategory.component = fhirIdentifiers.map(
    fhirIdentifier => new hl7V3.CareRecordElementCategoryComponent(
      new hl7V3.ActRef({
        _attributes: {
          classCode: "SBADM",
          moodCode: "PRMS"
        },
        id: new hl7V3.GlobalIdentifier(fhirIdentifier)
      })
    )
  )
  return hl7CareRecordElementCategory
}

function createPriorMessageRef(fhirHeader: fhir.MessageHeader) {
  const replacementOf = getExtensionForUrlOrNull(
    fhirHeader.extension,
    "https://fhir.nhs.uk/StructureDefinition/Extension-replacementOf",
    "MessageHeader.extension"
  ) as fhir.IdentifierExtension

  if (replacementOf) {
    return new hl7V3.MessageRef(new hl7V3.GlobalIdentifier(replacementOf.valueIdentifier.value))
  }
}

function createDispenseNotificationSupplyHeaderPertinentInformation1(
  fhirMedicationDispense: fhir.MedicationDispense,
  fhirContainedMedicationRequest: fhir.MedicationRequest,
  suppliedMedicationCoding: fhir.Coding,
  requestedMedicationCoding: fhir.Coding,
  logger: pino.Logger
): hl7V3.DispenseNotificationSupplyHeaderPertinentInformation1 {
  const fhirPrescriptionDispenseItemNumber = getPrescriptionItemNumber(fhirMedicationDispense)
  const fhirPrescriptionLineItemStatus = getPrescriptionLineItemStatus(fhirMedicationDispense)
  const fhirDosageInstruction = getDosageInstruction(fhirMedicationDispense, logger)
  const hl7SuppliedLineItemQuantitySnomedCode = new hl7V3.SnomedCode(
    fhirMedicationDispense.quantity.code,
    fhirMedicationDispense.quantity.unit
  )
  const hl7UnitValue = fhirMedicationDispense.quantity.value.toString()
  const hl7Quantity = new hl7V3.QuantityInAlternativeUnits(
    hl7UnitValue,
    hl7UnitValue,
    hl7SuppliedLineItemQuantitySnomedCode
  )

  const hl7RequestedLineItemSnomedCode = new hl7V3.SnomedCode(
    requestedMedicationCoding.code,
    requestedMedicationCoding.display
  )
  const hl7RequestedLineItemQuantitySnomedCode = new hl7V3.SnomedCode(
    fhirContainedMedicationRequest.dispenseRequest.quantity.code,
    fhirContainedMedicationRequest.dispenseRequest.quantity.unit
  )
  const hl7RequestedUnitValue = fhirContainedMedicationRequest.dispenseRequest.quantity.value.toString()
  const hl7RequestedQuantity = new hl7V3.QuantityInAlternativeUnits(
    hl7RequestedUnitValue,
    hl7RequestedUnitValue,
    hl7RequestedLineItemQuantitySnomedCode
  )

  const hl7ItemStatusCode = new hl7V3.ItemStatusCode(
    fhirPrescriptionLineItemStatus.code,
    fhirPrescriptionLineItemStatus.display
  )
  const hl7PriorOriginalItemRef = getPrescriptionItemId(fhirContainedMedicationRequest)
  const hl7SuppliedLineItemQuantity = createSuppliedLineItemQuantity(
    hl7Quantity,
    suppliedMedicationCoding,
    fhirDosageInstruction
  )

  const hl7PertinentSuppliedLineItem = new hl7V3.DispenseNotificationSuppliedLineItem(
    new hl7V3.GlobalIdentifier(fhirPrescriptionDispenseItemNumber)
  )
  hl7PertinentSuppliedLineItem.consumable = new hl7V3.Consumable(
    new hl7V3.RequestedManufacturedProduct(
      new hl7V3.ManufacturedRequestedMaterial(
        hl7RequestedLineItemSnomedCode
      )
    )
  )
  hl7PertinentSuppliedLineItem.component = [
    new hl7V3.DispenseNotificationSuppliedLineItemComponent(hl7SuppliedLineItemQuantity)
  ]
  hl7PertinentSuppliedLineItem.component1 = new hl7V3.DispenseNotificationSuppliedLineItemComponent1(
    new hl7V3.SupplyRequest(hl7RequestedLineItemQuantitySnomedCode, hl7RequestedQuantity)
  )
  hl7PertinentSuppliedLineItem.pertinentInformation3 = new hl7V3.SuppliedLineItemPertinentInformation3(
    new hl7V3.ItemStatus(hl7ItemStatusCode)
  )
  hl7PertinentSuppliedLineItem.inFulfillmentOf = new hl7V3.SuppliedLineItemInFulfillmentOf(
    new hl7V3.OriginalPrescriptionRef(new hl7V3.GlobalIdentifier(hl7PriorOriginalItemRef))
  )

  if (isRepeatDispensing(fhirMedicationDispense)) {
    const repeatInfo = getExtensionForUrl(
      fhirMedicationDispense.extension,
      "https://fhir.nhs.uk/StructureDefinition/Extension-EPS-RepeatInformation",
      "MedicationDispense.extension"
    ) as fhir.ExtensionExtension<fhir.IntegerExtension>

    hl7PertinentSuppliedLineItem.repeatNumber = getRepeatNumberFromRepeatInfoExtension(
      repeatInfo,
      "MedicationDispense.extension"
    )
  }

  return new hl7V3.DispenseNotificationSupplyHeaderPertinentInformation1(hl7PertinentSuppliedLineItem)
}

function createSuppliedLineItemQuantity(
  hl7Quantity: hl7V3.QuantityInAlternativeUnits,
  fhirProductCoding: fhir.Coding,
  fhirDosageInstruction: fhir.Dosage
): hl7V3.DispenseNotificationSuppliedLineItemQuantity {
  const productCode = new hl7V3.SnomedCode(fhirProductCoding.code, fhirProductCoding.display)
  const manufacturedRequestedMaterial = new hl7V3.ManufacturedRequestedMaterial(productCode)
  const suppliedManufacturedProduct = new hl7V3.SuppliedManufacturedProduct(manufacturedRequestedMaterial)
  const dispenseProduct = new hl7V3.DispenseProduct(suppliedManufacturedProduct)
  const hl7SuppliedLineItemQuantity = new hl7V3.DispenseNotificationSuppliedLineItemQuantity(
    hl7Quantity,
    dispenseProduct
  )
  // eslint-disable-next-line max-len
  hl7SuppliedLineItemQuantity.pertinentInformation1 = new hl7V3.DispenseNotificationSuppliedLineItemQuantityPertinentInformation1(
    new hl7V3.SupplyInstructions(fhirDosageInstruction.text)
  )
  return hl7SuppliedLineItemQuantity
}

export function getPrescriptionStatus(fhirFirstMedicationDispense: fhir.MedicationDispense): fhir.CodingExtension {
  return getExtensionForUrl(
    fhirFirstMedicationDispense.extension,
    "https://fhir.nhs.uk/StructureDefinition/Extension-EPS-TaskBusinessStatus",
    "MedicationDispense.extension") as fhir.CodingExtension
}

function getPrescriptionItemId(fhirMedicationRequest: fhir.MedicationRequest): string {
  return getIdentifierValueForSystem(
    fhirMedicationRequest.identifier,
    "https://fhir.nhs.uk/Id/prescription-order-item-number",
    "MedicationDispense.contained[0].identifier"
  )
}

function getDosageInstruction(
  fhirMedicationDispense: fhir.MedicationDispense,
  logger: pino.Logger
): fhir.Dosage {
  auditDoseToTextIfEnabled(fhirMedicationDispense.dosageInstruction, logger)
  return onlyElement(
    fhirMedicationDispense.dosageInstruction,
    "MedicationDispense.dosageInstruction"
  )
}

export function getPrescriptionItemNumber(fhirMedicationDispense: fhir.MedicationDispense): string {
  return getIdentifierValueForSystem(
    fhirMedicationDispense.identifier,
    "https://fhir.nhs.uk/Id/prescription-dispense-item-number",
    "MedicationDispense.identifier"
  )
}

function getPrescriptionLineItemStatus(fhirMedicationDispense: fhir.MedicationDispense): fhir.Coding {
  return getCodingForSystem(
    fhirMedicationDispense.type.coding,
    "https://fhir.nhs.uk/CodeSystem/medicationdispense-type",
    "MedicationDispense.type.coding"
  )
}

function createPrescriptionId(
  fhirFirstMedicationRequest: fhir.MedicationRequest
): hl7V3.PrescriptionId {
  const hl7PertinentPrescriptionId = fhirFirstMedicationRequest.groupIdentifier.value
  return new hl7V3.PrescriptionId(hl7PertinentPrescriptionId)
}

function createOriginalPrescriptionRef(
  fhirFirstMedicationRequest: fhir.MedicationRequest
): hl7V3.OriginalPrescriptionRef {
  const medicationRequestGroupIdentifierUUID = getExtensionForUrl(
    fhirFirstMedicationRequest.groupIdentifier.extension,
    "https://fhir.nhs.uk/StructureDefinition/Extension-DM-PrescriptionId",
    "MedicationRequest.groupIdentifier.extension.valueIdentifier"
  ) as fhir.IdentifierExtension
  const id = medicationRequestGroupIdentifierUUID.valueIdentifier.value
  return new hl7V3.OriginalPrescriptionRef(
    new hl7V3.GlobalIdentifier(id)
  )
}

function createPrescriptionStatus(
  fhirFirstMedicationDispense: fhir.MedicationDispense
): hl7V3.PrescriptionStatus {
  const prescriptionStatusExtension = getPrescriptionStatus(fhirFirstMedicationDispense)
  const prescriptionStatusCoding = prescriptionStatusExtension.valueCoding
  return new hl7V3.PrescriptionStatus(prescriptionStatusCoding.code, prescriptionStatusCoding.display)
}

function isRepeatDispensing(medicationDispense: fhir.MedicationDispense): boolean {
  return !!getExtensionForUrlOrNull(
    medicationDispense.extension,
    "https://fhir.nhs.uk/StructureDefinition/Extension-EPS-RepeatInformation",
    "MedicationDispense.extension"
  )
}
