# `remedies` on a Tool (bean 6mk7): what to reach for when a host refuses
# it. A network Tool states its remedies, a remedy names a declared Tool or
# states there is none, and remediesFor finds the answer from the symptom in
# hand. Each Scenario names the test that executes it.
Feature: A network Tool states what to reach for when a host refuses it

  @test:scripts/tests/tools/tool-remedies.test.ts::ToolRemedySchema::names_exactly_one_of_tool_or_none
  Scenario: A remedy names exactly one of a Tool or none
    Then a remedy for packages.fhir.org naming Tool "seeder" is valid
    And a remedy for github.com stating none is valid
    And a remedy naming neither is invalid
    And a remedy naming both is invalid

  @test:scripts/tests/tools/tool-remedies.test.ts::ToolRemedySchema::a_host_is_a_bare_host_name,_not_a_URL
  Scenario: A remedy's host is a bare dotted host name
    Then hosts "https://packages.fhir.org", "packages.fhir.org/x" and "localhost" are each invalid

  @test:scripts/tests/tools/tool-remedies.test.ts::the_gate:_a_network_Tool_states_its_remedies::network:_true_with_no_remedies_is_reported;_with_remedies,_or_offline,_it_is_not
  Scenario: Network Tools without remedies are reported
    Given Tools "bare" and "empty" needing network with no or empty remedies, "stated" needing network with a remedy, "offline", and "unspecified"
    When network Tools without remedies are listed
    Then they are exactly "bare" and "empty"

  @test:scripts/tests/tools/tool-remedies.test.ts::the_gate:_a_network_Tool_states_its_remedies::a_remedy_naming_no_declared_Tool_is_dangling
  Scenario: A remedy naming an undeclared Tool is dangling
    Given a Tool "sushi-ish" whose packages.fhir.org remedy is Tool "seeder"
    Then without a "seeder" Tool that remedy is reported dangling
    And with a "seeder" Tool nothing is dangling

  @test:scripts/tests/tools/tool-remedies.test.ts::remediesFor_—_from_the_symptom_in_hand::a_bare_host_finds_its_Tool_and_the_Tool's_command
  Scenario: A bare host finds its remedy Tool and command
    Given "ig" needs network with remedy Tool "seeder" for packages.fhir.org
    When remedies are found for "packages.fhir.org"
    Then the one match is needed by "ig", Tool "seeder", invoked as "run-seeder"

  @test:scripts/tests/tools/tool-remedies.test.ts::remediesFor_—_from_the_symptom_in_hand::a_URL_or_a_pasted_error_line_containing_the_host_matches,_case-insensitively
  Scenario: An error line containing the host in upper case matches
    When remedies are found for an error line containing "HTTPS://PACKAGES.FHIR.ORG/..."
    Then the matched Tool is "seeder"

  @test:scripts/tests/tools/tool-remedies.test.ts::remediesFor_—_from_the_symptom_in_hand::the_error_text_matches_when_the_host_is_not_in_the_message
  Scenario: A remedy's declared error text matches without the host
    Given "lean" has a remedy for the error "Host not in allowlist"
    When remedies are found for "403 Host not in allowlist"
    Then the match is needed by "lean"

  @test:scripts/tests/tools/tool-remedies.test.ts::remediesFor_—_from_the_symptom_in_hand::a_stated_none_is_an_answer,_not_an_absence
  Scenario: A stated "none" remedy is returned as the answer
    When remedies are found for "tx.fhir.org"
    Then the one match is needed by "ig" with none "no terminology server here"

  @test:scripts/tests/tools/tool-remedies.test.ts::remediesFor_—_from_the_symptom_in_hand::an_unrelated_host_matches_nothing
  Scenario: An unrelated host matches no remedy
    When remedies are found for "example.org"
    Then there are none
