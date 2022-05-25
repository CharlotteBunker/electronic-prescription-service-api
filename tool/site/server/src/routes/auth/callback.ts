import Hapi from "@hapi/hapi"
import {CONFIG} from "../../config"
import {URLSearchParams} from "url"
import {createCombinedAuthSession, createSeparateAuthSession} from "../../services/session"
import {
  getPrBranchUrl,
  parseOAuthState,
  prRedirectEnabled,
  prRedirectRequired
} from "../helpers"
import {getUtcEpochSeconds} from "../util"
import {exchangeCIS2IdTokenForApigeeAccessToken, getApigeeAccessToken, getCIS2IdToken} from "../../oauthUtils"

export default {
  method: "GET",
  path: "/callback",
  options: {
    auth: false
  },
  handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit): Promise<Hapi.ResponseObject> => {

    // Local
    if (CONFIG.environment.endsWith("sandbox")) {
      request.cookieAuth.set({})
      h.state("Access-Token-Fetched", getUtcEpochSeconds().toString(), {isHttpOnly: false})
      h.state("Access-Token-Set", "true", {isHttpOnly: false, ttl: CONFIG.refreshTokenTimeout})
      return h.redirect("/")
    }

    // Deployed Versions
    const state = parseOAuthState(request.query.state as string, request.logger)

    if (prRedirectRequired(state.prNumber)) {
      if (prRedirectEnabled()) {
        const queryString = new URLSearchParams(request.query).toString()
        return h.redirect(getPrBranchUrl(state.prNumber, "callback", queryString))
      } else {
        return h.response({}).code(400)
      }
    }

    if (isSeparateAuthLogin(request)) {
      try {
        const cis2IdToken = await getCIS2IdToken(request)

        const apigeeAccessToken = await exchangeCIS2IdTokenForApigeeAccessToken(cis2IdToken)

        createSeparateAuthSession(apigeeAccessToken, request, h)

        return h.redirect(CONFIG.baseUrl)
      } catch (e) {
        console.log(`Callback failed: ${e}`)
        return h.response({error: e})
      }
    }

    try {
      const tokenResponse = await getApigeeAccessToken(request)

      createCombinedAuthSession(tokenResponse, request, h)

      return h.redirect(CONFIG.baseUrl)
    } catch (e) {
      return h.response({error: e})
    }
  }
}

function isSeparateAuthLogin(request: Hapi.Request) {
  const queryString = new URLSearchParams(request.query)
  return queryString.has("client_id")
}
