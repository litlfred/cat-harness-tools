# Specifies the tool profile (schemas/tools/tool-profile.ts), the graph check
# over tool releases and profiles, and the seeded tool-releases/ directory as
# scripts/tool-releases.ts loads it.
Feature: A tool profile names tool releases, and the release graph is checked whole

  @test:schemas/tool-profile.test.ts::folio-tool-profile/v1::a_valid_profile_parses
  Scenario: A profile naming a tool release parses
    Given a profile mapping plantuml to "plantuml@1.2026.9"
    When it is parsed
    Then it parses

  @test:schemas/tool-profile.test.ts::folio-tool-profile/v1::an_empty_profile_is_refused
  Scenario: An empty profile is refused
    Given a profile with no tools
    When it is parsed
    Then it is refused

  @test:schemas/tool-profile.test.ts::folio-tool-profile/v1::a_key_that_is_not_the_name_of_the_release_it_maps_to_is_refused_—_the_runtime_cannot_hide_under_a_tool's_name
  Scenario: A key must be the name of the release it maps to
    Given a profile mapping plantuml to "temurin-jre@21.0.4+7"
    When it is parsed
    Then it is refused

  @test:schemas/tool-profile.test.ts::folio-tool-profile/v1::a_bare_tool_name_with_no_version_is_refused
  Scenario: A release reference with no version is refused
    Given a profile mapping plantuml to "plantuml"
    When it is parsed
    Then it is refused

  @test:schemas/tool-profile.test.ts::folio-tool-profile/v1::strict:_an_unknown_field_is_refused
  Scenario: A profile with an unknown field is refused
    Given a valid profile with an extra runtimes field
    When it is parsed
    Then it is refused

  @test:schemas/tool-profile.test.ts::the_graph_—_what_one_file_cannot_know::the_T4_set_is_clean:_PlantUML_with_its_JRE_and_graphviz,_and_a_default_profile_naming_tools_only
  Scenario: PlantUML with its JRE and graphviz and a tools-only profile is clean
    Given releases for the JRE, graphviz and PlantUML, and a profile naming plantuml and graphviz
    When the release graph is checked
    Then there are no problems

  @test:schemas/tool-profile.test.ts::the_graph_—_what_one_file_cannot_know::a_profile_NAMING_A_RUNTIME_is_refused_—_that_is_the_global_java_pin_by_another_name
  Scenario: A profile naming a runtime is a problem
    Given a profile naming temurin-jre directly
    When the release graph is checked
    Then there is one problem saying it names the runtime directly

  @test:schemas/tool-profile.test.ts::the_graph_—_what_one_file_cannot_know::a_profile_ref_to_no_release_is_refused
  Scenario: A profile naming an unrecorded release is a problem
    Given a profile naming "plantuml@9.9"
    When the release graph is checked
    Then the first problem says no record declares it

  @test:schemas/tool-profile.test.ts::the_graph_—_what_one_file_cannot_know::a_runtime_ref_to_no_release_is_refused
  Scenario: A runtime nobody records is a problem
    Given the graphviz and PlantUML releases without the JRE
    When the release graph is checked
    Then the first problem says PlantUML needs runtime temurin-jre@21.0.4+7

  @test:schemas/tool-profile.test.ts::the_graph_—_what_one_file_cannot_know::a_runtime_with_no_`entry.home`_cannot_be_injected
  Scenario: A runtime with no entry.home is a problem
    Given a JRE release whose entry has no home
    When the release graph is checked with graphviz and PlantUML
    Then the first problem says it declares no `entry.home`

  @test:schemas/tool-profile.test.ts::the_graph_—_what_one_file_cannot_know::a_TOOL_may_be_another_tool's_runtime_—_graphviz_is_how_PlantUML_finds_`dot`
  Scenario: A tool may serve as another tool's runtime
    Given the three releases and a profile naming graphviz
    When the release graph is checked
    Then there are no problems

  @test:schemas/tool-profile.test.ts::the_graph_—_what_one_file_cannot_know::one_release_recorded_twice_on_one_platform_is_refused;_on_two_platforms_it_is_not
  Scenario: One release recorded twice is a problem only on one platform
    Given the JRE release recorded twice
    When the release graph is checked
    Then the first problem says it is recorded twice
    And the same release recorded for linux arm64 and linux x64 has no problem

  @test:schemas/tool-profile.test.ts::the_graph_—_what_one_file_cannot_know::two_profiles_with_one_name_are_refused
  Scenario: Two profiles with one name are a problem
    Given the same profile listed twice
    When the release graph is checked
    Then the first problem says it is declared twice

  @test:schemas/tool-profile.test.ts::the_seeded_directory,_as_the_gate_reads_it::every_file_parses_and_none_is_mistaken_for_an_instance_declaration
  Scenario: The seeded tool-releases directory loads without problems
    Given the harness's tool-releases directory
    When it is loaded as the gate loads it
    Then there are no load problems

  @test:schemas/tool-profile.test.ts::the_seeded_directory,_as_the_gate_reads_it::the_graph_is_clean,_and_the_`default`_profile_names_no_runtime
  Scenario: The seeded release graph is clean and has a default profile
    Given the loaded releases and profiles
    When the release graph is checked
    Then there are no problems
    And a profile named "default" exists
