import * as XmlJs from "xml-js"
import * as crypto from "crypto-js"
import * as uuid from "uuid"
import {createSendMessagePayload} from "./send-message-payload"
import {writeXmlStringCanonicalized} from "../../serialisation/xml"
import {convertParentPrescription} from "./prescribe/parent-prescription"
import {convertCancellation} from "./cancel/cancellation"
import {convertFragmentsToHashableFormat, extractFragments} from "./signature"
import * as requestBuilder from "../../communication/ebxml-request-builder"
import {
  spine,
  hl7V3,
  fhir,
  processingErrors as errors
} from "@models"
import {convertHL7V3DateTimeToIsoDateTimeString} from "../common/dateTime"
import {convertDispenseNotification} from "./dispense/dispense-notification"
import {translateReleaseRequest} from "./dispense/release"
import pino from "pino"
import {convertTaskToDispenseProposalReturn} from "./return/return"
import {convertTaskToEtpWithdraw} from "./withdraw/withdraw"
import {
  getMessageIdFromBundle,
  getMessageIdFromClaim,
  getMessageIdFromTask,
  identifyMessageType
} from "../common"
import Hapi from "@hapi/hapi"
import {convertDispenseClaim} from "./dispense/dispense-claim"
import {getCourseOfTherapyTypeCode} from "./course-of-therapy-type"

export async function convertBundleToSpineRequest(
  bundle: fhir.Bundle,
  headers: Hapi.Util.Dictionary<string>,
  logger: pino.Logger
): Promise<spine.SpineRequest> {
  const messageType = identifyMessageType(bundle)
  const payload = await createPayloadFromBundle(messageType, bundle, headers, logger)
  return requestBuilder.toSpineRequest(payload, headers)
}

type BundleTranslationResult = hl7V3.ParentPrescriptionRoot | hl7V3.CancellationRequestRoot
  | hl7V3.DispenseNotificationRoot | hl7V3.DispenseClaimRoot

async function createPayloadFromBundle(
  messageType: string,
  bundle: fhir.Bundle,
  headers: Hapi.Util.Dictionary<string>,
  logger: pino.Logger
): Promise<hl7V3.SendMessagePayload<BundleTranslationResult>> {
  switch (messageType) {
    case fhir.EventCodingCode.PRESCRIPTION:
      return createParentPrescriptionSendMessagePayload(bundle, headers, logger)
    case fhir.EventCodingCode.CANCELLATION:
      return createCancellationSendMessagePayload(bundle, headers)
    case fhir.EventCodingCode.DISPENSE:
      return await createDispenseNotificationSendMessagePayload(bundle, headers, logger)
  }
}

export function createParentPrescriptionSendMessagePayload(
  bundle: fhir.Bundle,
  headers: Hapi.Util.Dictionary<string>,
  logger: pino.Logger
): hl7V3.SendMessagePayload<hl7V3.ParentPrescriptionRoot> {
  const parentPrescription = convertParentPrescription(bundle, logger)
  const parentPrescriptionRoot = new hl7V3.ParentPrescriptionRoot(parentPrescription)
  const messageId = getMessageIdFromBundle(bundle)
  const interactionId = hl7V3.Hl7InteractionIdentifier.PARENT_PRESCRIPTION_URGENT
  return createSendMessagePayload(messageId, interactionId, headers, parentPrescriptionRoot)
}

export async function createDispenseNotificationSendMessagePayload(
  bundle: fhir.Bundle,
  headers: Hapi.Util.Dictionary<string>,
  logger: pino.Logger
): Promise<hl7V3.SendMessagePayload<hl7V3.DispenseNotificationRoot>> {
  const dispenseNotification = convertDispenseNotification(bundle, logger)
  const dispenseNotificationRoot = new hl7V3.DispenseNotificationRoot(dispenseNotification)
  const messageId = getMessageIdFromBundle(bundle)
  const interactionId = hl7V3.Hl7InteractionIdentifier.DISPENSE_NOTIFICATION
  return createSendMessagePayload(messageId, interactionId, headers, dispenseNotificationRoot)
}

export function createCancellationSendMessagePayload(
  bundle: fhir.Bundle,
  headers: Hapi.Util.Dictionary<string>
): hl7V3.SendMessagePayload<hl7V3.CancellationRequestRoot> {
  const cancellationRequest = convertCancellation(bundle)
  const cancellationRequestRoot = new hl7V3.CancellationRequestRoot(cancellationRequest)
  const messageId = getMessageIdFromBundle(bundle)
  const interactionId = hl7V3.Hl7InteractionIdentifier.CANCEL_REQUEST
  return createSendMessagePayload(messageId, interactionId, headers, cancellationRequestRoot)
}

export function convertFhirMessageToSignedInfoMessage(bundle: fhir.Bundle, logger: pino.Logger): fhir.Parameters {
  const messageType = identifyMessageType(bundle)
  if (messageType !== fhir.EventCodingCode.PRESCRIPTION) {
    throw new errors.InvalidValueError(
      "MessageHeader.eventCoding.code must be 'prescription-order'.",
      "MessageHeader.eventCoding.code"
    )
  }

  const parentPrescription = convertParentPrescription(bundle, logger)
  const fragments = extractFragments(parentPrescription)
  const fragmentsToBeHashed = convertFragmentsToHashableFormat(fragments)
  const base64Digest = createParametersDigest(fragmentsToBeHashed)
  const isoTimestamp = convertHL7V3DateTimeToIsoDateTimeString(fragments.time)
  return createParameters(base64Digest, isoTimestamp)
}

