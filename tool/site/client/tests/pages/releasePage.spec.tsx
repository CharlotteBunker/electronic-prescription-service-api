import {waitFor} from "@testing-library/react"
import {screen} from "@testing-library/dom"
import pretty from "pretty"
import * as React from "react"
import moxios from "moxios"
import {AppContextValue} from "../../src"
import {renderWithContext} from "../renderWithContext"
import ReleasePage, {DispenserDetails} from "../../src/pages/releasePage"
import userEvent from "@testing-library/user-event"
import {axiosInstance} from "../../src/requests/axiosInstance"
import {internalDev} from "../../src/services/environment"

const baseUrl = "baseUrl/"
const prescriptionId = "7A9089-A83008-56A03J"
const context: AppContextValue = {baseUrl, environment: internalDev}

const releaseUrl = `${baseUrl}dispense/release`

beforeEach(() => moxios.install(axiosInstance))

afterEach(() => moxios.uninstall(axiosInstance))

test("Displays release form", async () => {
  const container = await renderPage()

  expect(screen.getByText("Release prescription(s)")).toBeTruthy()
  expect(pretty(container.innerHTML)).toMatchSnapshot()
})

test("Displays release result", async () => {
  moxios.stubRequest(releaseUrl, {
    status: 200,
    response: {
      prescriptionIds: [],
      success: true,
      request: {req: "JSON Request"},
      request_xml: "XML Request",
      response: {res: "JSON Response"},
      response_xml: "XML Response"
    }
  })

  const container = await renderPage()
  const pharmacyContainer = await screen.findByLabelText<HTMLElement>("Pharmacy to release prescriptions to")
  const pharmacyRadios = pharmacyContainer.getElementsByClassName("nhsuk-radios__input") as HTMLCollectionOf<HTMLInputElement>
  userEvent.click(pharmacyRadios[0])
  userEvent.click(screen.getByText("Release"))
  await waitFor(() => screen.getByText("Sending release."))
  await waitFor(() => screen.getByText(/Release Result/))
  expect(screen.getByText((/JSON Request/))).toBeTruthy()
  expect(screen.getByText("XML Request")).toBeTruthy()
  expect(screen.getByText((/JSON Response/))).toBeTruthy()
  expect(screen.getByText("XML Response")).toBeTruthy()
  expect(pretty(container.innerHTML)).toMatchSnapshot()
})

test("Displays release error response", async () => {
  const withDispenser: DispenserDetails = {
    odsCode: "testOdsCode",
    name: "testName",
    tel: "00000"
  }
  moxios.stubRequest(releaseUrl, {
    status: 200,
    response: {
      prescriptionIds: [],
      withDispenser,
      success: false,
      request: {req: "JSON Request"},
      request_xml: "XML Request",
      response: {res: "JSON Response"},
      response_xml: "XML Response"
    }
  })

  const container = await renderPage()
  const pharmacyContainer = await screen.findByLabelText<HTMLElement>("Pharmacy to release prescriptions to")
  const pharmacyRadios = pharmacyContainer.getElementsByClassName("nhsuk-radios__input") as HTMLCollectionOf<HTMLInputElement>
  userEvent.click(pharmacyRadios[0])
  userEvent.click(screen.getByText("Release"))
  await waitFor(() => screen.getByText("Sending release."))
  await waitFor(() => screen.getByText(/Release Result/))
  expect(screen.getByText(/testOdsCode/)).toBeTruthy()
  expect(screen.getByText(/00000/)).toBeTruthy()
  expect(pretty(container.innerHTML)).toMatchSnapshot()
})

async function renderPage() {
  const {container} = renderWithContext(<ReleasePage prescriptionId={prescriptionId}/>, context)
  await waitFor(() => screen.getByText("Release prescription(s)"))
  return container
}
