import {fetcher} from "@models"
import {verifyClaim} from "../../../src/services/validation/claim-validator"
import {DISPENSING_USER_SCOPE} from "../../../src/services/validation/scope-validator"

jest.spyOn(global.console, "warn").mockImplementation(() => null)

describe("verifyClaim", () => {
  const validClaim = fetcher.claimExamples[0].request

  test("accepts a valid Claim", () => {
    const result = verifyClaim(validClaim, DISPENSING_USER_SCOPE, "test_sds_user_id", "test_sds_role_id")
    expect(result).toHaveLength(0)
  })

  test("console warn when inconsistent accessToken and body SDS user unique ID", () => {
    verifyClaim(validClaim, DISPENSING_USER_SCOPE, "test_sds_user_id", "555086415105")
    expect(console.warn).toHaveBeenCalled()
  })

  test("console warn when inconsistent accessToken and body SDS role profile ID", () => {
    verifyClaim(validClaim, DISPENSING_USER_SCOPE, "3415870201", "test_sds_role_id")
    expect(console.warn).toHaveBeenCalled()
  })
})
