import {spine} from "@models"
import axios, {AxiosError, AxiosResponse} from "axios"
import pino from "pino"
import {SpineDirectResponse} from "../../../../models/spine"
import {serviceHealthCheck, StatusCheckResponse} from "../../utils/status"
import {addEbXmlWrapper} from "./ebxml-request-builder"
import {SpineClient} from "./spine-client"

const SPINE_URL_SCHEME = "https"
const SPINE_ENDPOINT = process.env.SPINE_URL
const SPINE_PATH = "Prescription"
const BASE_PATH = process.env.BASE_PATH

export class LiveSpineClient implements SpineClient {
  private readonly spineEndpoint: string
  private readonly spinePath: string
  private readonly ebXMLBuilder: (spineRequest: spine.SpineRequest) => string

  constructor(
    spineEndpoint: string = null,
    spinePath: string = null,
    ebXMLBuilder: (spineRequest: spine.SpineRequest) => string = null
  ) {
    this.spineEndpoint = spineEndpoint || SPINE_ENDPOINT
    this.spinePath = spinePath || SPINE_PATH
    this.ebXMLBuilder = ebXMLBuilder || addEbXmlWrapper
  }

  async send(spineRequest: spine.SpineRequest, logger: pino.Logger): Promise<spine.SpineResponse<unknown>> {
    logger.info("Building EBXML wrapper for SpineRequest")
    const wrappedMessage = this.ebXMLBuilder(spineRequest)
    const address = this.getSpineUrlForPrescription()

    logger.info(`Attempting to send message to ${address}`)
    try {
      const result = await axios.post<string>(
        address,
        wrappedMessage,
        {
          headers: {
            "Content-Type": "multipart/related;" +
              " boundary=\"--=_MIME-Boundary\";" +
              " type=text/xml;" +
              " start=ebXMLHeader@spine.nhs.uk",
            "SOAPAction": `urn:nhs:names:services:mm/${spineRequest.interactionId}`,
            "NHSD-Request-ID": spineRequest.messageId
          }
        }
      )
      return LiveSpineClient.handlePollableOrImmediateResponse(result, logger)
    } catch (error) {
      logger.error(`Failed post request for prescription message. Error: ${error}`)
      return LiveSpineClient.handleError(error)
    }
  }

  async sendSpineRequest(request: spine.HttpRequest, logger: pino.Logger): Promise<spine.SpineDirectResponse<string>> {
    try {
      const address = this.getSpineEndpoint(request.path)
      logger.info(`Attempting to send message to ${address}`)

      const response = await axios.post<string>(
        address,
        request.body,
        {
          headers: request.headers
        }
      )
      return LiveSpineClient.handleImmediateResponse(response, logger)
    } catch (error) {
      logger.error(`Failed post request for ${request.name}. Error: ${error}`)
      return LiveSpineClient.handleError(error) as SpineDirectResponse<string>
    }
  }

  async poll(path: string, fromAsid: string, logger: pino.Logger): Promise<spine.SpineResponse<unknown>> {
    const address = this.getSpineUrlForPolling(path)

    logger.info(`Attempting to send polling message to ${address}`)

    try {
      const result = await axios.get<string>(
        address,
        {
          headers: {
            "nhsd-asid": fromAsid
          }
        }
      )
      return LiveSpineClient.handlePollableOrImmediateResponse(result, logger, `/_poll/${path}`)
    } catch (error) {
      logger.error(`Failed polling request for polling path ${path}. Error: ${error}`)
      return LiveSpineClient.handleError(error)
    }
  }

  private static handlePollableOrImmediateResponse(
    result: AxiosResponse,
    logger: pino.Logger,
    previousPollingUrl?: string
  ) {
    if (result.status === 200) {
      return this.handleImmediateResponse(result, logger)
    }

    if (result.status === 202) {
      logger.info("Successful request, returning SpinePollableResponse")
      const contentLocation = result.headers["content-location"]
      const relativePollingUrl = contentLocation ? contentLocation : previousPollingUrl
      logger.info(`Got content location ${contentLocation}. Using polling URL ${relativePollingUrl}`)
      return {
        pollingUrl: `${BASE_PATH}${relativePollingUrl}`,
        statusCode: result.status
      }
    }

    logger.error(`Got the following response from spine:\n${result.data}`)
    throw Error(`Unsupported status, expected 200 or 202, got ${result.status}`)
  }

  private static handleImmediateResponse(
    result: AxiosResponse,
    logger: pino.Logger
  ) {
    logger.info("Successful request, returning SpineDirectResponse")
    return {
      body: result.data,
      statusCode: result.status
    }
  }

  private static handleError(error: Error): spine.SpineDirectResponse<unknown> {
    const axiosError = error as AxiosError
    if (axiosError.response) {
      return {
        body: axiosError.response.data,
        statusCode: axiosError.response.status
      }
    } else {
      return {
        body: axiosError.message,
        statusCode: 500
      }
    }
  }

  private getSpineEndpoint(requestPath?: string) {
    return `${SPINE_URL_SCHEME}://${this.spineEndpoint}/${requestPath}`
  }

  private getSpineUrlForPrescription() {
    return this.getSpineEndpoint(this.spinePath)
  }

  private getSpineUrlForPolling(path: string) {
    return this.getSpineEndpoint(`_poll/${path}`)
  }

  async getStatus(logger: pino.Logger): Promise<StatusCheckResponse> {
    const url = this.getSpineEndpoint(`healthcheck`)
    return serviceHealthCheck(url, logger)
  }
}
