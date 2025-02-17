import {waitFor} from "@testing-library/react"
import {screen} from "@testing-library/dom"
import pretty from "pretty"
import * as React from "react"
import {AppContextValue} from "../../src"
import {renderWithContext} from "../renderWithContext"
import {Environment, int, internalDev} from "../../src/services/environment"
import LoginPage from "../../src/pages/loginPage"
import userEvent from "@testing-library/user-event"
import {redirect} from "../../src/browser/navigation"
import {axiosInstance} from "../../src/requests/axiosInstance"
import moxios from "moxios"

const baseUrl = "baseUrl/"

const loginUrl = `${baseUrl}login`

const attendedAuthRedirectUrl = `https://attended-auth.com`
const unattendedAuthRedirectUrl = `https://unattended-auth.com`

jest.mock("../../src/browser/navigation")

beforeEach(() => moxios.install(axiosInstance))

afterEach(() => moxios.uninstall(axiosInstance))

test("Displays user/system options in internal-dev", async () => {
  const container = await renderPage(internalDev)
  await waitFor(() => screen.getByText("Login"))
  expect(screen.getByText("Select access level:")).toBeTruthy()
  expect(screen.getByText("User - Combined Auth")).toBeTruthy()
  expect(screen.getByText("System")).toBeTruthy()
  expect(pretty(container.innerHTML)).toMatchSnapshot()
})

test("Redirects to attended simulated auth when selecting user access level in internal-dev", async () => {
  moxios.stubRequest(loginUrl, {
    status: 200,
    response: {
      redirectUri: attendedAuthRedirectUrl
    }
  })

  const container = await renderPage(internalDev)
  await waitFor(() => screen.getByText("Login"))
  userEvent.click(screen.getByText("User - Combined Auth"))
  await waitFor(() => screen.getByText("Redirecting to simulated auth..."))
  expect(pretty(container.innerHTML)).toMatchSnapshot()
  expect(redirect).toHaveBeenCalledWith(attendedAuthRedirectUrl)
})

test("Redirects to unattended auth when selecting system access level in internal-dev", async () => {
  moxios.stubRequest(loginUrl, {
    status: 200,
    response: {
      redirectUri: unattendedAuthRedirectUrl
    }
  })

  const container = await renderPage(internalDev)
  await waitFor(() => screen.getByText("Login"))
  userEvent.click(screen.getByText("System"))
  expect(pretty(container.innerHTML)).toMatchSnapshot()
  await waitFor(() => expect(redirect).toHaveBeenCalledWith(unattendedAuthRedirectUrl))
})

test("Redirects to attended auth in integration", async () => {
  moxios.stubRequest(loginUrl, {
    status: 200,
    response: {
      redirectUri: attendedAuthRedirectUrl
    }
  })

  const container = await renderPage(int)
  await waitFor(() => screen.getByText("Login"))
  await waitFor(() => screen.getByText("Redirecting to auth..."))
  expect(pretty(container.innerHTML)).toMatchSnapshot()
  expect(redirect).toHaveBeenCalledWith(attendedAuthRedirectUrl)
})

async function renderPage(environment: Environment) {
  const context: AppContextValue = {baseUrl, environment}
  const {container} = renderWithContext(<LoginPage/>, context)
  return container
}