export function createParametersDigest(fragmentsToBeHashed: string): string {
  const digestValue = crypto.SHA1(fragmentsToBeHashed).toString(crypto.enc.Base64)

  const signedInfo: XmlJs.ElementCompact = {
    SignedInfo: {
      _attributes: {
        xmlns: "http://www.w3.org/2000/09/xmldsig#"
      },
      CanonicalizationMethod: new AlgorithmIdentifier("http://www.w3.org/2001/10/xml-exc-c14n#"),
      SignatureMethod: new AlgorithmIdentifier("http://www.w3.org/2000/09/xmldsig#rsa-sha1"),
      Reference: {
        Transforms: {
          Transform: new AlgorithmIdentifier("http://www.w3.org/2001/10/xml-exc-c14n#")
        },
        DigestMethod: new AlgorithmIdentifier("http://www.w3.org/2000/09/xmldsig#sha1"),
        DigestValue: digestValue
      }
    }
  }

  return Buffer.from(writeXmlStringCanonicalized(signedInfo)).toString("base64")
}

function createParameters(base64Digest: string, isoTimestamp: string): fhir.Parameters {
  const digestParameter: fhir.StringParameter = {name: "digest", valueString: base64Digest}
  const timestampParameter: fhir.StringParameter = {name: "timestamp", valueString: isoTimestamp}
  const algorithmParameter: fhir.StringParameter = {name: "algorithm", valueString: "RS1"}
  return new fhir.Parameters([digestParameter, timestampParameter, algorithmParameter])
}

class AlgorithmIdentifier implements XmlJs.ElementCompact {
  _attributes: {
    Algorithm: string
  }

  constructor(algorithm: string) {
    this._attributes = {
      Algorithm: algorithm
    }
  }
}

export function convertParametersToSpineRequest(
  parameters: fhir.Parameters,
  headers: Hapi.Util.Dictionary<string>
): spine.SpineRequest {
  const hl7ReleaseRequest = translateReleaseRequest(parameters)
  const messageId = uuid.v4()
  const interactionId = hl7ReleaseRequest instanceof hl7V3.NominatedPrescriptionReleaseRequestWrapper
    ? hl7V3.Hl7InteractionIdentifier.NOMINATED_PRESCRIPTION_RELEASE_REQUEST
    : hl7V3.Hl7InteractionIdentifier.PATIENT_PRESCRIPTION_RELEASE_REQUEST
  const sendMessagePayload = createSendMessagePayload(messageId, interactionId, headers, hl7ReleaseRequest)
  return requestBuilder.toSpineRequest(sendMessagePayload, headers)
}

export function convertTaskToSpineRequest(
  task: fhir.Task,
  headers: Hapi.Util.Dictionary<string>,
): spine.SpineRequest {
  const payload = createPayloadFromTask(task, headers)
  return requestBuilder.toSpineRequest(payload, headers)
}

type TaskTranslationResult = hl7V3.DispenseProposalReturnRoot | hl7V3.EtpWithdrawRoot

function createPayloadFromTask(
  task: fhir.Task,
  headers: Hapi.Util.Dictionary<string>,
): hl7V3.SendMessagePayload<TaskTranslationResult> {
  switch (task.status) {
    case fhir.TaskStatus.REJECTED:
      return createDispenseProposalReturnSendMessagePayload(task, headers)
    case fhir.TaskStatus.IN_PROGRESS:
      return createDispenserWithdrawSendMessagePayload(task, headers)
  }
}

function createDispenseProposalReturnSendMessagePayload(
  task: fhir.Task,
  headers: Hapi.Util.Dictionary<string>,
) {
  const dispenseProposalReturn = convertTaskToDispenseProposalReturn(task)
  const dispenseProposalReturnRoot = new hl7V3.DispenseProposalReturnRoot(dispenseProposalReturn)
  const messageId = getMessageIdFromTask(task)
  const interactionId = hl7V3.Hl7InteractionIdentifier.DISPENSE_PROPOSAL_RETURN
  return createSendMessagePayload(messageId, interactionId, headers, dispenseProposalReturnRoot)
}

function createDispenserWithdrawSendMessagePayload(task: fhir.Task, headers: Hapi.Util.Dictionary<string>) {
  const etpWithdraw = convertTaskToEtpWithdraw(task)
  const etpWithdrawRoot = new hl7V3.EtpWithdrawRoot(etpWithdraw)
  const messageId = getMessageIdFromTask(task)
  const interactionId = hl7V3.Hl7InteractionIdentifier.DISPENSER_WITHDRAW
  return createSendMessagePayload(messageId, interactionId, headers, etpWithdrawRoot)
}

export function isRepeatDispensing(medicationRequests: Array<fhir.MedicationRequest>): boolean {
  const courseOfTherapyTypeCode = getCourseOfTherapyTypeCode(medicationRequests)
  return courseOfTherapyTypeCode === fhir.CourseOfTherapyTypeCode.CONTINUOUS_REPEAT_DISPENSING
}

export function convertClaimToSpineRequest(
  claim: fhir.Claim,
  headers: Hapi.Util.Dictionary<string>
): spine.SpineRequest {
  const dispenseClaim = convertDispenseClaim(claim)
  const dispenseClaimRoot = new hl7V3.DispenseClaimRoot(dispenseClaim)
  const messageId = getMessageIdFromClaim(claim)
  const interactionId = hl7V3.Hl7InteractionIdentifier.DISPENSE_CLAIM_INFORMATION
  const payload = createSendMessagePayload(messageId, interactionId, headers, dispenseClaimRoot)
  return requestBuilder.toSpineRequest(payload, headers)
}
