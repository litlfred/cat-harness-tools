# Specifies provJsonldDocument and its address book (schemas/kg/prov-jsonld.ts)
# and the decision-record stamps of schemas/content/prov.ts: provenance
# published as PROV-JSONLD whose agents, roles and plans are links.
Feature: Provenance is published as PROV-JSONLD with links at release addresses

  @test:schemas/prov-jsonld.test.ts::the_held_PROV-JSONLD_context::matches_its_pinned_sha256,_and_is_the_JSON-LD_1.1_context_it_claims_to_be
  Scenario: The held PROV-JSONLD context is a JSON-LD 1.1 context for PROV
    Given the PROV-JSONLD context held in the checkout
    When it is read, which throws if its sha256 differs from the pin
    Then its @version is 1.1
    And its prov prefix is the PROV namespace

  @test:schemas/prov-jsonld.test.ts::provJsonldDocument_—_a_real_checkout's_actors,_roles_and_plans::agent,_role_and_plan_expand_to_LINKS_at_their_release_addresses,_not_literals
  Scenario: Agent, role and plan expand to links at their release addresses
    Given an activity by actor "owner" in role "authoring-agent" under plan "code-change-review#Task_ClaimBean"
    When its PROV-JSONLD document is built over the checkout's address book and expanded
    Then nothing is unaddressed
    And the association's agent, role and plan are @id links under the cat-harness v0 release address

  @test:schemas/prov-jsonld.test.ts::provJsonldDocument_—_a_real_checkout's_actors,_roles_and_plans::the_activity_is_joined_to_its_association_through_@reverse_prov:qualifiedAssociation
  Scenario: The activity is joined to its association by a reverse link
    Given the same activity's expanded document
    When the activity and association nodes are found
    Then the activity's @id is the folio address of "t--x#1" and it has a start time
    And the association reaches the activity through @reverse prov:qualifiedAssociation

  @test:schemas/prov-jsonld.test.ts::provJsonldDocument_—_a_real_checkout's_actors,_roles_and_plans::underPolicy's_IRIs_are_links_too
  Scenario: The activity's policy is a link
    Given an activity under the folio-defaults policy
    When its document is expanded
    Then its underPolicy value is an @id link to the policy

  @test:schemas/prov-jsonld.test.ts::provJsonldDocument_—_a_real_checkout's_actors,_roles_and_plans::an_owner_with_no_iriBase_keeps_the_value_a_LITERAL_and_says_why_—_never_a_relative_IRI
  Scenario: A plan whose owner declares no iriBase stays a literal, with the reason
    Given an activity under plan "render-kg-to-github-pages#Task_Scope"
    When its document is built
    Then exactly one value is unaddressed, the plan, because its owner "declares no iriBase"
    And the expanded plan is a @value literal

  @test:schemas/prov-jsonld.test.ts::provJsonldDocument_—_a_real_checkout's_actors,_roles_and_plans::an_id_nobody_declares_is_unaddressed,_with_the_reason
  Scenario: An undeclared actor is unaddressed, with the reason
    Given an activity by actor "nobody-at-all"
    When its document is built
    Then the only unaddressed value is the agent, because no instance declares that actor

  @test:schemas/prov-jsonld.test.ts::prov:used_—_catalogue_items_linked_at_their_Handle_(owner_2026-10-01,_option_A)::an_item_nobody_catalogues_stays_a_literal,_with_the_reason
  Scenario: A used item nobody catalogues stays a literal, with the reason
    Given an activity that used "item/not-catalogued"
    When its document is built and expanded
    Then the only unaddressed value is the entity, because no instance catalogues it
    And prov:used is a @value literal

  @test:schemas/prov-jsonld.test.ts::prov:wasInformedBy_—_a_link_to_another_activity_(bean_w1gy)::each_value_is_emitted_as_an_@id_link_and_expands_to_the_PROV-O_property
  Scenario: wasInformedBy is emitted as a link
    Given an activity informed by https://example.org/step/0 and a stub address book
    When its document is expanded
    Then prov:wasInformedBy is an @id link to that step

  @test:schemas/prov-jsonld.test.ts::the_context_is_named,_never_fetched::documents_reference_the_published_URL_and_carry_@base_in_their_OWN_context
  Scenario: A document names the published context URL and carries its own @base
    Given an empty provenance document built with a stub address book
    When its @context is read
    Then its first entry is the published PROV-JSONLD context URL
    And its second entry defines @base

  @test:schemas/prov-jsonld.test.ts::subject_IRIs_beside_the_release_addresses_(issue_#959,_owner_2026-10-30_option_A)::plan_and_role_subjects_are_links;_the_stored_short_reference_stays_the_plan
  Scenario: Plan and role subjects are published beside the release addresses
    Given an address book that resolves release addresses and subjects for plans and roles but not agents
    When an activity in role "merge-steward" under plan "merge-train#Task_ReadLive" is published
    Then the association's plan is the release address
    And it carries a plan subject and a role subject, and no agent subject
    And the expanded plan subject is an @id link

  @test:schemas/prov-jsonld.test.ts::subject_IRIs_beside_the_release_addresses_(issue_#959,_owner_2026-10-30_option_A)::a_book_without_subjects_publishes_only_the_release_addresses
  Scenario: An address book without subjects publishes no subject keys
    Given an address book that resolves only release addresses
    When the same activity is published
    Then the association has no key ending in "Subject"

  @test:schemas/prov-jsonld.test.ts::processHolding_—_the_process_a_task_belongs_to::each_task_resolves_to_its_own_process;_unknown_ids_and_ids_outside_any_process_to_none
  Scenario: A task resolves to the process that holds it
    Given a BPMN document with task T1 in process A, user task T2 in process B, and a participant P1
    When the holding process of each id is found
    Then T1 is in A and T2 in B
    And an unknown id and the participant have none

  @test:schemas/prov-jsonld.test.ts::decision_records_cite_agreement_and_grant_with_standard_terms_(bean_yy40)::the_agreement_is_a_prov:used_dcat:Distribution_with_spdx:checksum,_the_grant_a_VC;_the_hash_chain_is_labelled_a_local_extension
  Scenario: A decision record cites its agreement and grant in standard terms
    Given a stamped decision record that used an agreement distribution with a sha256 and a grant credential
    When its document is built and expanded
    Then the agreement is a prov:Entity and dcat:Distribution with an spdx sha256 checksum of type hexBinary
    And the grant is a prov:Entity and VerifiableCredential
    And the activity has no property named agreement or grant
    And previousHash and recordHash are each commented as a "Local extension"
