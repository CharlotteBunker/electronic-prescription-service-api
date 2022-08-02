import {hl7V3, spine} from "@models"
import pino from "pino"
import {SpineClient, spineClient} from "../spine-client"
import {PrescriptionRequestBuilder, makeTrackerSoapMessageRequest} from "./tracker-request-builder"
import {extractHl7v3PrescriptionFromMessage, extractPrescriptionDocumentKey} from "./tracker-response-parser"

interface TrackerResponse {
    statusCode: number
    prescription?: hl7V3.ParentPrescription
    error?: TrackerError
}

interface TrackerError {
    errorCode: string
    errorMessage: string
}

export interface TrackerClient {
  track(
    request_id: string,
    prescription_id: string,
    repeat_number: string,
    logger: pino.Logger
  ): Promise<TrackerResponse>
}

class LiveTrackerClient implements TrackerClient {
    private readonly spineClient: SpineClient

    constructor() {
      this.spineClient = spineClient
    }

    // eslint-disable-next-line max-len
    async track(
      request_id: string,
      prescription_id: string,
      repeat_number: string,
      logger: pino.Logger
    ): Promise<TrackerResponse> {
      const requestBuilder = new PrescriptionRequestBuilder(request_id, prescription_id)
      const moduleLogger = logger.child({module: "TrackerClient", ...requestBuilder})

      try {
        // Prescription Metadata - QURX_IN000005UK99
        const metadataRequest = requestBuilder.makePrescriptionMetadataRequest(repeat_number)
        const metadataResponse = await this.getPrescriptionMetadata(metadataRequest, moduleLogger)

        // Prescription Document - GET_PRESCRIPTION_DOCUMENT_INUK01
        const prescriptionDocumentKey = extractPrescriptionDocumentKey(metadataResponse.body)
        const documentRequest = requestBuilder.makePrescriptionDocumentRequest(prescriptionDocumentKey)
        const documentResponse = await this.getPrescriptionDocument(documentRequest, moduleLogger)

        // TODO: verify the message ID we get back from Spine to see if it's the same one we are sending
        return {
          statusCode: documentResponse.statusCode,
          prescription: extractHl7v3PrescriptionFromMessage(documentResponse.body, moduleLogger)
        }

        // TODO: improve error handling
      } catch (error) {
        return {
          statusCode: error.statusCode ?? 500,
          error: {
            errorCode: "PRESCRIPTION_TRACKER_ERROR",
            errorMessage: error.body ?? error.message
          }
        }
      }
    }

    // eslint-disable-next-line max-len
    private async getPrescriptionMetadata(request: spine.PrescriptionMetadataRequest, logger: pino.Logger): Promise<spine.SpineDirectResponse<string>> {
      logger.info(`Tracker - Sending prescription metadata request: ${JSON.stringify(request)}`)

      const trackerRequest: spine.TrackerRequest = {
        name: "prescription metadata",
        body: makeTrackerSoapMessageRequest(request),
        headers: {
          "SOAPAction": "urn:nhs:names:services:mmquery/QURX_IN000005UK99"
        }
      }

      return await this.spineClient.send(trackerRequest, logger) as spine.SpineDirectResponse<string>
    }

    // eslint-disable-next-line max-len
    private async getPrescriptionDocument(request: spine.PrescriptionDocumentRequest, logger: pino.Logger): Promise<spine.SpineDirectResponse<string>> {
      logger.info(`Tracker - Sending prescription document request: ${JSON.stringify(request)}`)

      const trackerRequest: spine.TrackerRequest = {
        name: "prescription document",
        body: makeTrackerSoapMessageRequest(request),
        headers: {
          "SOAPAction": `urn:nhs:names:services:mmquery/GET_PRESCRIPTION_DOCUMENT_INUK01`
        }
      }

      return await this.spineClient.send(trackerRequest, logger) as spine.SpineDirectResponse<string>
    }
}

