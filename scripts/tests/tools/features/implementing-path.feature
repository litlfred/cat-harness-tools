# Owner rulings T1 and T7 (bean 70lx): a path the harness declares stays as
# written and is resolved against the layer that implements the declarer,
# found through that layer's own `needs`. The fixture checkout has an
# aggregate root "top", a declarer "base", direct implementers "impl" and
# "twin", and "far", which reaches base only through impl. Each Scenario names
# the test that executes it.
Feature: A declared path resolves against the declaring layer or its one direct implementer

  @test:scripts/tests/tools/implementing-path.test.ts::which_instances_implement_a_declarer::those_whose_OWN_needs_name_it_—_not_transitive_dependents,_not_the_aggregate_root
  Scenario: The implementers of a declarer are those whose own needs name it
    Given the fixture checkout
    When the implementers of "base" are listed
    Then they are exactly "impl" and "twin"

  @test:scripts/tests/tools/implementing-path.test.ts::resolving_a_declared_path::the_declaring_instance_first,_so_a_path_that_has_not_moved_resolves_where_it_always_did
  Scenario: A path the declarer still holds resolves in the declarer
    Given src/tools/x.ts exists in both "base" and "impl"
    When it is resolved from "base"
    Then it is found in "base" via "own"

  @test:scripts/tests/tools/implementing-path.test.ts::resolving_a_declared_path::then_the_one_implementer_that_holds_it_—_the_moved_case
  Scenario: A path moved to one implementer resolves there
    Given src/tools/x.ts exists only in "impl"
    When it is resolved from "base"
    Then it is found in "impl" via "needs"
    And the implementing root for it is impl's root

  @test:scripts/tests/tools/implementing-path.test.ts::resolving_a_declared_path::a_transitive_dependent's_copy_is_not_found
  Scenario: A copy held only by a transitive dependent is not found
    Given pipeline/c.ts exists only in "far"
    When it is resolved from "base"
    Then it is missing
    And the places looked are base first, then impl and twin, never far

  @test:scripts/tests/tools/implementing-path.test.ts::resolving_a_declared_path::a_file_at_the_aggregate_root_under_the_same_relative_path_is_not_found
  Scenario: A copy at the aggregate root is not found
    Given src/tools/x.ts exists only at the checkout root
    When it is resolved from "base"
    Then it is missing

  @test:scripts/tests/tools/implementing-path.test.ts::resolving_a_declared_path::two_implementers_holding_it_is_ambiguous,_and_never_resolved_by_order
  Scenario: Two implementers holding the path is ambiguous
    Given scripts/s.ts exists in both "impl" and "twin"
    When it is resolved from "base"
    Then it is ambiguous between "impl" and "twin"
    And asking for its implementing root throws "more than one implementing instance"

  @test:scripts/tests/tools/implementing-path.test.ts::resolving_a_declared_path::missing_returns_the_declaring_root,_so_a_caller's_own_miss_report_is_unchanged
  Scenario: The implementing root of a missing path is the declarer's root
    Given nowhere.ts exists in no instance
    When its implementing root is asked from "base"
    Then it is base's root

  @test:scripts/tests/tools/implementing-path.test.ts::in_this_checkout::this_layer_implements_the_harness,_and_is_found_through_its_needs
  Scenario: cat-harness-tools implements the harness; the aggregate root does not
    When the implementers of the harness are listed
    Then they include "cat-harness-tools"
    And they do not include "folio-assistant"

  @test:scripts/tests/tools/implementing-path.test.ts::in_this_checkout::a_path_that_exists_only_in_this_layer_resolves_from_a_harness_declaration
  Scenario: A path only this layer holds resolves from the harness to this layer
    Given scripts/lib/roots.ts does not exist in the harness
    When it is resolved from the harness
    Then it is found in "cat-harness-tools" at this layer's root via "needs"

  @test:scripts/tests/tools/implementing-path.test.ts::in_this_checkout::every_Tool_module_and_every_check:tools_path_resolves_today
  Scenario: Every in-process Tool module and every check:tools path resolves
    Given every instance of the checkout and the Tools each declares
    Then each Tool's in-process module resolves from its declaring instance
    And more than 10 such modules were checked
    And check:tools reports no unresolved path
