# Specifies isOwnExtensionNamespace and ownExtensionPrefixes
# (schemas/kg/namespaces.ts) during the move from exact-semver namespace
# addresses to v<major> addresses.
Feature: Our extension namespaces are v<major> addresses, and the legacy semver spelling of the same major is still ours

  @test:schemas/namespaces-legacy.test.ts::own_extension_namespaces_during_the_v<major>_transition::every_own_namespace_is_a_v<major>_address,_so_the_tolerance_covers_each
  Scenario: Every own namespace is a v<major> address
    Given our BPMN extension namespaces
    When each is read
    Then each contains a /v<major>/ segment

  @test:schemas/namespaces-legacy.test.ts::own_extension_namespaces_during_the_v<major>_transition::the_canonical_v<major>_address_is_ours
  Scenario: Each canonical v<major> address is ours
    Given our BPMN extension namespaces
    When each is checked as an own namespace
    Then each is ours

  @test:schemas/namespaces-legacy.test.ts::own_extension_namespaces_during_the_v<major>_transition::the_legacy_exact-semver_spelling_of_the_SAME_major_is_ours
  Scenario: The legacy semver spelling of the same major is ours
    Given each own namespace respelt with "<major>.1.0" and with "<major>.0.0"
    When each is checked
    Then each is ours

  @test:schemas/namespaces-legacy.test.ts::own_extension_namespaces_during_the_v<major>_transition::another_major,_a_partial_version,_or_another_path_is_still_foreign
  Scenario: Another major, a partial version or another path is foreign
    Given each own namespace respelt with the next major, with "<major>.1", and with another final path segment
    When each is checked
    Then none is ours
    And an undefined namespace is not ours

  @test:schemas/namespaces-legacy.test.ts::own_extension_namespaces_during_the_v<major>_transition::a_diagram_binding_the_legacy_spelling_has_its_prefix_read_as_ours
  Scenario: A diagram binding the legacy spelling has its prefix read as ours
    Given a diagram binding cat-harness.processes to the legacy semver spelling and x to a foreign namespace
    When its own extension prefixes are read
    Then they are exactly "cat-harness.processes"
