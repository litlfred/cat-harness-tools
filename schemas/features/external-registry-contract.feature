# Specifies our side of the external-registry contract
# (skills/kg/kg-core/external-registry-contract.md): the role in
# scenarios/roles.json, the lane that relies on it in
# processes/kg/kg-to-portal.bpmn, and what the verifier does when it fails.
Feature: The external-registry role is held to its contract on our side

  @test:schemas/external-registry-contract.test.ts::the_role_is_played_by_an_external_party,_and_its_contract_is_a_skill_it_carries::actorKinds_is_external_only,_and_it_carries_external-registry-contract
  Scenario: The external-registry role is external and carries its contract skill
    Given the "external-registry" role of scenarios/roles.json
    When its actor kinds and skills are read
    Then its actor kinds are exactly "external"
    And its skills include "external-registry-contract"

  @test:schemas/external-registry-contract.test.ts::Where_the_diagrams_lean_on_it:_one_lane,_Lane_Portal_in_kg-to-portal,_holding_P_Verify_and_GW_Verified::in_this_repository's_processes_exactly_one_lane_names_the_role,_through_partitionElementRef
  Scenario: Exactly one lane in the processes names the role
    Given every .bpmn file under processes/
    When the lanes whose partitionElementRef is "external-registry" are listed
    Then the list is exactly processes/kg/kg-to-portal.bpmn#Lane_Portal

  @test:schemas/external-registry-contract.test.ts::Where_the_diagrams_lean_on_it:_one_lane,_Lane_Portal_in_kg-to-portal,_holding_P_Verify_and_GW_Verified::the_role_is_declared_as_a_top-level_resource,_and_the_lane_holds_P_Verify_and_GW_Verified
  Scenario: The role is a declared resource and its lane holds the verifier
    Given kg-to-portal.bpmn
    When its resources and the portal lane's flow node refs are read
    Then a resource with id "external-registry" exists
    And the lane holds P_Verify and GW_Verified

  @test:schemas/external-registry-contract.test.ts::What_the_verifier_does_when_the_contract_is_not_met:_never_a_pass::GW_Verified_serves_the_bytes_on_exactly_one_branch,_the_match,_and_has_no_default
  Scenario: The verifier gateway serves only on a match and has no default
    Given the sequence flows leaving GW_Verified
    When those reaching End_Served are listed
    Then there is exactly one, named "signature and digests match"
    And the gateway has no default flow

  @test:schemas/external-registry-contract.test.ts::What_the_verifier_does_when_the_contract_is_not_met:_never_a_pass::every_other_branch_goes_to_End_Rejected,_which_serves_the_previous_version
  Scenario: Every other branch is rejected and serves the previous version
    Given the flows leaving GW_Verified that do not reach End_Served
    When their targets are read
    Then there is at least one, and each targets End_Rejected
    And End_Rejected's name says to serve the previous version

  @test:schemas/external-registry-contract.test.ts::What_the_verifier_does_when_the_contract_is_not_met:_never_a_pass::the_lane_states_that_an_unreachable_registry_is_`unknown`,_routed_as_a_mismatch,_never_a_guessed_pass
  Scenario: The lane documents that an unreachable registry is unknown, never a pass
    Given the portal lane's documentation
    When it is read
    Then it says an unreachable registry's answer is `unknown`
    And that it is routed the same way as a mismatch
    And never to a guessed pass
    # Gap: only the lane's prose is checked; no flow in the diagram is shown to route an unreachable registry.