class SandboxTrackerClient implements TrackerClient {
  track(): Promise<TrackerResponse> {
    return Promise.resolve({
      statusCode: 200,
      // eslint-disable-next-line max-len
      prescription: JSON.parse("{\"resourceType\":\"Bundle\",\"id\":\"917f870d-4867-4d63-ac54-047890b76061\",\"meta\":{\"lastUpdated\":\"2022-02-19T17:37:21+00:00\"},\"identifier\":{\"system\":\"https://tools.ietf.org/html/rfc4122\",\"value\":\"917f870d-4867-4d63-ac54-047890b76061\"},\"type\":\"searchset\",\"total\":1,\"entry\":[{\"fullUrl\":\"urn:uuid:0d4f804c-9c31-4706-b2cf-4f796e7b199b\",\"resource\":{\"resourceType\":\"Bundle\",\"id\":\"0d4f804c-9c31-4706-b2cf-4f796e7b199b\",\"meta\":{\"lastUpdated\":\"2022-02-19T00:00:00+00:00\"},\"identifier\":{\"system\":\"https://tools.ietf.org/html/rfc4122\",\"value\":\"c289bd6e-a10a-4c5a-b14c-8cbb3f4b5d44\"},\"type\":\"message\",\"entry\":[{\"resource\":{\"resourceType\":\"MessageHeader\",\"id\":\"ba7b87be-6e18-414d-9fed-e997d737fbe8\",\"extension\":[{\"url\":\"https://fhir.nhs.uk/StructureDefinition/Extension-Spine-MessageHeader-messageId\",\"valueIdentifier\":{\"system\":\"https://tools.ietf.org/html/rfc4122\",\"value\":\"c289bd6e-a10a-4c5a-b14c-8cbb3f4b5d44\"}}],\"eventCoding\":{\"system\":\"https://fhir.nhs.uk/CodeSystem/message-event\",\"code\":\"prescription-order\",\"display\":\"Prescription Order\"},\"destination\":[{\"endpoint\":\"urn:nhs-uk:addressing:ods:FCG71\",\"receiver\":{\"identifier\":{\"system\":\"https://fhir.nhs.uk/Id/ods-organization-code\",\"value\":\"FCG71\"}}}],\"sender\":{\"identifier\":{\"system\":\"https://fhir.nhs.uk/Id/ods-organization-code\",\"value\":\"X2601\"},\"display\":\"NHS Digital Spine\"},\"source\":{\"name\":\"NHS Spine\",\"endpoint\":\"https://internal-dev.api.service.nhs.uk/electronic-prescriptions-pr-769/$process-message\"},\"response\":{\"identifier\":\"4e8d0225-f7a7-4af6-8b5c-bbf3ccfc96a5\",\"code\":\"ok\"},\"focus\":[{\"reference\":\"urn:uuid:aea78fb1-0f6f-49d1-ab39-3afd6cfe155c\"},{\"reference\":\"urn:uuid:b76a6db1-aded-4355-b4ce-84ebd5055e64\"},{\"reference\":\"urn:uuid:f6f297e8-8c40-4f06-8f11-7c8a54539660\"}]},\"fullUrl\":\"urn:uuid:ba7b87be-6e18-414d-9fed-e997d737fbe8\"},{\"resource\":{\"resourceType\":\"Patient\",\"id\":\"aea78fb1-0f6f-49d1-ab39-3afd6cfe155c\",\"identifier\":[{\"system\":\"https://fhir.nhs.uk/Id/nhs-number\",\"value\":\"9990548609\"}],\"name\":[{\"use\":\"usual\",\"family\":\"XXTESTPATIENT-TGNP\",\"given\":[\"DONOTUSE\"],\"prefix\":[\"MR\"]}],\"gender\":\"male\",\"birthDate\":\"1932-01-06\",\"address\":[{\"use\":\"home\",\"line\":[\"1 Trevelyan Square\",\"Boar Lane\",\"Leeds\",\"West Yorkshire\"],\"postalCode\":\"LS1 6AE\"}],\"generalPractitioner\":[{\"identifier\":{\"system\":\"https://fhir.nhs.uk/Id/ods-organization-code\",\"value\":\"A83008\"}}]},\"fullUrl\":\"urn:uuid:aea78fb1-0f6f-49d1-ab39-3afd6cfe155c\"},{\"resource\":{\"resourceType\":\"PractitionerRole\",\"id\":\"80efd30a-60f5-4cd8-a4a5-941b16cd0fa1\",\"identifier\":[{\"system\":\"https://fhir.nhs.uk/Id/sds-role-profile-id\",\"value\":\"200102238987\"}],\"practitioner\":{\"reference\":\"urn:uuid:0d6fcc6c-9853-4404-b4c5-dfd160a8e796\"},\"code\":[{\"coding\":[{\"system\":\"https://fhir.hl7.org.uk/CodeSystem/UKCore-SDSJobRoleName\",\"code\":\"R8000\",\"display\":\"R8000\"}]}],\"telecom\":[{\"system\":\"phone\",\"use\":\"work\",\"value\":\"01234567890\"}],\"organization\":{\"reference\":\"urn:uuid:7f27edf3-25a3-4584-b902-7c09ce3f453a\"}},\"fullUrl\":\"urn:uuid:80efd30a-60f5-4cd8-a4a5-941b16cd0fa1\"},{\"resource\":{\"resourceType\":\"Practitioner\",\"id\":\"0d6fcc6c-9853-4404-b4c5-dfd160a8e796\",\"identifier\":[{\"system\":\"https://fhir.hl7.org.uk/Id/gphc-number\",\"value\":\"6095103\"},{\"system\":\"https://fhir.hl7.org.uk/Id/din-number\",\"value\":\"977677\"}],\"name\":[{\"family\":\"BOIN\",\"given\":[\"C\"],\"prefix\":[\"DR\"]}]},\"fullUrl\":\"urn:uuid:0d6fcc6c-9853-4404-b4c5-dfd160a8e796\"},{\"resource\":{\"resourceType\":\"Organization\",\"id\":\"7f27edf3-25a3-4584-b902-7c09ce3f453a\",\"identifier\":[{\"system\":\"https://fhir.nhs.uk/Id/ods-organization-code\",\"value\":\"A83008\"}],\"type\":[{\"coding\":[{\"system\":\"https://fhir.nhs.uk/CodeSystem/organisation-role\",\"code\":\"179\",\"display\":\"PRIMARY CARE TRUST\"}]}],\"name\":\"HALLGARTH SURGERY\",\"telecom\":[{\"system\":\"phone\",\"use\":\"work\",\"value\":\"01159737320\"}],\"address\":[{\"use\":\"work\",\"line\":[\"HALLGARTH SURGERY\",\"CHEAPSIDE\",\"SHILDON\",\"COUNTY DURHAM\"],\"postalCode\":\"DL4 2HP\"}],\"partOf\":{\"identifier\":{\"system\":\"https://fhir.nhs.uk/Id/ods-organization-code\",\"value\":\"84H\"},\"display\":\"NHS COUNTY DURHAM CCG\"}},\"fullUrl\":\"urn:uuid:7f27edf3-25a3-4584-b902-7c09ce3f453a\"},{\"resource\":{\"resourceType\":\"CommunicationRequest\",\"id\":\"ba65f769-f537-48ab-9c12-c01d4c0b767b\",\"status\":\"unknown\",\"subject\":{\"reference\":\"urn:uuid:aea78fb1-0f6f-49d1-ab39-3afd6cfe155c\"},\"payload\":[{\"contentString\":\"Due to Coronavirus restrictions Church View Surgery is CLOSED until further notice\"},{\"contentReference\":{\"reference\":\"urn:uuid:f379c607-5769-4f7e-95b5-be59dc3852d0\"}}],\"requester\":{\"identifier\":{\"system\":\"https://fhir.nhs.uk/Id/ods-organization-code\",\"value\":\"A83008\"}},\"recipient\":[{\"identifier\":{\"system\":\"https://fhir.nhs.uk/Id/nhs-number\",\"value\":\"9990548609\"}}]},\"fullUrl\":\"urn:uuid:ba65f769-f537-48ab-9c12-c01d4c0b767b\"},{\"resource\":{\"resourceType\":\"List\",\"id\":\"f379c607-5769-4f7e-95b5-be59dc3852d0\",\"status\":\"current\",\"mode\":\"snapshot\",\"entry\":[{\"item\":{\"display\":\"Bendroflumethiazide 2.5mg tablets (3/6)\"}},{\"item\":{\"display\":\"Salbutamol 100micrograms/dose inhaler CFC free (2/6)\"}}]},\"fullUrl\":\"urn:uuid:f379c607-5769-4f7e-95b5-be59dc3852d0\"},{\"resource\":{\"resourceType\":\"MedicationRequest\",\"id\":\"b76a6db1-aded-4355-b4ce-84ebd5055e64\",\"extension\":[{\"url\":\"https://fhir.nhs.uk/StructureDefinition/Extension-DM-ResponsiblePractitioner\",\"valueReference\":{\"reference\":\"urn:uuid:80efd30a-60f5-4cd8-a4a5-941b16cd0fa1\"}},{\"url\":\"https://fhir.nhs.uk/StructureDefinition/Extension-DM-PrescriptionType\",\"valueCoding\":{\"system\":\"https://fhir.nhs.uk/CodeSystem/prescription-type\",\"code\":\"0101\"}},{\"url\":\"https://fhir.hl7.org.uk/StructureDefinition/Extension-UKCore-MedicationRepeatInformation\",\"extension\":[{\"url\":\"authorisationExpiryDate\",\"valueDateTime\":\"2023-12-07\"},{\"url\":\"numberOfPrescriptionsIssued\",\"valueUnsignedInt\":1}]}],\"identifier\":[{\"system\":\"https://fhir.nhs.uk/Id/prescription-order-item-number\",\"value\":\"cedf33f2-49fc-4d11-a5e7-e663d9037817\"}],\"status\":\"active\",\"intent\":\"reflex-order\",\"medicationCodeableConcept\":{\"coding\":[{\"system\":\"http://snomed.info/sct\",\"code\":\"322237000\",\"display\":\"Paracetamol 500mg soluble tablets\"}]},\"subject\":{\"reference\":\"urn:uuid:aea78fb1-0f6f-49d1-ab39-3afd6cfe155c\"},\"authoredOn\":\"2022-02-19T17:36:35+00:00\",\"category\":[{\"coding\":[{\"system\":\"http://terminology.hl7.org/CodeSystem/medicationrequest-category\",\"code\":\"outpatient\",\"display\":\"Outpatient\"}]}],\"requester\":{\"reference\":\"urn:uuid:80efd30a-60f5-4cd8-a4a5-941b16cd0fa1\"},\"groupIdentifier\":{\"system\":\"https://fhir.nhs.uk/Id/prescription-order-number\",\"value\":\"998244-A83008-238DCD\",\"extension\":[{\"url\":\"https://fhir.nhs.uk/StructureDefinition/Extension-DM-PrescriptionId\",\"valueIdentifier\":{\"system\":\"https://fhir.nhs.uk/Id/prescription\",\"value\":\"4f2b64a2-0f32-401f-81f4-5e585bfa2e61\"}}]},\"courseOfTherapyType\":{\"coding\":[{\"system\":\"https://fhir.nhs.uk/CodeSystem/medicationrequest-course-of-therapy\",\"code\":\"continuous-repeat-dispensing\",\"display\":\"Continuous long term (repeat dispensing)\"}]},\"dosageInstruction\":[{\"text\":\"One tablet to be taken four times a day\"}],\"dispenseRequest\":{\"extension\":[{\"url\":\"https://fhir.nhs.uk/StructureDefinition/Extension-DM-PerformerSiteType\",\"valueCoding\":{\"system\":\"https://fhir.nhs.uk/CodeSystem/dispensing-site-preference\",\"code\":\"P1\"}}],\"numberOfRepeatsAllowed\":0,\"quantity\":{\"value\":100,\"unit\":\"tablet\",\"system\":\"http://snomed.info/sct\",\"code\":\"428673006\"},\"validityPeriod\":{\"start\":\"2022-02-19\",\"end\":\"2022-03-19\"},\"expectedSupplyDuration\":{\"unit\":\"days\",\"value\":30,\"system\":\"http://unitsofmeasure.org\",\"code\":\"d\"},\"performer\":{\"identifier\":{\"system\":\"https://fhir.nhs.uk/Id/ods-organization-code\",\"value\":\"FCG71\"}}},\"substitution\":{\"allowedBoolean\":false},\"basedOn\":[{\"reference\":\"urn:uuid:cedf33f2-49fc-4d11-a5e7-e663d9037817\",\"extension\":[{\"url\":\"https://fhir.nhs.uk/StructureDefinition/Extension-EPS-RepeatInformation\",\"extension\":[{\"url\":\"numberOfRepeatsAllowed\",\"valueInteger\":5}]}]}]},\"fullUrl\":\"urn:uuid:b76a6db1-aded-4355-b4ce-84ebd5055e64\"},{\"resource\":{\"resourceType\":\"MedicationRequest\",\"id\":\"f6f297e8-8c40-4f06-8f11-7c8a54539660\",\"extension\":[{\"url\":\"https://fhir.nhs.uk/StructureDefinition/Extension-DM-ResponsiblePractitioner\",\"valueReference\":{\"reference\":\"urn:uuid:80efd30a-60f5-4cd8-a4a5-941b16cd0fa1\"}},{\"url\":\"https://fhir.nhs.uk/StructureDefinition/Extension-DM-PrescriptionType\",\"valueCoding\":{\"system\":\"https://fhir.nhs.uk/CodeSystem/prescription-type\",\"code\":\"0101\"}},{\"url\":\"https://fhir.hl7.org.uk/StructureDefinition/Extension-UKCore-MedicationRepeatInformation\",\"extension\":[{\"url\":\"authorisationExpiryDate\",\"valueDateTime\":\"2020-12-07\"},{\"url\":\"numberOfPrescriptionsIssued\",\"valueUnsignedInt\":1}]}],\"identifier\":[{\"system\":\"https://fhir.nhs.uk/Id/prescription-order-item-number\",\"value\":\"1341f8f3-3b52-4820-91ed-47cac20db83f\"}],\"status\":\"active\",\"intent\":\"reflex-order\",\"medicationCodeableConcept\":{\"coding\":[{\"system\":\"http://snomed.info/sct\",\"code\":\"39113611000001102\",\"display\":\"Salbutamol 100micrograms/dose inhaler CFC free\"}]},\"subject\":{\"reference\":\"urn:uuid:aea78fb1-0f6f-49d1-ab39-3afd6cfe155c\"},\"authoredOn\":\"2022-02-19T17:36:35+00:00\",\"category\":[{\"coding\":[{\"system\":\"http://terminology.hl7.org/CodeSystem/medicationrequest-category\",\"code\":\"outpatient\",\"display\":\"Outpatient\"}]}],\"requester\":{\"reference\":\"urn:uuid:80efd30a-60f5-4cd8-a4a5-941b16cd0fa1\"},\"groupIdentifier\":{\"system\":\"https://fhir.nhs.uk/Id/prescription-order-number\",\"value\":\"998244-A83008-238DCD\",\"extension\":[{\"url\":\"https://fhir.nhs.uk/StructureDefinition/Extension-DM-PrescriptionId\",\"valueIdentifier\":{\"system\":\"https://fhir.nhs.uk/Id/prescription\",\"value\":\"4f2b64a2-0f32-401f-81f4-5e585bfa2e61\"}}]},\"courseOfTherapyType\":{\"coding\":[{\"system\":\"https://fhir.nhs.uk/CodeSystem/medicationrequest-course-of-therapy\",\"code\":\"continuous-repeat-dispensing\",\"display\":\"Continuous long term (repeat dispensing)\"}]},\"dosageInstruction\":[{\"text\":\"One dose to be taken five times a day\"}],\"dispenseRequest\":{\"extension\":[{\"url\":\"https://fhir.nhs.uk/StructureDefinition/Extension-DM-PerformerSiteType\",\"valueCoding\":{\"system\":\"https://fhir.nhs.uk/CodeSystem/dispensing-site-preference\",\"code\":\"P1\"}}],\"numberOfRepeatsAllowed\":0,\"quantity\":{\"value\":200,\"unit\":\"dose\",\"system\":\"http://snomed.info/sct\",\"code\":\"3317411000001100\"},\"validityPeriod\":{\"start\":\"2022-02-19\",\"end\":\"2022-03-19\"},\"expectedSupplyDuration\":{\"unit\":\"days\",\"value\":30,\"system\":\"http://unitsofmeasure.org\",\"code\":\"d\"},\"performer\":{\"identifier\":{\"system\":\"https://fhir.nhs.uk/Id/ods-organization-code\",\"value\":\"FCG71\"}}},\"substitution\":{\"allowedBoolean\":false},\"basedOn\":[{\"reference\":\"urn:uuid:1341f8f3-3b52-4820-91ed-47cac20db83f\",\"extension\":[{\"url\":\"https://fhir.nhs.uk/StructureDefinition/Extension-EPS-RepeatInformation\",\"extension\":[{\"url\":\"numberOfRepeatsAllowed\",\"valueInteger\":5}]}]}]},\"fullUrl\":\"urn:uuid:f6f297e8-8c40-4f06-8f11-7c8a54539660\"},{\"resource\":{\"resourceType\":\"Provenance\",\"id\":\"30843d63-a6b6-4618-b503-5c43b9272ce8\",\"agent\":[{\"who\":{\"reference\":\"urn:uuid:80efd30a-60f5-4cd8-a4a5-941b16cd0fa1\"}}],\"recorded\":\"2022-02-19T17:36:35+00:00\",\"signature\":[{\"who\":{\"reference\":\"urn:uuid:80efd30a-60f5-4cd8-a4a5-941b16cd0fa1\"},\"when\":\"2022-02-19T17:36:35+00:00\",\"data\":\"PFNpZ25hdHVyZSB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnIyI+PFNpZ25lZEluZm8+PENhbm9uaWNhbGl6YXRpb25NZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzEwL3htbC1leGMtYzE0biMiPjwvQ2Fub25pY2FsaXphdGlvbk1ldGhvZD48U2lnbmF0dXJlTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI3JzYS1zaGExIj48L1NpZ25hdHVyZU1ldGhvZD48UmVmZXJlbmNlPjxUcmFuc2Zvcm1zPjxUcmFuc2Zvcm0gQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzEwL3htbC1leGMtYzE0biMiPjwvVHJhbnNmb3JtPjwvVHJhbnNmb3Jtcz48RGlnZXN0TWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI3NoYTEiPjwvRGlnZXN0TWV0aG9kPjxEaWdlc3RWYWx1ZT5EbXluOUxEVVl2RVlQbFhBa2FXNTUrdEgzVGc9PC9EaWdlc3RWYWx1ZT48L1JlZmVyZW5jZT48L1NpZ25lZEluZm8+PFNpZ25hdHVyZVZhbHVlPmZ2MnNIblJoNjJvS2U0VXNhMG1vMm1JNVkxQmNvbmVqR3RCRjlWUW9MUXZMalVhNjlkaDZoaDE4ZlVsbkIrM1dIdHRDdlJleFEzSkN1ME43ZzV5ZDBZaEpvZGdHYXo1Ymx4ejVzUUlVZ3g5YThieDY1V2ZxNi82UzF1QmxQRFVWVUlqZ0hnak8xY0E0eUZQWDgzUENndnBqeU01blFPMHlLNDJmbnNKc2w1Zz08L1NpZ25hdHVyZVZhbHVlPjxLZXlJbmZvPjxYNTA5RGF0YT48WDUwOUNlcnRpZmljYXRlPk1JSUR1RENDQXFDZ0F3SUJBZ0lFWGNtdEh6QU5CZ2txaGtpRzl3MEJBUXNGQURBMk1Rd3dDZ1lEVlFRS0V3TnVhSE14Q3pBSkJnTlZCQXNUQWtOQk1Sa3dGd1lEVlFRREV4Qk9TRk1nU1U1VUlFeGxkbVZzSURGRU1CNFhEVEl3TVRBeU1qRXdNakUxTlZvWERUSXlNVEF5TWpFd05URTFOVm93UXpFTU1Bb0dBMVVFQ2hNRGJtaHpNUTh3RFFZRFZRUUxFd1pRWlc5d2JHVXhJakFnQmdOVkJBTU1HVFUxTlRJMU16VXlNVEV3T0Y5U1FVNUVUMDFmVlZORlVsRXdnWjh3RFFZSktvWklodmNOQVFFQkJRQURnWTBBTUlHSkFvR0JBS3Q0c3pOdzdPQUg3QVFSckRlL3hCSW1zTW1NaVM5RXNyVDNhM3AvTGgzYnJkekk5YWFqVFVaMmIvY3ZiT2E3UGVZZDd1K0s0YTJaZDBYayswR0ZtWUd6U1ZYNmlZamJsd3IwdmFpMzF6VjdHK2xHdkh4SDZwU29MQ3dJQ2FaQUZ3YWJlRDVPejk0K3lBM2FXTld0R1YwRGZoOXF3SDNaRkNJTVJzdmVyTjFwQWdNQkFBR2pnZ0ZETUlJQlB6QU9CZ05WSFE4QkFmOEVCQU1DQmtBd1pRWURWUjBnQVFIL0JGc3dXVEJYQmdzcWhqb0FpWHRtQUFNQ0FEQklNRVlHQ0NzR0FRVUZCd0lCRmpwb2RIUndjem92TDNCcmFTNXVhSE11ZFdzdlkyVnlkR2xtYVdOaGRHVmZjRzlzYVdOcFpYTXZZMjl1ZEdWdWRGOWpiMjF0YVhSdFpXNTBNRE1HQTFVZEh3UXNNQ293S0tBbW9DU0dJbWgwZEhBNkx5OWpjbXd1Ym1oekxuVnJMMmx1ZEM4eFpDOWpjbXhqTXk1amNtd3dLd1lEVlIwUUJDUXdJb0FQTWpBeU1ERXdNakl4TURJeE5UVmFnUTh5TURJeU1ETXhOekV3TlRFMU5Wb3dId1lEVlIwakJCZ3dGb0FVb0pZZmdZVE5QZDZFVUtMNlFMSXpIeFk1UEZJd0hRWURWUjBPQkJZRUZMdHl2WVN5YXFnNjBBRVVaZ3hrMHdyalJKYytNQWtHQTFVZEV3UUNNQUF3R1FZSktvWklodlo5QjBFQUJBd3dDaHNFVmpndU13TUNCTEF3RFFZSktvWklodmNOQVFFTEJRQURnZ0VCQUJjenk4QjhqdVBwSWZhVE5GY3hyQzIyYUNYL3hZWm1ockwvTnZJQkFhWDFHNWhqaXdta0dLRTJoUlRJcjY3UHhaeG1Yc0p4aWdSQk1IUGxJK2xZLytva3pIMEdpN2I1YnFsdzdweEdJZ0pPMDAwdzhwRnN2bzl3NDJJWWhIb2Rzdm5EVlN4aE1UMEo0NlFoazlzb0UwTGpvRVVMS1FQUGxZR2tlL0dsM20xN0l0Rll3T2JRSDBmTUV3bWlxQnllSWZ6N2dTY2NPekw1Y0lwNlBjWlRPam8ySXFRcGdFbWhqT2NSSW5FcUFOaXRTZGpvaUpBSnpwYWFaallUUmRIVVg3aTdhakVpSDRtOTFuRlcrNEFxa050dGxiNFdjR0tzU21XZ2ZLS2hlRjRJb1pLTUU4MHhlclNnTXk4dnRqTE9CSkNHWHowd0xHbVF1Um14TVRxODhxND08L1g1MDlDZXJ0aWZpY2F0ZT48L1g1MDlEYXRhPjwvS2V5SW5mbz48L1NpZ25hdHVyZT4=\",\"type\":[{\"code\":\"1.2.840.10065.1.12.1.1\",\"system\":\"urn:iso-astm:E1762-95:2013\"}]}],\"target\":[{\"reference\":\"urn:uuid:ba7b87be-6e18-414d-9fed-e997d737fbe8\"},{\"reference\":\"urn:uuid:aea78fb1-0f6f-49d1-ab39-3afd6cfe155c\"},{\"reference\":\"urn:uuid:80efd30a-60f5-4cd8-a4a5-941b16cd0fa1\"},{\"reference\":\"urn:uuid:0d6fcc6c-9853-4404-b4c5-dfd160a8e796\"},{\"reference\":\"urn:uuid:7f27edf3-25a3-4584-b902-7c09ce3f453a\"},{\"reference\":\"urn:uuid:ba65f769-f537-48ab-9c12-c01d4c0b767b\"},{\"reference\":\"urn:uuid:f379c607-5769-4f7e-95b5-be59dc3852d0\"},{\"reference\":\"urn:uuid:b76a6db1-aded-4355-b4ce-84ebd5055e64\"},{\"reference\":\"urn:uuid:f6f297e8-8c40-4f06-8f11-7c8a54539660\"}]},\"fullUrl\":\"urn:uuid:30843d63-a6b6-4618-b503-5c43b9272ce8\"}]}}]}")
    })
  }
}

function getTrackerClient(liveMode: boolean): TrackerClient {
  return liveMode
    ? new LiveTrackerClient()
    : new SandboxTrackerClient()
}

export const trackerClient = getTrackerClient(process.env.SANDBOX !== "1")
