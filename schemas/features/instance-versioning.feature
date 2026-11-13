# Specifies instance versioning: the publication state and exact version of a
# declaration (schemas/kg/cat-harness.ts), the publishable gate
# (scripts/check-publishable.ts), FHIR dependsOn records
# (schemas/kg/depends-on.ts), version bumps computed from the published
# surface (schemas/kg/version-bump.ts, scripts/check-version-bump.ts) and
# release tags.
Feature: An instance's version is exact, its bump is computed from its surface, and publication is a state

  @test:schemas/instance-versioning.test.ts::publication_is_a_STATE,_and_`published`_is_refused_(§3.1,_superseded_2026-09-23)::absent_`publication`_is_legal_and_means_draft
  Scenario: A declaration without publication parses
    Given a declaration with a version and no publication
    When it is parsed
    Then it parses

  @test:schemas/instance-versioning.test.ts::publication_is_a_STATE,_and_`published`_is_refused_(§3.1,_superseded_2026-09-23)::`publication.state:_\"draft\"`_is_legal_and_says_nothing_extra
  Scenario: A draft publication state parses
    Given a declaration whose publication state is "draft"
    When it is parsed
    Then it parses

  @test:schemas/instance-versioning.test.ts::publication_is_a_STATE,_and_`published`_is_refused_(§3.1,_superseded_2026-09-23)::`publication.state:_\"published\"`_FAILS_TO_PARSE_—_the_process_does_not_exist
  Scenario: A published state fails to parse
    Given a declaration whose publication state is "published"
    When it is parsed
    Then the only failing path is publication.state

  @test:schemas/instance-versioning.test.ts::publication_is_a_STATE,_and_`published`_is_refused_(§3.1,_superseded_2026-09-23)::`publication.host`_still_parses_beside_the_state_—_they_are_two_facets,_not_rivals
  Scenario: A publication host parses with or without a state
    Given publication with host github-pages and state draft, and with the host alone
    When each declaration is parsed
    Then both parse

  @test:schemas/instance-versioning.test.ts::a_version_is_universal_but_GATE-enforced;_an_id_is_held_(§3.2,_owner_2026-09-23)::a_declaration_with_neither_still_parses_—_the_type_permits_absence
  Scenario: A declaration with neither id nor version parses
    Given a declaration with no id and no version
    When it is parsed
    Then it parses

  @test:schemas/instance-versioning.test.ts::a_version_is_universal_but_GATE-enforced;_an_id_is_held_(§3.2,_owner_2026-09-23)::the_GATE_is_what_refuses_a_missing_version,_and_names_the_instance
  Scenario: The publishable gate reports a missing version
    Given a tree with instance alpha declaring no version
    When the publishable audit runs
    Then there is one major finding about the version, naming alpha

  @test:schemas/instance-versioning.test.ts::a_version_is_universal_but_GATE-enforced;_an_id_is_held_(§3.2,_owner_2026-09-23)::an_instance_WITH_a_version_raises_nothing_—_falsifiable_in_both_directions
  Scenario: An instance with a version raises nothing
    Given a tree with instance alpha at version 0.1.0
    When the publishable audit runs
    Then there are no findings

  @test:schemas/instance-versioning.test.ts::a_version_is_universal_but_GATE-enforced;_an_id_is_held_(§3.2,_owner_2026-09-23)::no_instance_declares_an_`id`_yet,_and_an_absent_one_is_legal
  Scenario: An absent id is legal
    Given a declaration with no id
    When it is parsed
    Then no path fails
    # Gap: the title also says no instance declares an id yet; no real declaration is read.

  @test:schemas/instance-versioning.test.ts::a_version_is_universal_but_GATE-enforced;_an_id_is_held_(§3.2,_owner_2026-09-23)::`canonicalUrl`_is_NOT_required_—_a_draft_without_one_is_legal
  Scenario: A declaration without a canonical URL parses
    Given a declaration with no canonicalUrl
    When it is parsed
    Then it parses

  @test:schemas/instance-versioning.test.ts::check:publishable_—_the_rules_a_per-declaration_schema_cannot_see::a_duplicate_id_is_a_major_finding_—_an_id_is_an_identity,_so_two_is_two_packages_under_one_name
  Scenario: Two instances with one id are a major finding
    Given instances alpha and beta both with id org.example.shared
    When the publishable audit runs
    Then there is one major finding naming that id

  @test:schemas/instance-versioning.test.ts::check:publishable_—_the_rules_a_per-declaration_schema_cannot_see::distinct_ids_raise_nothing_—_the_duplicate_rule_is_falsifiable_in_both_directions
  Scenario: Distinct ids raise nothing
    Given instances alpha and beta with their own ids
    When the publishable audit runs
    Then there are no findings

  @test:schemas/instance-versioning.test.ts::check:publishable_—_the_rules_a_per-declaration_schema_cannot_see::an_unreadable_declaration_is_`unknown`,_never_counted_as_draft
  Scenario: An unreadable declaration is unknown, not draft
    Given an instance whose declaration is not JSON
    When the publishable audit runs
    Then its row is unknown with a problem, and there is a major finding for it
    And the report says "UNKNOWN is not draft"

  @test:schemas/instance-versioning.test.ts::check:publishable_—_the_rules_a_per-declaration_schema_cannot_see::an_all-draft_census_says_it_is_DECIDED_—_the_opposite_of_what_it_used_to_say
  Scenario: An all-draft census is reported as decided
    Given instances alpha and beta, both versioned and without publication
    When the publishable audit runs
    Then every row is draft and there are no findings
    And the report says every instance is draft and that this is a decided state

  @test:schemas/instance-versioning.test.ts::check:publishable_—_the_rules_a_per-declaration_schema_cannot_see::`publication.state:_\"published\"`_FAILS_TO_PARSE_—_refused,_not_reported
  Scenario: A declaration claiming published is unknown to the audit
    Given instance alpha declaring publication state "published"
    When the publishable audit runs
    Then its row is unknown with a problem

  @test:schemas/instance-versioning.test.ts::dependsOn_—_§3.4's_record,_and_what_it_reports_instead::a_publishable_instance_depending_on_a_publishable_one_emits_the_FHIR_triple
  Scenario: A dependency with id, version and canonical URL becomes a dependsOn record
    Given top needs base, and both have id, version and canonicalUrl
    When top's dependsOn is computed
    Then the only record is base's package id, version 1.0.0 and URI
    And there are no gaps and nothing unavailable

  @test:schemas/instance-versioning.test.ts::dependsOn_—_§3.4's_record,_and_what_it_reports_instead::a_dependency_with_no_`canonicalUrl`_is_a_gap,_not_an_omission_—_and_says_which_reason
  Scenario: A dependency without a canonical URL is a gap
    Given top needs base, which has no canonicalUrl
    When top's dependsOn is computed
    Then there are no records and one gap of reason no-uri
    And the unavailable note says none is expressible as a record

  @test:schemas/instance-versioning.test.ts::dependsOn_—_§3.4's_record,_and_what_it_reports_instead::an_id_and_a_version_are_NOT_enough_—_the_gap_is_specifically_the_uri
  Scenario: The gap names the missing canonical URL
    Given top needs base, which has an id and version but no canonicalUrl
    When top's dependsOn is computed
    Then the gap's detail mentions canonicalUrl and not "publishable"

  @test:schemas/instance-versioning.test.ts::dependsOn_—_§3.4's_record,_and_what_it_reports_instead::a_name_matching_no_instance_is_`unresolved`_—_external_and_misspelled_are_not_the_same
  Scenario: A need naming no instance is unresolved
    Given top needs "nowhere"
    When top's dependsOn is computed
    Then there is one gap, for nowhere, of reason unresolved

  @test:schemas/instance-versioning.test.ts::dependsOn_—_§3.4's_record,_and_what_it_reports_instead::a_publishable_instance_with_no_dependencies_is_a_DETERMINED_empty_—_no_`unavailable`
  Scenario: A publishable instance with no needs has an empty, determined dependsOn
    Given a publishable instance with no needs
    When its dependsOn is computed
    Then there are no records, no gaps and nothing unavailable

  @test:schemas/instance-versioning.test.ts::dependsOn_—_§3.4's_record,_and_what_it_reports_instead::an_instance_with_NO_canonicalUrl_withholds_the_block_and_says_why_—_it_does_not_emit_an_empty_one
  Scenario: An instance without a canonical URL withholds its dependsOn
    Given an instance with id and version but no canonicalUrl
    When its dependsOn is computed
    Then there are no records and the unavailable note names canonicalUrl and says it cannot be expressed

  @test:schemas/instance-versioning.test.ts::dependsOn_—_§3.4's_record,_and_what_it_reports_instead::having_an_id_and_a_version_is_not_enough_—_the_withholding_is_specifically_the_uri
  Scenario: The withholding is about the URI, not publishability
    Given an instance with id and version 3.1.4 but no canonicalUrl
    When its dependsOn is computed
    Then something is unavailable and the note does not say "publishable"

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::a_removal_is_MAJOR,_and_outranks_a_simultaneous_addition
  Scenario: A removal is a major bump even beside an addition
    Given a surface of skills a and b becoming a and c
    When the surfaces are diffed
    Then the bump is major, c is added and b removed

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::an_addition_alone_is_MINOR
  Scenario: An addition alone is a minor bump
    Given a surface gaining a tool
    When the surfaces are diffed
    Then the bump is minor

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::no_change_is_PATCH_—_prose_included,_which_is_18_of_the_20_measured_commits
  Scenario: An unchanged surface is a patch bump
    Given the same surface before and after
    When the surfaces are diffed
    Then the bump is patch

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::a_node_whose_TYPE_changed_under_the_same_id_is_major,_not_patch
  Scenario: A changed type under the same id is a major bump
    Given node x of type Skill becoming type Tool
    When the surfaces are diffed
    Then the bump is major

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::surfaceOf_takes_every_node_with_an_@id,_dedupes,_and_sorts
  Scenario: The surface is the distinct, sorted nodes that have an @id
    Given a graph with b, a, a again, and a node with no @id
    When its surface is taken
    Then it is a then b

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::a_node_with_an_@id_but_no_@type_is_scored_under_`?`,_never_dropped
  Scenario: A node with no type is kept under ?
    Given a graph node with an @id and no @type
    When its surface is taken
    Then it is listed with type ?

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::a_multi-typed_node_is_keyed_on_its_types_SORTED,_so_array_order_is_not_a_change
  Scenario: The order of a node's types is not a change
    Given node x typed B, A and then typed A, B
    When the surfaces are diffed
    Then the bump is patch

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::a_document_with_no_@graph_is_an_empty_surface,_not_a_crash
  Scenario: A document with no graph has an empty surface
    Given an empty object and null
    When each surface is taken
    Then each is empty

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::applyBump::bumps_the_right_field_and_zeroes_the_ones_below_it
  Scenario: A bump raises its field and zeroes those below
    Given version 1.2.3
    When it is bumped major, minor and patch
    Then it becomes 2.0.0, 1.3.0 and 1.2.4

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::applyBump::a_pseudo-version_comes_back_unchanged_rather_than_coerced
  Scenario: A pseudo-version is not bumped
    Given versions "current" and "dev"
    When each is bumped
    Then each comes back unchanged

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::clearsFloor_—_a_floor,_not_an_expectation::equal_to_the_floor_passes
  Scenario: A version equal to the floor clears it
    Given version 1.3.0 and floor 1.3.0
    When the floor is checked
    Then it is cleared

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::clearsFloor_—_a_floor,_not_an_expectation::ABOVE_the_floor_passes_—_the_author_may_always_bump_further
  Scenario: A version above the floor clears it
    Given versions 2.0.0 and 1.4.0 against floor 1.3.0
    When the floor is checked
    Then both clear it

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::clearsFloor_—_a_floor,_not_an_expectation::below_the_floor_fails_—_that_is_the_whole_gate
  Scenario: A version below the floor fails
    Given 1.2.9 against 1.3.0 and 1.0.0 against 2.0.0
    When the floor is checked
    Then neither clears it

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::clearsFloor_—_a_floor,_not_an_expectation::compares_NUMERICALLY,_so_0.10.0_is_above_0.9.0
  Scenario: Versions compare numerically
    Given 0.10.0 and 0.9.0
    When each is checked against the other as floor
    Then 0.10.0 clears 0.9.0 and not the reverse

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::clearsFloor_—_a_floor,_not_an_expectation::an_uncomparable_pair_is_NOT_a_pass_—_the_caller_reports_it_undetermined
  Scenario: An uncomparable pair does not clear the floor
    Given "current" against 1.0.0
    When the floor is checked
    Then it is not cleared and the pair is not comparable
    And 1.0.0 and 1.2.3 are comparable

  @test:schemas/instance-versioning.test.ts::version_bump_—_computed_from_the_surface,_not_claimed_by_a_commit_message_(§4)::every_instance_carrying_a_version_means_the_gate_has_rows_to_score
  Scenario: Every versioned instance is a row of the bump audit
    Given a tree of versioned instances alpha and beta
    When the version bump audit runs
    Then its rows are alpha and beta and there is no note

  @test:schemas/instance-versioning.test.ts::release_tags_—_`<name>-v`_everywhere,_plain_`v`_only_in_a_standalone_repository_(owner_2026-09-30,_Q4)::a_standalone_repository's_plain_tags_are_its_releases,_newest_first
  Scenario: A standalone repository's plain v tags are releases, newest first
    Given a standalone repository tagged v0.1.0, v0.10.0, v0.9.0 and vnext
    When bootstrap's release tags are listed
    Then they are v0.10.0, v0.9.0 and v0.1.0

  @test:schemas/instance-versioning.test.ts::release_tags_—_`<name>-v`_everywhere,_plain_`v`_only_in_a_standalone_repository_(owner_2026-09-30,_Q4)::in_a_repository_of_several_instances_a_plain_tag_names_no_instance,_so_it_is_not_read
  Scenario: In a multi-instance repository only name-prefixed tags count
    Given a repository tagged v1.0.0 and bootstrap-v0.2.0, not standalone
    When bootstrap's release tags are listed
    Then they are exactly bootstrap-v0.2.0

  @test:schemas/instance-versioning.test.ts::release_tags_—_`<name>-v`_everywhere,_plain_`v`_only_in_a_standalone_repository_(owner_2026-09-30,_Q4)::both_spellings_of_one_version_are_one_release
  Scenario: Both spellings of one version are one release
    Given a standalone repository tagged v0.1.0 and bootstrap-v0.1.0
    When bootstrap's release versions are listed
    Then they are exactly 0.1.0
