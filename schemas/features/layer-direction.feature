# Specifies directionOf (schemas/kg/layer-direction.ts) over a layer graph,
# with permits, the partition's own rule, and detangle's classification
# (schemas/kg/detangle.ts).
Feature: An edge between layers is allowed, wrong-direction, permitted or undetermined

  @test:schemas/layer-direction.test.ts::directionOf_over_a_`needs`_graph::a_layer_reaches_itself_and_everything_it_transitively_needs
  Scenario: A layer reaches itself and what it transitively needs
    Given the needs graph bootstrap, cat-harness needs bootstrap, folio-assistant-core needs cat-harness, and an undeclared layer
    When edges from folio-assistant-core to itself and to bootstrap are judged
    Then both are allowed

  @test:schemas/layer-direction.test.ts::directionOf_over_a_`needs`_graph::pointing_up_the_stack_is_wrong-direction,_with_a_basis_naming_both_layers
  Scenario: Pointing up the stack is wrong-direction
    Given the needs graph
    When an edge from bootstrap to cat-harness is judged
    Then it is wrong-direction
    And the basis names 'bootstrap' and 'cat-harness'

  @test:schemas/layer-direction.test.ts::directionOf_over_a_`needs`_graph::absent_`needs`_is_UNDETERMINED_—_never_'reaches_nothing'_and_never_'reaches_anything'
  Scenario: A layer with no declared needs is undetermined
    Given the needs graph
    When edges from the undeclared layer to cat-harness and to itself are judged
    Then both are undetermined
    And an edge from bootstrap to the undeclared layer is wrong-direction

  @test:schemas/layer-direction.test.ts::directionOf_over_a_`needs`_graph::an_end_in_no_layer_at_all_is_undetermined,_and_says_which_end
  Scenario: An edge whose source is in no layer is undetermined and names it
    Given the needs graph
    When an edge from x/y.md, in no layer, to bootstrap is judged
    Then the verdict is undetermined with basis "x/y.md sits in no declared layer"

  @test:schemas/layer-direction.test.ts::permits::a_permit_turns_a_refused_edge_into_`permitted`,_carrying_the_permit
  Scenario: A permit turns a refused edge into permitted
    Given a low and a high layer and a permit from l.ts to h.ts for "side-effect registration"
    When the edge from l.ts in low to h.ts in high is judged
    Then it is permitted, carrying that permit's reason

  @test:schemas/layer-direction.test.ts::permits::a_permit_on_an_ALLOWED_edge_is_not_consulted_—_so_a_caller_can_report_it_stale
  Scenario: A permit on an allowed edge is not consulted
    Given a permit from h.ts to l.ts
    When the edge from h.ts in high to l.ts in low is judged
    Then it is allowed, not permitted

  @test:schemas/layer-direction.test.ts::the_partition's_own_rule_runs_through_the_same_function::harness_importing_core_is_wrong-direction;_core_importing_harness_is_allowed
  Scenario: The partition's own rule judges harness and core edges
    Given the partition's allowed-imports rule
    When edges harness to core, core to harness and test to base are judged
    Then the first is wrong-direction and the others are allowed

  @test:schemas/layer-direction.test.ts::detangle's_cut_kind_is_read_off_the_verdict_and_nothing_else::wrong-direction_maps_to_the_wrong-direction_cut_kind
  Scenario: A wrong-direction verdict classifies as a wrong-direction cut
    Given an edge from bootstrap to cat-harness judged over the needs graph
    When detangle classifies it by direction
    Then its kind is wrong-direction

  @test:schemas/layer-direction.test.ts::detangle's_cut_kind_is_read_off_the_verdict_and_nothing_else::allowed_and_undetermined_stay_unclassified_—_restatement_vs_essential_is_an_adjudication
  Scenario: Allowed and undetermined verdicts stay unclassified
    Given an allowed edge from cat-harness to bootstrap and an undetermined edge from the undeclared layer to bootstrap
    When detangle classifies each
    Then each is unclassified with a non-empty basis
