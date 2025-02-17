import * as XmlJs from "xml-js"
import {ElementCompact} from "xml-js"
import * as fs from "fs"
import * as path from "path"
import * as LosslessJson from "lossless-json"
import {
  fetcher,
  fhir,
  hl7V3,
  spine
} from "@models"
import Hapi from "@hapi/hapi"
import {readXml} from "../../src/services/serialisation/xml"
import {convertRawResponseToDetailTrackerResponse} from "../../src/services/translation/response/tracker/translation"

export const convertSuccessExamples = fetcher.convertExamples.filter(
  e => e.isSuccess).map(spec => spec.toSuccessJestCase()
)
export const convertFailureExamples = fetcher.convertExamples.filter(
  e => !e.isSuccess).map(spec => spec.toErrorJestCase()
)

export class ExamplePrescription {
  description: string
  fhirMessageUnsigned: fhir.Bundle
  fhirMessageSigned: fhir.Bundle
  fhirMessageCancel: fhir.Bundle
  fhirMessageDispense: fhir.Bundle
  fhirMessageDispenseAmend: fhir.Bundle
  fhirMessageDigest: fhir.Parameters
  fhirMessageClaim: fhir.Claim
  hl7V3Message: ElementCompact
  hl7V3MessageCancel: ElementCompact
  hl7V3MessageDispense: ElementCompact
  hl7V3MessageDispenseAmend: ElementCompact
  hl7V3MessageClaim: ElementCompact

  hl7V3SignatureFragments?: ElementCompact
  hl7V3FragmentsCanonicalized?: string

  constructor(description: string, search: string) {
    const location = getLocation(search)

    const fhirMessageUnsignedStr = fs.readFileSync(
      path.join(location, "1-Prepare-Request-200_OK.json"),
      "utf-8"
    )
    const fhirMessageSignedStr = fs.readFileSync(
      path.join(location, "1-Process-Request-Send-200_OK.json"),
      "utf-8"
    )
    const fhirMessageDigestStr = fs.readFileSync(
      path.join(location, "1-Prepare-Response-200_OK.json"),
      "utf-8"
    )
    const hl7V3MessageStr = fs.readFileSync(
      path.join(location, "1-Convert-Response-Send-200_OK.xml"),
      "utf-8"
    )

    this.description = description
    this.fhirMessageUnsigned = LosslessJson.parse(fhirMessageUnsignedStr)
    this.fhirMessageSigned = LosslessJson.parse(fhirMessageSignedStr)
    this.fhirMessageDigest = LosslessJson.parse(fhirMessageDigestStr)
    this.hl7V3Message = XmlJs.xml2js(hl7V3MessageStr, {compact: true})

    const fhirMessageCancelPath = path.join(location, "1-Process-Request-Cancel-200_OK.json")
    if (fs.existsSync(fhirMessageCancelPath)) {
      const fhirMessageCancelStr = fs.readFileSync(fhirMessageCancelPath, "utf-8")
      this.fhirMessageCancel = LosslessJson.parse(fhirMessageCancelStr)
    }

    const hl7V3MessageCancelPath = path.join(location, "1-Convert-Response-Cancel-200_OK.xml")
    if (fs.existsSync(hl7V3MessageCancelPath)) {
      const hl7V3MessageCancelStr = fs.readFileSync(hl7V3MessageCancelPath, "utf-8")
      this.hl7V3MessageCancel = XmlJs.xml2js(hl7V3MessageCancelStr, {compact: true})
    }

    const fhirMessageDispensePath = path.join(location, "1-Process-Request-Dispense-200_OK.json")
    if (fs.existsSync(fhirMessageDispensePath)) {
      const fhirMessageDispenseStr = fs.readFileSync(fhirMessageDispensePath, "utf-8")
      this.fhirMessageDispense = LosslessJson.parse(fhirMessageDispenseStr)
    }

    const hl7V3MessageDispensePath = path.join(location, "1-Convert-Response-Dispense-200_OK.xml")
    if (fs.existsSync(hl7V3MessageDispensePath)) {
      const hl7V3MessageDispenseStr = fs.readFileSync(hl7V3MessageDispensePath, "utf-8")
      this.hl7V3MessageDispense = XmlJs.xml2js(hl7V3MessageDispenseStr, {compact: true})
    }

    const fhirMessageDispenseAmendPath = path.join(location, "1-Process-Request-DispenseAmend-200_OK.json")
    if (fs.existsSync(fhirMessageDispenseAmendPath)) {
      const fhirMessageDispenseAmendStr = fs.readFileSync(fhirMessageDispenseAmendPath, "utf-8")
      this.fhirMessageDispense = LosslessJson.parse(fhirMessageDispenseAmendStr)
    }

    const hl7V3MessageDispenseAmendPath = path.join(location, "1-Convert-Response-DispenseAmend-200_OK.xml")
    if (fs.existsSync(hl7V3MessageDispenseAmendPath)) {
      const hl7V3MessageDispenseStr = fs.readFileSync(hl7V3MessageDispenseAmendPath, "utf-8")
      this.hl7V3MessageDispenseAmend = XmlJs.xml2js(hl7V3MessageDispenseStr, {compact: true})
    }

    const fhirMessageClaimPath = path.join(location, "1-Claim-Request-200_OK.json")
    if (fs.existsSync(fhirMessageClaimPath)) {
      const fhirMessageClaimStr = fs.readFileSync(fhirMessageClaimPath, "utf-8")
      this.fhirMessageClaim = LosslessJson.parse(fhirMessageClaimStr)
    }

    const hl7V3MessageClaimPath = path.join(location, "1-Convert-Response-Claim-200_OK.xml")
    if (fs.existsSync(hl7V3MessageClaimPath)) {
      const hl7V3MessageClaimStr = fs.readFileSync(hl7V3MessageClaimPath, "utf-8")
      this.hl7V3MessageClaim = XmlJs.xml2js(hl7V3MessageClaimStr, {compact: true})
    }
  }
}

