# Specifies the contribution registry (schemas/content/contributions.ts) and
# loadContributions (schemas/kg/harness-config.ts): what a dependency adds to
# a folio (block kinds, adapters, tools, QA checkers, renderers) and the
# collisions that are refused.
Feature: A dependency contributes kinds, adapters, tools, checkers and renderers, and collisions are refused

  @test:schemas/contributions.test.ts::ContributionRegistry::accepts_a_contribution_and_reports_what_it_added
  Scenario: A contribution's kind, adapter and tool are registered
    Given a contribution of kind knot-diagram for adapter sci, the sci adapter module and a lean tool
    When it is registered
    Then knot-diagram is owned by sci, sci's module is ./index.ts, and the contributed tools are lean

  @test:schemas/contributions.test.ts::ContributionRegistry::is_idempotent_for_the_same_contributor_—_a_DIAMOND_is_not_a_collision
  Scenario: Registering the same contribution twice is harmless
    Given the sci contribution registered once
    When it is registered again
    Then nothing throws and there is one contributed kind

  @test:schemas/contributions.test.ts::ContributionRegistry::REFUSES_a_kind_claimed_by_a_different_contributor,_naming_both
  Scenario: A kind claimed by two contributors is refused, naming both
    Given knot-diagram contributed by folio-asst-sci
    When smart-base contributes knot-diagram too
    Then a collision error names folio-asst-sci and smart-base

  @test:schemas/contributions.test.ts::ContributionRegistry::refuses_a_kind_the_platform_already_owns
  Scenario: A platform kind cannot be contributed
    Given an empty registry
    When a contribution claims the kind theorem
    Then a collision error is thrown

  @test:schemas/contributions.test.ts::ContributionRegistry::refuses_an_adapter_name_the_platform_already_owns
  Scenario: A platform adapter name cannot be contributed
    Given an empty registry
    When a contribution claims the first platform content adapter's name
    Then a collision error is thrown

  @test:schemas/contributions.test.ts::ContributionRegistry::carries_a_contributed_kind's_builder,_label_prefix_and_JSON-LD_types
  Scenario: A contributed kind carries its builder, prefix and types
    Given smart-base contributes decision-table with builder, prefix, folio and doco types, and persona with only a prefix
    When the registry is read
    Then decision-table's entry holds all of them
    And persona's builder defaults to its kind and it has no doco type
    And the builders and label prefixes are listed, and theorem has no contributed entry

  @test:schemas/contributions.test.ts::ContributionRegistry::refuses_a_contributed_builder_that_is_a_built-in_builder
  Scenario: A contributed builder may not reuse a built-in builder
    Given a contributed kind whose builder is theorem
    When it is registered
    Then a collision error is thrown

  @test:schemas/contributions.test.ts::ContributionRegistry::refuses_one_builder_claimed_for_two_contributed_kinds
  Scenario: One builder may not serve two contributed kinds
    Given contributor a's kind k-one with builder kOne
    When contributor b's kind k-two claims builder kOne
    Then a collision error is thrown

  @test:schemas/contributions.test.ts::ContributionRegistry::accepts_`dak`_as_a_contributed_adapter_now_that_core_does_not_build_it_in
  Scenario: dak may be contributed as an adapter
    Given smart-base contributes adapter dak with companion roles ts and dmn
    When the registry is read
    Then the contributed adapters are dak with those roles
    And an unknown adapter has no companion roles

  @test:schemas/contributions.test.ts::ContributionRegistry::refuses_a_tool_group_claimed_by_a_different_contributor
  Scenario: A tool claimed by two contributors is refused
    Given the sci contribution's lean tool
    When another contributor contributes lean
    Then a collision error is thrown

  @test:schemas/contributions.test.ts::ContributionRegistry::runs_every_contributed_tool_registrar_against_the_server
  Scenario: Every contributed tool registrar runs
    Given contributors a and b with tools lean and fsh
    When the tools are registered against a server
    Then both registrars ran

  @test:schemas/contributions.test.ts::composedKindOwner::consults_the_platform_first,_the_registry_second
  Scenario: A kind's owner comes from the platform first, then the registry
    Given a registry where sci contributes knot-diagram
    When the owners of theorem and knot-diagram are asked
    Then theorem's owner is its platform adapter, a content adapter
    And knot-diagram's owner is sci

  @test:schemas/contributions.test.ts::composedKindOwner::returns_undefined_for_an_unknown_kind_—_never_a_guess
  Scenario: An unknown kind has no owner
    Given an empty registry
    When the owner of "nonsense" is asked
    Then there is none

  @test:schemas/contributions.test.ts::loadContributions_—_the_Phase_0.1_gate::a_dependency_contributes_a_block_kind,_an_adapter_and_a_QA_checker
  Scenario: A dependency's declared nodes contribute a kind, an adapter and a checker
    Given a folio depending on dep-sci, which declares a knot-diagram kind, the sci adapter and a knot-well-formed checker
    When its contributions are loaded
    Then knot-diagram is owned by sci, sci's module is adapters/sci/index.ts, and the checker is registered

  @test:schemas/contributions.test.ts::loadContributions_—_the_Phase_0.1_gate::the_dependency's_declared_name_wins_over_whatever_the_module_claims
  Scenario: The contributor is the dependency's declared name
    Given the same folio
    When its contributions are loaded
    Then the first contributed kind's contributor is dep-sci

  @test:schemas/contributions.test.ts::loadContributions_—_the_Phase_0.1_gate::the_dependency_entry's_ROOT_wins_too,_so_a_checker_hashes_the_right_bytes
  Scenario: A loaded checker records the dependency's root
    Given the same folio
    When its contributions are loaded
    Then the checker's root is dep-sci's directory and its label is dep-sci/checks/knots.ts

  @test:schemas/contributions.test.ts::loadContributions_—_the_Phase_0.1_gate::a_declared_checker_whose_code_is_missing_fails_loudly
  Scenario: A checker whose code is missing fails to load
    Given a folio depending on a layer whose checker names a missing module
    When its contributions are loaded
    Then loading rejects with "does not exist"

  @test:schemas/contributions.test.ts::loadContributions_—_the_Phase_0.1_gate::a_folio_with_no_dependencies_loads_an_empty_registry,_not_an_error
  Scenario: A folio with no dependencies loads nothing
    Given a folio with no dependencies
    When its contributions are loaded
    Then there are no contributed kinds

  @test:schemas/contributions.test.ts::contributed_QA_checkers::a_dependency's_checker_is_reachable_by_the_criterion_it_answers
  Scenario: A contributed checker is found by its criterion
    Given smart-base contributes a checker for dak-bpmn-has-process
    When the registry is read
    Then the checker is found and listed with its contributor and label

  @test:schemas/contributions.test.ts::contributed_QA_checkers::an_unimplemented_criterion_is_undefined,_never_a_default_pass
  Scenario: An unimplemented criterion has no checker
    Given an empty registry
    When a checker for an unimplemented criterion is asked for
    Then there is neither a checker nor an entry

  @test:schemas/contributions.test.ts::contributed_QA_checkers::the_entry_carries_where_the_bytes_are,_so_the_verdict_can_go_stale
  Scenario: A checker entry records where its code is
    Given smart-base's contributed checker
    When its entry is read
    Then it holds the check, its source file, the contributor's root and a label

  @test:schemas/contributions.test.ts::contributed_QA_checkers::qaCheckers_without_a_root_is_refused,_naming_the_contributor
  Scenario: Checkers without a root are refused
    Given smart-base contributes a checker with no root
    When it is registered
    Then it throws, saying smart-base supplies qaCheckers but no root

  @test:schemas/contributions.test.ts::contributed_QA_checkers::two_contributors_claiming_one_criterion_throws,_naming_both
  Scenario: One criterion claimed by two contributors is refused
    Given smart-base contributes a checker for "shared"
    When folio-asst-sci contributes one too
    Then it throws naming both

  @test:schemas/contributions.test.ts::contributed_QA_checkers::the_same_contributor_re-registering_is_a_no-op,_so_a_diamond_loads
  Scenario: Re-registering the same checker contribution is harmless
    Given smart-base's checker contribution registered once
    When it is registered again
    Then nothing throws and there is one contributed checker

  @test:schemas/contributions.test.ts::contributed_renderers::a_render_target_is_reachable_by_format_and_by_adapter
  Scenario: A renderer is found by format and by adapter
    Given folio-asst-sci contributes a latex renderer for the paper adapter
    When the registry is read
    Then latex has a renderer and paper has one renderer

  @test:schemas/contributions.test.ts::contributed_renderers::an_adapter_with_no_contributed_target_gets_a_DETERMINED_empty
  Scenario: An adapter with no renderer gets an empty list
    Given the latex renderer for paper
    When the renderers for dak are asked
    Then the list is empty

  @test:schemas/contributions.test.ts::contributed_renderers::a_target_may_render_without_validating,_and_says_so_by_omission
  Scenario: A renderer may have no validator
    Given a markdown renderer for document with no validate
    When it is read
    Then it has render and no validate

  @test:schemas/contributions.test.ts::contributed_renderers::two_contributors_claiming_one_format_throws,_naming_both
  Scenario: One format claimed by two contributors is refused
    Given folio-asst-sci's latex renderer
    When another contributor contributes latex
    Then it throws naming both

  @test:schemas/contributions.test.ts::contributed_renderers::the_same_contributor_re-registering_is_a_no-op,_so_a_diamond_loads
  Scenario: Re-registering the same renderer contribution is harmless
    Given folio-asst-sci's renderer contribution registered once
    When it is registered again
    Then nothing throws and there is one contributed renderer

  @test:schemas/contributions.test.ts::contributed_renderers::the_listing_names_the_format,_its_adapters_and_its_contributor
  Scenario: The renderer listing names format, adapters and contributor
    Given folio-asst-sci's latex renderer
    When the contributed renderers are listed
    Then the listing is latex for paper by folio-asst-sci
