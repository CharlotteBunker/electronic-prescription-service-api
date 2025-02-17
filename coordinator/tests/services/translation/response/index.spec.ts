import * as TestResources from "../../../resources/test-resources"
import {translateToFhir} from "../../../../src/services/translation/response"
import {fhir, spine} from "@models"
import pino from "pino"
import {SpineResponseHandler} from "../../../../src/services/translation/response/spine-response-handler"

describe("translateToFhir", () => {
  const spineResponses = TestResources.spineResponses
  const logger = pino()

  it("converts spine prescription-order successes", () => {
    const spineResponse = spineResponses.success.response
    const returnedValues = translateToFhir(spineResponse, logger)
    const body = returnedValues.fhirResponse as fhir.OperationOutcome
    const statusCode = returnedValues.statusCode
    expect(body.issue).toHaveLength(1)
    expect(body.issue[0].severity).toEqual("information")
    expect(body.issue[0].code).toEqual("informational")
    expect(body.issue[0].details).toBeFalsy()
    expect(statusCode).toBe(200)
  })

  const testCases = [
    ...TestResources.spineResponses.singleErrors,
    ...TestResources.spineResponses.multipleErrors
  ]

  test.each(testCases)("returns a valid response for errors (single or multiple) from spine",
    (spineResponse) => {
      const returnedValues = translateToFhir(spineResponse.response, logger)
      const body = returnedValues.fhirResponse as fhir.OperationOutcome
      const statusCode = returnedValues.statusCode

      expect(body).not.toEqual(SpineResponseHandler.createServerErrorResponse().fhirResponse)
      expect(statusCode).toBe(400)
    })

  test("returns internal server error on unexpected spine response", () => {
    const bodyString = "this body doesnt pass the regex checks"
    const spineResponse: spine.SpineDirectResponse<string> = {
      body: bodyString,
      statusCode: 420
    }

    const returnedValues = translateToFhir(spineResponse, logger)
    const body = returnedValues.fhirResponse as fhir.OperationOutcome

    expect(body).toEqual(SpineResponseHandler.createServerErrorResponse().fhirResponse)
    expect(returnedValues.statusCode).toBe(500)
  })

  test.each([spineResponses.cancellationSuccess, spineResponses.cancellationDispensedError])(
    "cancellation returns Bundle when no issueCode", (spineResponse) => {
      const translatedResponse = translateToFhir(spineResponse.response, logger)

      expect(translatedResponse.fhirResponse.resourceType).toBe("Bundle")
      expect(translatedResponse.statusCode).toBe(spineResponse.response.statusCode)
    })

  test.each([spineResponses.cancellationNotFoundError])(
    "cancellation returns operationOutcome when issueCode present", (spineResponse) => {
      const translatedResponse = translateToFhir(spineResponse.response, logger)

      expect(translatedResponse.fhirResponse.resourceType).toBe("OperationOutcome")
      expect(translatedResponse.statusCode).toBe(spineResponse.response.statusCode)
    })
})
