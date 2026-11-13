# Specifies navbarIcons on a declaration (NavbarIconsSchema and
# resolveNavbarIcons in schemas/kg/cat-harness.ts): a capped, closed list of
# navbar icons inherited breadth-first up the needs chain.
Feature: A layer's navbar icons are its own list, inherited up its needs, or none

  @test:schemas/navbar-icons.test.ts::three_states,_and_the_middle_one_is_the_point::a_list_is_the_instance's_own_answer_and_outranks_what_it_needs
  Scenario: A declared list outranks what the layer needs
    Given leaf declares todos and beans and needs base, which declares every icon
    When leaf's icons are resolved with floor base
    Then they are todos and beans

  @test:schemas/navbar-icons.test.ts::three_states,_and_the_middle_one_is_the_point::ABSENT_inherits_—_the_nearest_declaration_up_the_`needs`_chain_wins
  Scenario: An absent list inherits the nearest declaration up the needs chain
    Given leaf declares nothing and needs mid, which declares kg and needs base
    When leaf's icons are resolved with floor base
    Then they are kg

  @test:schemas/navbar-icons.test.ts::three_states,_and_the_middle_one_is_the_point::`[]`_means_SHOW_NONE,_and_stops_the_walk_rather_than_inheriting_over_it
  Scenario: An empty list shows none and stops the walk
    Given leaf declares an empty list and needs base, which declares every icon
    When leaf's icons are resolved with floor base
    Then they are an empty list

  @test:schemas/navbar-icons.test.ts::three_states,_and_the_middle_one_is_the_point::`undefined`_is_the_THIRD_state_—_nobody_decided,_and_that_is_not_`[]`
  Scenario: Nobody deciding is undefined, not empty
    Given a lone layer that declares nothing and needs nothing
    When its icons are resolved with no floor
    Then the answer is undefined and not an empty list

  @test:schemas/navbar-icons.test.ts::three_states,_and_the_middle_one_is_the_point::the_FLOOR_answers_only_when_the_walk_reached_nobody_who_had
  Scenario: The floor answers only when nobody on the walk declared
    Given an island layer with no needs and a floor declaring launcher
    When the island's icons are resolved with that floor
    Then they are launcher
    And when the island declares an empty list they are an empty list

  @test:schemas/navbar-icons.test.ts::three_states,_and_the_middle_one_is_the_point::a_floor_already_visited_is_not_consulted_twice
  Scenario: A floor already walked through that declares nothing gives undefined
    Given leaf needs floor, and floor declares nothing
    When leaf's icons are resolved with floor as the floor
    Then the answer is undefined
    # Gap: the outcome would be the same if the floor were consulted twice, since it declares nothing; not consulting it twice is not observable here.

  @test:schemas/navbar-icons.test.ts::the_walk_is_breadth-first,_and_it_terminates::a_nearer_layer_beats_a_deeper_one
  Scenario: The first-listed need that declares wins
    Given leaf needs near, declaring todos, and far, declaring beans
    When leaf's icons are resolved
    Then they are todos
    # Gap: near and far are at the same depth, so the test shows need order, not that a nearer layer beats a deeper one.

  @test:schemas/navbar-icons.test.ts::the_walk_is_breadth-first,_and_it_terminates::a_`needs`_cycle_does_not_hang_—_the_finding_belongs_elsewhere
  Scenario: A needs cycle resolves without hanging
    Given a needs b and b needs a, neither declaring
    When a's icons are resolved
    Then the answer is undefined

  @test:schemas/navbar-icons.test.ts::the_walk_is_breadth-first,_and_it_terminates::an_instance_that_needs_something_undeclared_resolves_rather_than_throwing
  Scenario: Needing an undeclared layer resolves without throwing
    Given leaf needs ghost, which is not declared
    When leaf's icons are resolved
    Then the answer is undefined

  @test:schemas/navbar-icons.test.ts::the_schema_holds_the_owner's_cap::eight_is_allowed;_a_ninth_is_REFUSED,_never_truncated
  Scenario: Eight icons parse and a ninth is refused
    Given the full set of navbar icons
    When it is parsed
    Then it parses and there are eight
    And with a ninth entry the list is refused

  @test:schemas/navbar-icons.test.ts::the_schema_holds_the_owner's_cap::an_icon_listed_twice_is_two_slots_doing_one_job
  Scenario: An icon listed twice is refused
    Given the list todos, todos
    When it is parsed
    Then it is refused

  @test:schemas/navbar-icons.test.ts::the_schema_holds_the_owner's_cap::the_set_is_CLOSED_—_a_name_nothing_draws_is_refused_at_the_declaration
  Scenario: Only known icon names parse
    Given the lists kg and kgviewer
    When each is parsed
    Then kg parses and kgviewer is refused

  @test:schemas/navbar-icons.test.ts::the_schema_holds_the_owner's_cap::`[]`_PARSES_—_the_owner_asked_for_it_and_the_schema_must_not_forbid_it
  Scenario: An empty icon list parses
    Given an empty list
    When it is parsed
    Then it parses

  @test:schemas/navbar-icons.test.ts::the_live_declarations::cat-harness_is_the_floor,_and_it_is_the_one_that_declares
  Scenario: cat-harness declares a valid icon list without processes or kg
    Given the cat-harness declaration
    When its navbar icons are read
    Then the declaration is named cat-harness and its icons parse
    And they include neither processes nor kg