export const examplePrescription1 = new ExamplePrescription(
  "repeat dispensing",
  // eslint-disable-next-line max-len
  "secondary-care/community/repeat-dispensing/nominated-pharmacy/clinical-practitioner/multiple-medication-requests/prescriber-endorsed"
)

const hl7V3SignatureFragments1Str = fs.readFileSync(
  path.join(__dirname, "./signature-fragments/PrepareIntermediate-Hl7V3SignatureFragments.xml"),
  "utf8"
)
const hl7V3SignatureFragments1 = XmlJs.xml2js(hl7V3SignatureFragments1Str, {compact: true}) as ElementCompact
examplePrescription1.hl7V3SignatureFragments = hl7V3SignatureFragments1

const hl7V3SignatureFragmentsCanonicalized1 = fs.readFileSync(
  path.join(__dirname, "./signature-fragments/PrepareIntermediate-Hl7V3SignatureFragmentsCanonicalized.txt"),
  "utf8"
)
examplePrescription1.hl7V3FragmentsCanonicalized = hl7V3SignatureFragmentsCanonicalized1.replace("\n", "")

export const examplePrescription2 = new ExamplePrescription(
  "acute, nominated pharmacy",
  "secondary-care/community/acute/nominated-pharmacy/nurse/prescribing-and-professional-codes"
)

export const examplePrescription3 = new ExamplePrescription(
  "homecare",
  "secondary-care/homecare/acute/nominated-pharmacy/clinical-practitioner")

export const specification = [
  examplePrescription1,
  examplePrescription2,
  examplePrescription3
]

export interface ExampleSpineResponse {
  response: spine.SpineDirectResponse<string>
  hl7ErrorCode: string | undefined
  fhirErrorCode: string | undefined
  acknowledgementCode: hl7V3.AcknowledgementTypeCode
}

const asyncSuccess: ExampleSpineResponse = {
  response: {
    body: fs.readFileSync(
      path.join(__dirname, "./spine-responses/async_success.xml"),
      "utf8"
    ),
    statusCode: 200
  },
  hl7ErrorCode: undefined,
  fhirErrorCode: undefined,
  acknowledgementCode: hl7V3.AcknowledgementTypeCode.ACKNOWLEDGED
}

const syncError: ExampleSpineResponse = {
  response: {
    body: fs.readFileSync(
      path.join(__dirname, "./spine-responses/sync_error.xml"),
      "utf8"
    ),
    statusCode: 400
  },
  hl7ErrorCode: "202",
  fhirErrorCode: "ERROR",
  acknowledgementCode: hl7V3.AcknowledgementTypeCode.REJECTED
}

const asyncError: ExampleSpineResponse = {
  response: {
    body: fs.readFileSync(
      path.join(__dirname, "./spine-responses/async_error.xml"),
      "utf8"
    ),
    statusCode: 400
  },
  hl7ErrorCode: "5000",
  fhirErrorCode: "FAILURE_TO_PROCESS_MESSAGE",
  acknowledgementCode: hl7V3.AcknowledgementTypeCode.ERROR
}

const syncMultipleError: ExampleSpineResponse = {
  response: {
    body: fs.readFileSync(
      path.join(__dirname, "./spine-responses/sync_multiple_error.xml"),
      "utf8"
    ),
    statusCode: 400
  },
  hl7ErrorCode: "202",
  fhirErrorCode: "ERROR",
  acknowledgementCode: hl7V3.AcknowledgementTypeCode.REJECTED
}

