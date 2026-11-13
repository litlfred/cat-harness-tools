# Specifies the render exemption of a declaration (renderExemptionProblems,
# isExemptFrom and RENDER_OBLIGATIONS in schemas/kg/cat-harness.ts): at most
# one layer may be excused a render obligation, and it must say what it owes.
Feature: A render exemption is well formed, claimed by at most one layer, and owes a substitute

  @test:schemas/render-exemption-harness.test.ts::this_repository's_actual_declaration::bootstrap_claims_the_exemption,_and_it_is_well-formed
  Scenario: bootstrap claims a well-formed render exemption
    Given bootstrap's declaration in the checkout
    When its render exemption is read and checked
    Then it is present and has no problems

  @test:schemas/render-exemption-harness.test.ts::this_repository's_actual_declaration::it_excuses_BOTH_visualisers_the_owner_named,_and_nothing_else
  Scenario: bootstrap is excused exactly the two visualisers
    Given bootstrap's render exemption
    When the obligations it is excused from are sorted
    Then they are visualiser and workflow-visualiser

  @test:schemas/render-exemption-harness.test.ts::this_repository's_actual_declaration::EXACTLY_one_instance_in_this_repository_claims_it
  Scenario: Only bootstrap among the listed roots claims an exemption
    Given the roots bootstrap, cat-harness, folio-assist-core and the checkout root
    When the declarations found there that claim a render exemption are listed
    Then there is exactly one, named bootstrap
    # Gap: the root list spells "folio-assist-core", which names no layer, so folio-assistant-core is never read; and only these four roots are checked, not every instance.

  @test:schemas/render-exemption-harness.test.ts::this_repository's_actual_declaration::what_it_OWES_exists_on_disk_—_the_two_render_skills_it_names
  Scenario: The render skills bootstrap owes exist on disk
    Given the bootstrap-graph-*.md paths named in backticks in bootstrap's owes text
    When each is resolved under bootstrap
    Then at least one is named and each exists
    # Gap: the title says two skills; the test requires only at least one.

  @test:schemas/render-exemption-harness.test.ts::this_repository's_actual_declaration::the_subgraph_it_owes_is_DECLARED,_not_merely_present
  Scenario: The skills bootstrap owes lie in a declared skills directory
    Given the bootstrap-graph-*.md paths named in bootstrap's owes text
    When each is matched to a directory bootstrap declares
    Then at least one is named and each lies in a declared directory typed skills

  @test:schemas/render-exemption-harness.test.ts::a_claim_that_is_not_well-formed_is_refused::no_reason
  Scenario: An exemption with no reason is a problem
    Given an otherwise well-formed exemption with an empty reason
    When it is checked
    Then there is one problem

  @test:schemas/render-exemption-harness.test.ts::a_claim_that_is_not_well-formed_is_refused::no_substitute_—_the_hole_this_field_exists_to_close
  Scenario: An exemption that owes nothing is a problem
    Given an otherwise well-formed exemption with an empty owes
    When it is checked
    Then there is one problem

  @test:schemas/render-exemption-harness.test.ts::a_claim_that_is_not_well-formed_is_refused::excused_from_nothing
  Scenario: An exemption from nothing is a problem
    Given an otherwise well-formed exemption with an empty of list
    When it is checked
    Then there is one problem

  @test:schemas/render-exemption-harness.test.ts::a_claim_that_is_not_well-formed_is_refused::an_obligation_nobody_has_defined
  Scenario: An exemption from an undefined obligation is a problem
    Given an exemption from "prettiness"
    When it is checked
    Then there is one problem

  @test:schemas/render-exemption-harness.test.ts::a_claim_that_is_not_well-formed_is_refused::and_a_well-formed_one_is_NOT_refused
  Scenario: A well-formed exemption has no problem
    Given an exemption from visualiser with a reason and a substitute
    When it is checked
    Then there are no problems

  @test:schemas/render-exemption-harness.test.ts::the_exemption_does_not_spread::two_claimants_is_a_finding,_and_it_names_them
  Scenario: Two claimants are one problem naming both
    Given bootstrap and cat-harness both claiming a well-formed exemption
    When they are checked together
    Then there is one problem naming bootstrap and cat-harness

  @test:schemas/render-exemption-harness.test.ts::the_exemption_does_not_spread::none_is_fine_—_at_most_one,_not_exactly_one
  Scenario: No claimant is fine
    Given a folio with no exemption
    When it is checked
    Then there are no problems

  @test:schemas/render-exemption-harness.test.ts::isExemptFrom_is_what_the_QA_axis_calls::true_for_a_listed_obligation,_false_for_an_unlisted_one
  Scenario: A layer is exempt only from the obligations it lists
    Given a declaration exempt from visualiser
    When its exemption from visualiser and from workflow-visualiser is asked
    Then it is exempt from the first and not the second

  @test:schemas/render-exemption-harness.test.ts::isExemptFrom_is_what_the_QA_axis_calls::false_for_an_instance_that_declares_no_exemption
  Scenario: A layer with no exemption is exempt from nothing
    Given a declaration with no render exemption
    When its exemption from visualiser is asked
    Then it is not exempt

  @test:schemas/render-exemption-harness.test.ts::the_obligations_are_a_closed_set::all_three_are_named,_and_adding_one_is_a_deliberate_edit
  Scenario: The render obligations are exactly three
    Given the render obligations
    When they are sorted
    Then they are own-docs, visualiser and workflow-visualiser
