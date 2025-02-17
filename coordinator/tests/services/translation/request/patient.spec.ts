import {convertPatient} from "../../../../src/services/translation/request/patient"
import {clone} from "../../../resources/test-helpers"
import * as TestResources from "../../../resources/test-resources"
import {getPatient} from "../../../../src/services/translation/common/getResourcesOfType"
import {fhir, processingErrors as errors} from "@models"
import {UNKNOWN_GP_ODS_CODE} from "../../../../src/services/translation/common"

describe("convertPatient", () => {
  let bundle: fhir.Bundle
  let fhirPatient: fhir.Patient

  beforeEach(() => {
    bundle = clone(TestResources.examplePrescription1.fhirMessageUnsigned)
    fhirPatient = getPatient(bundle)
  })

  test("Throws TooManyValuesUserFacingError when passed multiple copies of identifier", () => {
    fhirPatient.identifier.push(fhirPatient.identifier[0])
    expect(() => convertPatient(bundle, fhirPatient)).toThrow(errors.TooManyValuesError)
  })

  test("ID gets put in correct field", () => {
    const idValue = "exampleId"
    fhirPatient.identifier[0].value = idValue

    const actual = convertPatient(bundle, fhirPatient).id._attributes.extension

    expect(actual).toBe(idValue)
  })

  test("If there is a patient.telecom, it gets put in the right place", () => {
    fhirPatient.telecom = [{use: "home", value: "0123456789"}]

    const actual = convertPatient(bundle, fhirPatient).telecom[0]._attributes

    expect(actual).toEqual({use: "HP", value: "tel:0123456789"})
  })

  test("If there isn't a patient.telecom, leave it off", () => {
    delete fhirPatient.telecom

    const actual = convertPatient(bundle, fhirPatient).telecom

    expect(actual).toEqual(undefined)
  })

  test("If the GP has ID 'V81999' make the Id have nullFlavor 'UNK'", () => {
    fhirPatient.generalPractitioner = createGpWithIdValue(UNKNOWN_GP_ODS_CODE)

    const patientsubjectOf = convertPatient(bundle, fhirPatient).patientPerson.playedProviderPatient.subjectOf
    const actual = patientsubjectOf.patientCareProvision.responsibleParty.healthCareProvider.id._attributes

    expect(actual).toEqual({nullFlavor: "UNK"})
  })

  test("If the GP ID is not 'V81999' make the Id the value", () => {
    const idValue = "testValue"
    fhirPatient.generalPractitioner = createGpWithIdValue(idValue)

    const patientsubjectOf = convertPatient(bundle, fhirPatient).patientPerson.playedProviderPatient.subjectOf
    const actual = patientsubjectOf.patientCareProvision.responsibleParty.healthCareProvider.id._attributes

    expect(actual).toEqual({extension: idValue, root: "1.2.826.0.1285.0.1.10"})
  })

  function createGpWithIdValue(idValue: string) {
    return [{
      identifier:{
        "system": "https://fhir.nhs.uk/Id/ods-organization-code",
        "value": idValue
      }
    }]
  }
})
