# Specifies the tool-release record (schemas/tools/tool-release.ts): a pinned,
# digest-identified external binary with its runtimes, entry template and
# licence, the seeded records, and the graph typology it is held under.
Feature: A tool release pins one binary by digest, with its runtimes, entry and licence

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::a_valid_release_parses
  Scenario: A valid release parses
    Given a PlantUML jar release with digest, URL source, licence, a JRE runtime and an entry
    When it is parsed
    Then it parses

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::the_digest_is_REQUIRED_—_the_resolver's_one_refusal_compares_against_it
  Scenario: A release without a digest is refused
    Given the release without its digest
    When it is parsed
    Then it is refused

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::the_digest_is_`binary-release`'s_ReleaseDigestSchema:_an_uppercase_or_short_hash_is_refused
  Scenario: An uppercase, short or md5 digest is refused
    Given the release with an uppercase sha256, a 63-character sha256, or an md5 digest
    When each is parsed
    Then each is refused

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::strict:_a_field_carrying_the_bytes_is_refused
  Scenario: A release carrying its bytes is refused
    Given the release with a content field
    When it is parsed
    Then it is refused

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::an_unknown_kind_is_refused
  Scenario: An unknown kind is refused
    Given the release of kind "snap"
    When it is parsed
    Then it is refused

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::a_plain-http_source_is_refused
  Scenario: A plain-http source is refused
    Given the release fetched from an http URL
    When it is parsed
    Then it is refused

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::an_OCI_image_is_identified_by_digest,_never_by_tag::by_digest:_accepted
  Scenario: An OCI image referenced by its digest is accepted
    Given an oci-image release whose reference is @sha256 of its digest
    When it is parsed
    Then it parses

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::an_OCI_image_is_identified_by_digest,_never_by_tag::by_TAG:_refused
  Scenario: An OCI image referenced by tag is refused
    Given oci-image releases referenced by tag 2026.10 and by tag latest
    When each is parsed
    Then each is refused

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::an_OCI_image_is_identified_by_digest,_never_by_tag::by_tag_AND_digest:_refused_—_the_tag_is_a_second,_moving_answer
  Scenario: An OCI reference with both tag and digest is refused
    Given an oci-image release referenced by tag and digest together
    When it is parsed
    Then it is refused

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::an_OCI_image_is_identified_by_digest,_never_by_tag::a_reference_naming_a_different_digest_from_`digest`_is_refused
  Scenario: An OCI reference naming another digest is refused
    Given an oci-image release whose reference digest differs from its recorded digest
    When it is parsed
    Then it is refused

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::an_OCI_image_is_identified_by_digest,_never_by_tag::an_`oci-image`_fetched_by_URL,_or_a_jar_fetched_by_OCI_reference,_is_refused
  Scenario: Kind and source type must agree
    Given an oci-image with a URL source, and a jar with an OCI source
    When each is parsed
    Then each is refused

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::runtimes_are_per_release::`runtimes`_is_required,_so_'needs_none'_is_stated_rather_than_omitted
  Scenario: Runtimes must be stated, even when none
    Given the release without runtimes, and with an empty runtimes list
    When each is parsed
    Then the first is refused and the second parses

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::runtimes_are_per_release::a_runtime_ref_must_be_`name@version`
  Scenario: A runtime reference needs a version
    Given a runtime named "temurin-jre" without a version
    When the release is parsed
    Then it is refused

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::runtimes_are_per_release::injection_is_JAVA_HOME_or_PATH_—_never_'inherit'
  Scenario: A runtime is injected by JAVA_HOME or PATH only
    Given a runtime injected by "inherit", and one by "PATH"
    When each release is parsed
    Then the first is refused and the second parses

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::runtimes_are_per_release::a_release_cannot_be_its_own_runtime
  Scenario: A release cannot be its own runtime
    Given the PlantUML release naming plantuml@1.2026.9 as its runtime
    When it is parsed
    Then it is refused

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::runtimes_are_per_release::one_runtime_named_twice_is_refused
  Scenario: A runtime named twice is refused
    Given the JRE runtime listed twice
    When the release is parsed
    Then it is refused

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::the_entry_template_runs_THIS_release::a_template_that_never_names_{path}_or_{home}_is_refused
  Scenario: An entry that never names the release is refused
    Given the entry template "java -version"
    When the release is parsed
    Then it is refused

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::the_entry_template_runs_THIS_release::an_unknown_placeholder_is_refused
  Scenario: An unknown placeholder is refused
    Given the entry template "java -jar {jar}"
    When the release is parsed
    Then it is refused

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::the_entry_template_runs_THIS_release::{home}_needs_`home`,_and_`home`_may_not_climb_out_of_the_archive
  Scenario: The {home} placeholder needs a home inside the archive
    Given the entry template "{home}/bin/java"
    When it has no home it is refused
    And with home "jdk" it parses
    And with home "../etc" or "/usr" it is refused

  @test:schemas/tool-release.test.ts::folio-tool-release/v1::a_multi-line_licence_is_refused_by_the_schema
  Scenario: A multi-line licence is refused
    Given a licence spanning two lines
    When the release is parsed
    Then it is refused

  @test:schemas/tool-release.test.ts::release_refs::round-trip,_splitting_at_the_one_`@`
  Scenario: A release reference splits at its @ and joins back
    Given "temurin-jre@21.0.4+7" and graphviz version 16.1.0
    When the first is parsed and the second formatted
    Then the first is name temurin-jre, version 21.0.4+7
    And the second is "graphviz@16.1.0"

  @test:schemas/tool-release.test.ts::release_refs::two_`@`,_a_missing_version_or_an_uppercase_name_is_refused
  Scenario: Malformed release references are refused
    Given "a@b@c", "plantuml@" and "PlantUML@1"
    When each is parsed as a release reference
    Then each is refused

  @test:schemas/tool-release.test.ts::licences,_against_the_pinned_SPDX_License_List::the_list_loads_(could-not-determine_would_fail_here,_not_pass)
  Scenario: The pinned SPDX licence list loads
    Given the checkout's pinned SPDX licence list
    When it is loaded
    Then it is a list, not a problem message

  @test:schemas/tool-release.test.ts::licences,_against_the_pinned_SPDX_License_List::a_real_expression_passes_and_a_mistyped_id_does_not
  Scenario: A real licence expression passes and a typo does not
    Given the licences "GPL-2.0-only WITH Classpath-exception-2.0" and "GPL-3.O-or-later"
    When each is checked against the list
    Then the first has no problem and the second has one

  @test:schemas/tool-release.test.ts::the_seeded_records::T4:_PlantUML,_its_JRE_and_graphviz_are_all_present,_and_each_parses
  Scenario: The seeded releases include PlantUML, its JRE and graphviz
    Given the tool-release files seeded in the harness
    When each is parsed
    Then each parses and their names include graphviz, plantuml and temurin-jre

  @test:schemas/tool-release.test.ts::the_seeded_records::PlantUML's_digest_is_the_one_`scripts/plantuml-render.ts`_already_pins_—_one_fact,_two_places,_checked
  Scenario: The seeded PlantUML release matches the renderer's pin
    Given the seeded PlantUML release and the PlantUML pin in scripts/plantuml-render.ts
    When they are compared
    Then the version, sha256 digest and URL source are the same

  @test:schemas/tool-release.test.ts::the_graph_typology_it_is_held_under::registered,_not_renderable,_`content`_—_a_pin_is_a_decision_the_resolver_reads
  Scenario: The tool-release typology is registered, not renderable, in the content layer
    Given the default graph typologies
    When tool-release is looked up
    Then it is registered, not renderable, and of layer content

  @test:schemas/tool-release.test.ts::the_graph_typology_it_is_held_under::both_families_are_listed,_so_`check:kind-validators`_can_route_every_file
  Scenario: The tool-release typology lists both node families
    Given the tool-release typology
    When its node schema families are sorted
    Then they are folio-tool-profile/v1 and folio-tool-release/v1

  @test:schemas/tool-release.test.ts::the_graph_typology_it_is_held_under::a_running_step_never_WRITES_a_pin_—_the_resolver_reads_it;_what_a_run_resolved_is_a_run_context
  Scenario: No process step may write a tool release
    Given the tool-release typology
    When it is asked whether a process may write it
    Then it may not
