import {
  callFhirValidator,
  ContentTypes,
  filterValidatorResponse,
  handleResponse,
  VALIDATOR_HOST
} from "../../src/routes/util"
import {clone} from "../resources/test-helpers"
import * as TestResources from "../resources/test-resources"
import {getMessageHeader} from "../../src/services/translation/common/getResourcesOfType"
import axios from "axios"
import * as moxios from "moxios"
import {fhir, spine} from "@models"
import {identifyMessageType} from "../../src/services/translation/common"
import * as Hapi from "@hapi/hapi"
import * as HapiShot from "@hapi/shot"

jest.mock("../../src/services/translation/response", () => ({
  translateToFhir: () => ({statusCode: 200, fhirResponse: {value: "some FHIR response"}})
}))

test("API only forwards accept header to validator", async () => {
  moxios.install(axios)
  moxios.stubRequest(`${VALIDATOR_HOST}/$validate`, {
    status: 200,
    responseText: JSON.stringify({
      "resourceType": "OperationOutcome"
    })
  })

  const exampleHeaders = {
    "accept": "application/json+fhir",
    "content-type": "application/my-content-type"
  }

  await callFhirValidator("data", exampleHeaders)
  const requestHeaders = moxios.requests.mostRecent().headers

  expect(requestHeaders["Accept"]).not.toBe("application/json+fhir")
  expect(requestHeaders["Content-Type"]).toBe("application/my-content-type")
  moxios.uninstall(axios)
})

describe("identifyMessageType", () => {
  let bundle: fhir.Bundle
  let messageHeader: fhir.MessageHeader

  beforeEach(() => {
    bundle = clone(TestResources.examplePrescription1.fhirMessageUnsigned)
    messageHeader = getMessageHeader(bundle)
  })

  test("identifies a prescription message correctly", () => {
    const messageType = fhir.EventCodingCode.PRESCRIPTION
    messageHeader.eventCoding.code = messageType
    expect(identifyMessageType(bundle)).toBe(messageType)
  })
})

function createRoute<T>(spineResponse: spine.SpineDirectResponse<T> | spine.SpinePollableResponse): Hapi.ServerRoute {
  return {
    method: "POST",
    path: "/test",
    handler: async (request, responseToolkit) => {
      return handleResponse(request, spineResponse, responseToolkit)
    }
  }
}

function createRouteOptions<T>(
  spineResponse: spine.SpineDirectResponse<T> | spine.SpinePollableResponse,
  headers?: HapiShot.Headers
) {
  return {
    method: "POST",
    url: "/test",
    headers: headers,
    payload: spineResponse
  }
}

describe("handleResponse", () => {
  let server: Hapi.Server

  beforeEach(async () => {
    server = Hapi.server()
  })

  afterEach(async () => {
    await server.stop()
  })

  test("pollable response", async () => {
    const spineResponse: spine.SpinePollableResponse = {
      pollingUrl: "testUrl",
      statusCode: 202
    }

    server.route([createRoute(spineResponse)])

    const response = await server.inject(createRouteOptions(spineResponse))

    expect(response.headers["content-location"]).toBe("testUrl")
  })

  test("operationOutcome response", async () => {
    const operationOutcome: fhir.OperationOutcome = {
      resourceType: "OperationOutcome",
      issue: []
    }
    const spineResponse: spine.SpineDirectResponse<fhir.OperationOutcome> = {
      body: operationOutcome,
      statusCode: 200
    }

    server.route([createRoute(spineResponse)])

    const response = await server.inject(createRouteOptions(spineResponse))

    expect(JSON.parse(response.payload)).toEqual(operationOutcome)
    expect(response.headers["content-type"]).toEqual(ContentTypes.FHIR)
  })

  test("bundle response", async () => {
    const bundle: fhir.Bundle = {
      resourceType: "Bundle",
      entry: []
    }
    const spineResponse: spine.SpineDirectResponse<fhir.Bundle> = {
      body: bundle,
      statusCode: 200
    }

    server.route([createRoute(spineResponse)])

    const response = await server.inject(createRouteOptions(spineResponse))

    expect(JSON.parse(response.payload)).toEqual(bundle)
    expect(response.headers["content-type"]).toEqual(ContentTypes.FHIR)
  })

  test("xml response", async () => {
    const spineResponse: spine.SpineDirectResponse<string> = {
      body: "some xml response",
      statusCode: 200
    }

    server.route([createRoute(spineResponse)])

    const response = await server.inject(
      createRouteOptions(spineResponse, {"X-Raw-Response": "true"})
    )

    expect(response.payload).toEqual("some xml response")
    expect(response.headers["content-type"]).toEqual(ContentTypes.XML)
  })

  test("fhir response", async () => {
    const spineResponse: spine.SpineDirectResponse<string> = {
      body: "some xml response",
      statusCode: 200
    }

    server.route([createRoute(spineResponse)])

    const response = await server.inject(createRouteOptions(spineResponse))

    expect(JSON.parse(response.payload)).toEqual({value: "some FHIR response"})
    expect(response.headers["content-type"]).toEqual(ContentTypes.FHIR)
  })
})

describe("filterValidatorResponse", () => {
  test("returns errors if present", () => {
    const validatorResponse: fhir.OperationOutcome = {
      resourceType: "OperationOutcome",
      issue: [{
        code: undefined,
        severity: "error"
      }]
    }
    expect(filterValidatorResponse(validatorResponse, false).issue).toHaveLength(1)
  })

  test("returns empty if no errors", () => {
    const validatorResponse: fhir.OperationOutcome = {
      resourceType: "OperationOutcome",
      issue: [{
        code: undefined,
        severity: "warning"
      }]
    }
    expect(filterValidatorResponse(validatorResponse, false).issue).toHaveLength(0)
  })

  test("ignores errors that have nhsNumberVerification", () => {
    const validatorResponse: fhir.OperationOutcome = {
      resourceType: "OperationOutcome",
      issue: [
        {
          "severity": "error",
          "code": fhir.IssueCodes.PROCESSING,
          // eslint-disable-next-line max-len
          "diagnostics": "None of the codes provided are in the value set https://fhir.hl7.org.uk/ValueSet/UKCore-NHSNumberVerificationStatus (https://fhir.hl7.org.uk/ValueSet/UKCore-NHSNumberVerificationStatus), and a code from this value set is required) (codes = https://fhir.hl7.org.uk/CodeSystem/UKCore-NHSNumberVerificationStatus#01)"
        }, {
          "severity": "error",
          "code": fhir.IssueCodes.PROCESSING,
          // eslint-disable-next-line max-len
          "diagnostics": "Unknown code 'https://fhir.hl7.org.uk/CodeSystem/UKCore-NHSNumberVerificationStatus#01' for 'https://fhir.hl7.org.uk/CodeSystem/UKCore-NHSNumberVerificationStatus#01'"
        }
      ]
    }
    expect(filterValidatorResponse(validatorResponse, false).issue).toHaveLength(0)
  })
})
