# Specifies portable paths (schemas/kg/portable-path.ts) and the composers
# that turn ids into file names: script sidecars, landing stickies, agent
# memory details and KG-QA sidecars.
Feature: Every path a composer writes is portable to every checkout

  @test:schemas/portable-path.test.ts::unportableSegment::accepts_the_ordinary_names_this_repository_is_full_of
  Scenario: Ordinary names are portable
    Given "agent-workflow.kg-qa.json", "README.md", "check-ci-health.ts" and "_external"
    When each is checked as a path segment
    Then none is unportable

  @test:schemas/portable-path.test.ts::unportableSegment::rejects_every_character_Windows_reserves_in_a_component
  Scenario: Windows-reserved characters are unportable
    Given segments containing < > : " / \ | ? * or a control character
    When each is checked
    Then each is a reserved-character

  @test:schemas/portable-path.test.ts::unportableSegment::rejects_a_device_name_even_with_an_extension
  Scenario: Device names are unportable even with an extension
    Given "con", "CON.txt", "aux.kg-qa.json", "com1", "LPT9.md" and "nul"
    When each is checked
    Then each is a reserved-device-name
    And "console.ts", "auxiliary.md", "com10" and "connection.json" are portable

  @test:schemas/portable-path.test.ts::unportableSegment::rejects_a_trailing_dot_or_space,_which_Windows_would_silently_strip
  Scenario: A trailing dot or space is unportable
    Given "notes." and "notes "
    When each is checked
    Then each is trailing-dot-or-space

  @test:schemas/portable-path.test.ts::unportablePath::reports_the_offending_SEGMENT,_not_the_whole_path
  Scenario: An unportable path names its offending segment
    Given a KG-QA sidecar path whose basename is "req:x.kg-qa.json"
    When the path is checked
    Then it reports that segment as a reserved-character

  @test:schemas/portable-path.test.ts::unportablePath::finds_one_in_the_middle_of_a_path,_not_only_in_the_basename
  Scenario: An unportable middle segment is found
    Given the path "a/b:c/d.json"
    When it is checked
    Then the offending segment is "b:c"

  @test:schemas/portable-path.test.ts::unportablePath::passes_a_clean_path
  Scenario: A clean path is portable
    Given the path "cat-harness/schemas/kg/portable-path.ts"
    When it is checked
    Then it is portable

  @test:schemas/portable-path.test.ts::portableSegment::encodes_the_colon_that_made_this_repository_unclonable
  Scenario: A colon is percent-encoded
    Given the id "req:agent-workflow"
    When it is made portable
    Then it is "req%3Aagent-workflow"

  @test:schemas/portable-path.test.ts::portableSegment::leaves_an_already-portable_name_exactly_as_it_is
  Scenario: A portable name is unchanged
    Given the id "agent-workflow"
    When it is made portable
    Then it is unchanged

  @test:schemas/portable-path.test.ts::portableSegment::is_injective,_so_two_ids_cannot_compose_one_sidecar
  Scenario: Distinct ids stay distinct
    Given "req:agent-workflow", "req-agent-workflow", "req%3Aagent-workflow" and "req%agent-workflow"
    When each is made portable
    Then the four results are distinct

  @test:schemas/portable-path.test.ts::portableSegment::whatever_it_returns_is_portable
  Scenario: Every encoded segment is portable
    Given ids with a colon, quote, pipe, star, trailing dot, trailing space, percent sign or control character
    When each is made portable and checked
    Then each is portable

  @test:schemas/portable-path.test.ts::portableSegment::does_not_pretend_to_rescue_a_device_name
  Scenario: A device name is left as it is and still unportable
    Given the id "aux"
    When it is made portable
    Then it is "aux" and still a reserved-device-name

  @test:schemas/portable-path.test.ts::the_id-to-filename_composers,_as_a_class::every_composer_encodes,_so_no_id_can_compose_an_uncheckable_name
  Scenario: Every id-to-filename composer encodes the id
    Given the id "req:x"
    When the script sidecar path, sticky file, detail file name and detail path are composed
    Then each carries "req%3Ax"
    And the script sidecar path, sticky file and detail file name are portable

  @test:schemas/portable-path.test.ts::the_id-to-filename_composers,_as_a_class::and_every_one_is_identity_on_the_ids_actually_in_use,_so_nothing_moves
  Scenario: The composers leave ordinary ids unchanged
    Given ids "lean-mirror-drift", "getting-started" and "kg-audit-baseline"
    When their file names are composed
    Then each name is the id with its usual suffix

  @test:schemas/portable-path.test.ts::the_id-to-filename_composers,_as_a_class::detailRelPath_and_detailFileName_cannot_drift,_because_one_calls_the_other
  Scenario: The detail path is the detail directory plus the detail file name
    Given ids "plain", "req:x", "a b" and "100%"
    When the detail path and file name are composed
    Then each path is detail/ joined to the file name

  @test:schemas/portable-path.test.ts::kgQaSidecarPath::composes_a_checkout-safe_path_from_an_id_that_is_not_a_legal_filename
  Scenario: A KG-QA sidecar path encodes an illegal id
    Given the subject "req:agent-workflow" in skills/requirements
    When its sidecar path is composed
    Then it is test/results/kg-qa/skills/requirements/req%3Aagent-workflow.kg-qa.json and portable

  @test:schemas/portable-path.test.ts::kgQaSidecarPath::still_mirrors_the_subject's_directory_untouched
  Scenario: A KG-QA sidecar mirrors its subject's directory
    Given the subject "todo-manager" in skills/folio-core
    When its sidecar path is composed
    Then it is test/results/kg-qa/skills/folio-core/todo-manager.kg-qa.json

  @test:schemas/portable-path.test.ts::kgQaSidecarPath::an_outside_subject_is_REFUSED_—_its_owner_audits_it_(Q-A_PR_4)
  Scenario: A subject outside the root is refused
    Given a subject under /bootstrap/processes, outside the root /repo
    When its sidecar path is composed
    Then a foreign-subject error is thrown
