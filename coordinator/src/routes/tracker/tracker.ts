import Hapi from "@hapi/hapi"
import {hl7V3, fhir, spine} from "@models"
import {BASE_PATH, ContentTypes, getPayload} from "../util"
import {createInnerBundle} from "../../services/translation/response/release/release-response"
import {track} from "../../services/communication/tracker/tracker"
import {getRequestId} from "../../utils/headers"

/* The PAUI Tracker */

/* The PAUI Tracker */

export default [{
  method: "POST",
  path: `${BASE_PATH}/Tracker`,
  handler: async (
    request: Hapi.Request, responseToolkit: Hapi.ResponseToolkit
  ): Promise<Hapi.Lifecycle.ReturnValue> => {
    const trackerRequest = getPayload(request) as spine.GetPrescriptionMetadataRequest
    trackerRequest.message_id = getRequestId(request.headers)
    
    const hl7v3Prescription = await track(trackerRequest, request.logger)

    const response = hl7v3Prescription
      ? createFhirPrescriptionResponse(hl7v3Prescription)
      : createErrorResponse()

    return responseToolkit
      .response(response)
      .code(200) // todo
      .type(ContentTypes.FHIR)
  }
}]

// todo: consolidate with /$verify-signature
function createFhirPrescriptionResponse(hl7v3Prescription: hl7V3.ParentPrescription) {
  return createInnerBundle(hl7v3Prescription, "")
}

function createErrorResponse() {
  return fhir.createOperationOutcome([
    fhir.createOperationOutcomeIssue(
      fhir.IssueCodes.NOT_FOUND,
      "error",
      fhir.createCodeableConcept(
        "https://fhir.nhs.uk/CodeSystem/Spine-ErrorOrWarningCode",
        "RESOURCE_NOT_FOUND",
        "Resource not found"
      ))
  ])
}