const asyncMultipleError: ExampleSpineResponse = {
  response: {
    body: fs.readFileSync(
      path.join(__dirname, "./spine-responses/async_multiple_error.xml"),
      "utf8"
    ),
    statusCode: 400
  },
  hl7ErrorCode: "5000",
  fhirErrorCode: "ERROR",
  acknowledgementCode: hl7V3.AcknowledgementTypeCode.ERROR
}

const cancellationSuccess: ExampleSpineResponse = {
  response: {
    body: fs.readFileSync(
      path.join(__dirname, "./spine-responses/cancel_success.xml"),
      "utf8"
    ),
    statusCode: 200
  },
  hl7ErrorCode: "0001",
  fhirErrorCode: "PATIENT_DECEASED",
  acknowledgementCode: hl7V3.AcknowledgementTypeCode.ACKNOWLEDGED
}

const cancellationNotFoundError: ExampleSpineResponse = {
  response: {
    body: fs.readFileSync(
      path.join(__dirname, "./spine-responses/cancel_error.xml"),
      "utf8"
    ),
    statusCode: 400
  },
  hl7ErrorCode: "0008",
  fhirErrorCode: "MISSING_VALUE",
  acknowledgementCode: hl7V3.AcknowledgementTypeCode.ERROR
}

const cancellationDispensedError: ExampleSpineResponse = {
  response: {
    body: fs.readFileSync(
      path.join(__dirname, "./spine-responses/cancel_error_dispensed.xml"),
      "utf8"
    ),
    statusCode: 400
  },
  hl7ErrorCode: "0004",
  fhirErrorCode: "ERROR",
  acknowledgementCode: hl7V3.AcknowledgementTypeCode.ERROR
}

export const spineResponses = {
  success: asyncSuccess,
  singleErrors: [syncError, asyncError],
  multipleErrors: [syncMultipleError, asyncMultipleError],
  cancellationSuccess,
  cancellationNotFoundError,
  cancellationDispensedError
}

export const detailTrackerResponses = {
  success1LineItem: readDetailTrackerResponse("success-1-lineItem.json"),
  success2LineItems: readDetailTrackerResponse("success-2-lineItems.json"),
  successCreated: readDetailTrackerResponse("success-created.json"),
  successClaimed: readDetailTrackerResponse("success-claimed.json"),
  errorNoIssueNumber: readDetailTrackerResponse("error-no-issue-number.json")
}

export const summaryTrackerResponses = {
  success: readSummaryTrackerResponse("success.json")
}

function readDetailTrackerResponse(filename: string): spine.DetailTrackerResponse {
  const filePath = path.join(__dirname, `./spine-responses/tracker-responses/detail/${filename}`)
  const responseStr = fs.readFileSync(filePath, "utf8")
  const responseObj = JSON.parse(responseStr)
  return convertRawResponseToDetailTrackerResponse(responseObj)
}

function readSummaryTrackerResponse(filename: string): spine.SummaryTrackerResponse {
  const filePath = path.join(__dirname, `./spine-responses/tracker-responses/summary/${filename}`)
  const responseStr = fs.readFileSync(filePath, "utf8")
  return JSON.parse(responseStr)
}

function getLocation(search: string) {
  return fetcher
    .exampleFiles
    .filter(e => e.dir.includes(search))
    .find(e => e.number === "1")
    .dir
}

export const validTestHeaders: Hapi.Util.Dictionary<string> = {
  "nhsd-request-id": "test",
  "nhsd-asid": "200000001285",
  "nhsd-party-key": "T141D-822234",
  "nhsd-identity-uuid": "555254239107", //USERQ RANDOM Mr
  "nhsd-session-urid": "555254240100" //S8000:G8000:R8001 - "Clinical":"Clinical Provision":"Nurse Access Role"
}

export const parentPrescriptions = {
  validSignature: readXml(fs.readFileSync(
    path.join(__dirname, "./signed-prescriptions/ValidSignature.xml"),
    "utf-8"
  )) as hl7V3.ParentPrescriptionRoot,
  invalidSignature: readXml(fs.readFileSync(
    path.join(__dirname, "./signed-prescriptions/SignatureIsInvalid.xml"),
    "utf-8"
  )) as hl7V3.ParentPrescriptionRoot,
  nonMatchingSignature: readXml(fs.readFileSync(
    path.join(__dirname, "./signed-prescriptions/SignatureDoesNotMatchPrescription.xml"),
    "utf-8"
  )) as hl7V3.ParentPrescriptionRoot
}
