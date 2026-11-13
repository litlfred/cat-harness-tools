# Specifies the scenario overlay (schemas/process/scenario-overlay.ts): which
# actors, policies and roles a layer sees through its needs, and how a
# redeclaration that only adds is accepted as a move in flight.
Feature: A layer sees the actors and policies of what it needs, and a redeclaration may only add

  @test:schemas/scenario-overlay-needed.test.ts::neededActors_—_the_actors_one_instance_may_name::the_platform's,_every_needed_instance's_and_its_own;_not_a_sibling's
  Scenario: A layer sees the platform's, its needs' and its own actors, not a sibling's
    Given layers cat-harness, mid needing it, top needing mid, and a sibling, each declaring actors
    When the actors top may name are listed
    Then they are admin, vhl-receiver and vhl-sharer

  @test:schemas/scenario-overlay-needed.test.ts::neededActors_—_the_actors_one_instance_may_name::an_extension_in_the_audited_instance_adds_roles_to_an_actor_a_needed_instance_declares
  Scenario: An extension adds roles to a needed layer's actor
    Given top extends mid's vhl-sharer with role key-holder
    When the actors top may name are listed
    Then vhl-sharer's roles are sharer and key-holder

  @test:schemas/scenario-overlay-needed.test.ts::neededActors_—_the_actors_one_instance_may_name::a_needed_instance_sees_nothing_of_the_instance_above_it
  Scenario: A needed layer sees nothing of the layer above it
    Given the same layers
    When the actors mid may name are listed
    Then they are admin and vhl-sharer

  @test:schemas/scenario-overlay-needed.test.ts::neededActors_—_the_actors_one_instance_may_name::the_layers_are_deepest_first,_the_audited_instance_last
  Scenario: Scenario layers are listed deepest first
    Given the same layers
    When the scenario layers below top are listed
    Then they are cat-harness, mid and top

  @test:schemas/scenario-overlay-needed.test.ts::policies_travel_with_the_actors_they_grant::an_instance's_own_audit_reads_the_platform's,_every_needed_instance's_and_its_own;_not_a_sibling's
  Scenario: A layer's audit reads the platform's and its needs' policies, not a sibling's
    Given policies in cat-harness, mid and sibling
    When the policies needed by top and by mid are read
    Then each is urn:p:defaults and urn:p:mid

  @test:schemas/scenario-overlay-needed.test.ts::policies_travel_with_the_actors_they_grant::the_platform's_checkout_reads_every_dependent's
  Scenario: The platform's checkout reads every layer's policies
    Given the same policies
    When the checkout's policies are read from cat-harness
    Then they are urn:p:defaults, urn:p:mid and urn:p:sibling

  @test:schemas/scenario-overlay-needed.test.ts::policies_travel_with_the_actors_they_grant::a_higher_instance_redeclaring_a_lower_policy's_uid_and_dropping_its_rules_is_refused,_not_merged
  Scenario: Redeclaring a lower policy and dropping its rules is refused
    Given top redeclares urn:p:defaults with no permissions
    When top's needed policies are read
    Then it throws "already declared below"

  @test:schemas/scenario-overlay-needed.test.ts::a_move_in_flight_—_a_redeclaration_that_only_adds::onlyAdds:_equal_scalars,_superset_arrays,_nested_objects_by_the_same_rule;_`_`-keys_ignored
  Scenario: onlyAdds accepts additions and refuses changes and removals
    Given pairs of an older and a newer object
    When onlyAdds compares them
    Then equal scalars, superset arrays, nested additions and a new key are accepted, and _-prefixed keys are ignored
    And a changed scalar, a shrunk array, a dropped key, a changed nested value or an array element gaining a field are refused

  @test:schemas/scenario-overlay-needed.test.ts::a_move_in_flight_—_a_redeclaration_that_only_adds::an_actor_redeclared_identically_by_a_higher_instance_is_accepted,_with_a_warning_naming_both_layers
  Scenario: An actor redeclared identically higher up is accepted with a warning
    Given top declares an exact copy of cat-harness's admin actor
    When the actors top may name are listed
    Then there is one admin, read from top
    And one warning names admin, cat-harness and top, calls it a move in flight and advises removing the copy

  @test:schemas/scenario-overlay-needed.test.ts::a_move_in_flight_—_a_redeclaration_that_only_adds::an_actor_redeclared_with_an_added_role_and_field_is_accepted,_and_keeps_what_a_lower_extension_added
  Scenario: An actor redeclared with additions keeps extensions
    Given mid redeclares admin with an added role and a description, and top extends admin with key-holder
    When the checkout's actors are read
    Then admin's roles are administrator, auditor and key-holder, with the description
    And a move-in-flight warning names admin

  @test:schemas/scenario-overlay-needed.test.ts::a_move_in_flight_—_a_redeclaration_that_only_adds::an_actor_redeclared_with_a_changed_field_or_a_dropped_role_is_refused
  Scenario: An actor redeclared with a change is refused
    Given top redeclares admin with a changed kind, with no roles, or with a changed title
    When the actors top may name are listed
    Then each throws "already declared below"

  @test:schemas/scenario-overlay-needed.test.ts::a_move_in_flight_—_a_redeclaration_that_only_adds::a_role_redeclared_identically_is_accepted,_with_a_warning
  Scenario: A role redeclared identically is accepted with a warning
    Given a base role graph and an upper layer redeclaring role mover identically
    When the role graphs are overlaid
    Then the roles are mover and stayer
    And a warning names mover, base and upper

  @test:schemas/scenario-overlay-needed.test.ts::a_move_in_flight_—_a_redeclaration_that_only_adds::a_role_redeclared_with_added_skills_is_accepted,_and_keeps_what_a_lower_extension_added
  Scenario: A role redeclared with added skills keeps extensions
    Given a middle layer extending stayer with wait, and an upper layer redeclaring stayer with sit and a persona
    When the role graphs are overlaid
    Then stayer's skills are sit and wait
    And a warning names stayer and upper

  @test:schemas/scenario-overlay-needed.test.ts::a_move_in_flight_—_a_redeclaration_that_only_adds::a_role_redeclared_with_a_changed_title_or_a_dropped_skill_is_refused
  Scenario: A role redeclared with a change is refused
    Given an upper layer redeclaring mover with a new title, or with no skills
    When the role graphs are overlaid
    Then each throws "already declared by base"

  @test:schemas/scenario-overlay-needed.test.ts::a_move_in_flight_—_a_redeclaration_that_only_adds::a_policy_redeclared_identically,_or_with_an_added_rule,_is_accepted_with_a_warning
  Scenario: A policy redeclared with an added rule or identically is accepted
    Given top redeclares urn:p:defaults with its rule plus one more
    When top's needed policies are read
    Then the policy has two permissions and a move-in-flight warning names it and top
    And when top's copy is identical the policy has one permission

  @test:schemas/scenario-overlay-needed.test.ts::a_move_in_flight_—_a_redeclaration_that_only_adds::a_policy_redeclared_with_a_changed_rule_is_refused
  Scenario: A policy redeclared with a changed rule is refused
    Given top redeclares urn:p:defaults with a different action
    When top's needed policies are read
    Then it throws "already declared below"
