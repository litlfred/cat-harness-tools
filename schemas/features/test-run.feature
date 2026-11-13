# Specifies the test-run record (schemas/sdlc/test-run.ts): a data hash and a
# process hash over disjoint inputs, that reproduce when nothing changed,
# move when either changes, and never match when unknown.
Feature: A test run records separate data and process hashes that reproduce and detect change

  @test:schemas/test-run.test.ts::criterion_1_—_both_hashes,_neither_derivable_from_the_other::a_run_carries_a_data_hash_and_a_process_hash,_over_different_inputs
  Scenario: A run carries distinct data and process hashes
    Given a corpus file as data input and a runner file as process input
    When a test run is built
    Then the data and process hashes differ
    And each records its own inputs
    And the run parses

  @test:schemas/test-run.test.ts::criterion_1_—_both_hashes,_neither_derivable_from_the_other::overlapping_bases_are_REFUSED,_because_the_pair_would_say_nothing_extra
  Scenario: Overlapping data and process inputs are refused
    Given both.json named as a data input and as a process input
    When a test run is built
    Then a basis error is thrown whose overlap is both.json

  @test:schemas/test-run.test.ts::criterion_1_—_both_hashes,_neither_derivable_from_the_other::basisOverlap_reports_every_shared_input,_not_just_the_first
  Scenario: The overlap lists every shared input
    Given bases p, q, r and q, r, s
    When their overlap is computed
    Then it is q and r
    And bases with nothing shared have no overlap

  @test:schemas/test-run.test.ts::criterion_1_—_both_hashes,_neither_derivable_from_the_other::the_real_runner's_two_bases_are_in_fact_disjoint
  Scenario: The crdm-detect runner's real bases hash
    Given the crdm-detect corpus as data and its runner and skill as process inputs
    When a test run is built over the checkout
    Then neither hash is unknown
    # Gap: disjointness is implied only by the build not throwing; it is not asserted directly.

  @test:schemas/test-run.test.ts::criterion_2_—_an_unchanged_data_set_and_process_reproduce_the_hashes::hashing_the_same_files_twice_gives_the_same_digest
  Scenario: Hashing the same files twice agrees
    Given a corpus file
    When its basis is hashed twice
    Then both results are equal

  @test:schemas/test-run.test.ts::criterion_2_—_an_unchanged_data_set_and_process_reproduce_the_hashes::input_ORDER_does_not_change_the_hash,_but_input_SET_does
  Scenario: Input order does not change the hash but the input set does
    Given files a.json and b.json
    When they are hashed in both orders, and a.json alone
    Then both orders give one hash
    And a.json alone gives another

  @test:schemas/test-run.test.ts::criterion_2_—_an_unchanged_data_set_and_process_reproduce_the_hashes::two_files_swapping_NAMES_is_a_different_basis
  Scenario: Swapping two files' contents changes the hash
    Given one root with a.json "A" and b.json "B", and another with them swapped
    When each is hashed over a.json and b.json
    Then the hashes differ

  @test:schemas/test-run.test.ts::criterion_2_—_an_unchanged_data_set_and_process_reproduce_the_hashes::an_unchanged_run_reproduces_on_both_halves
  Scenario: An unchanged run reproduces both hashes
    Given the same inputs
    When a run is built twice and compared
    Then data, process and both reproduce

  @test:schemas/test-run.test.ts::criterion_3_—_a_deliberate_change_to_either_is_detected::changing_the_DATA_moves_the_data_hash_and_only_the_data_hash
  Scenario: Changing the data moves only the data hash
    Given a run, then a change to the data file and a second run
    When the runs are compared
    Then data does not reproduce, process does, and both does not

  @test:schemas/test-run.test.ts::criterion_3_—_a_deliberate_change_to_either_is_detected::changing_the_PROCESS_moves_the_process_hash_and_only_the_process_hash
  Scenario: Changing the process moves only the process hash
    Given a run, then a change to the runner and a second run
    When the runs are compared
    Then data reproduces, process does not, and both does not

  @test:schemas/test-run.test.ts::`unknown`_is_a_third_state,_not_a_value_that_matches_itself::an_unreadable_input_yields_unknown_rather_than_a_hash_of_nothing
  Scenario: A missing input makes the hash unknown
    Given a basis naming missing.json, which does not exist
    When it is hashed
    Then the hash is unknown and the input is still recorded

  @test:schemas/test-run.test.ts::`unknown`_is_a_third_state,_not_a_value_that_matches_itself::one_unreadable_input_makes_the_WHOLE_basis_unknown
  Scenario: One missing input makes the whole basis unknown
    Given a basis of an existing file and a missing one
    When it is hashed
    Then the hash is unknown

  @test:schemas/test-run.test.ts::`unknown`_is_a_third_state,_not_a_value_that_matches_itself::unknown_does_not_reproduce_unknown
  Scenario: Unknown hashes never reproduce
    Given a run whose both hashes are unknown
    When it is compared with itself
    Then nothing reproduces

  @test:schemas/test-run.test.ts::`unknown`_is_a_third_state,_not_a_value_that_matches_itself::a_real_hash_still_reproduces_itself_—_the_guard_is_not_simply_'never_equal'
  Scenario: Real hashes reproduce themselves
    Given a run with real data and process hashes
    When it is compared with itself
    Then both reproduce

  @test:schemas/test-run.test.ts::the_schema_refuses_what_it_cannot_mean::a_basis_with_no_inputs_is_rejected_—_a_hash_over_nothing_is_not_a_hash
  Scenario: A basis with no inputs is refused
    Given a run whose data basis has no inputs
    When it is parsed
    Then parsing throws

  @test:schemas/test-run.test.ts::the_schema_refuses_what_it_cannot_mean::a_recorded_run,_written_and_read_back,_parses_as_what_it_declares
  Scenario: A written run reads back as a test run
    Given a built run written to s.test-run.json
    When it is read back and parsed
    Then its $schema is the test-run schema and its bases do not overlap

  @test:schemas/test-run.test.ts::a_run_may_name_the_plan_it_executed_and_the_system_under_test_(bean_ygzh)::a_run_recorded_before_plans_existed_still_parses,_with_neither_field
  Scenario: A legacy run without plan or system under test parses
    Given a crdm-detect run recorded before plans existed
    When it is parsed
    Then it has neither plan nor sut

  @test:schemas/test-run.test.ts::a_run_may_name_the_plan_it_executed_and_the_system_under_test_(bean_ygzh)::plan_and_sut_are_carried_through_buildTestRun_and_parse
  Scenario: Plan and system under test are carried through
    Given a run built with plan crdm-detect version 1 and an agent system under test
    When it is parsed
    Then both are kept unchanged

  @test:schemas/test-run.test.ts::a_run_may_name_the_plan_it_executed_and_the_system_under_test_(bean_ygzh)::a_plan_with_no_system_under_test_is_refused_—_a_plan_is_run_AGAINST_something
  Scenario: A plan without a system under test is refused
    Given a run naming a plan but no sut
    When it is parsed
    Then it is refused with the first issue at sut

  @test:schemas/test-run.test.ts::a_run_may_name_the_plan_it_executed_and_the_system_under_test_(bean_ygzh)::reach_is_the_actor-reach_vocabulary_plus_`unknown`,_and_nothing_else
  Scenario: Reach is the actor-reach vocabulary or unknown
    Given a run with a plan and a sut of reach "unknown", and one of reach "online"
    When each is parsed
    Then the first parses and the second is refused

  @test:schemas/test-run.test.ts::a_run_may_name_the_plan_it_executed_and_the_system_under_test_(bean_ygzh)::SC-002:_an_agent_run_without_a_model_or_a_configuration_is_refused
  Scenario: An agent under test needs a model id and a configuration
    Given a run with a plan and an agent sut
    When it is parsed with its model and configuration
    Then it parses
    And without a model, without a configuration, or with the model "Claude Opus" it is refused

  @test:schemas/test-run.test.ts::a_run_may_name_the_plan_it_executed_and_the_system_under_test_(bean_ygzh)::a_skill_names_no_model,_and_a_system_under_test_must_say_its_kind
  Scenario: A skill under test names no model and every sut names its kind
    Given a run with a plan and a skill sut
    When it is parsed
    Then it parses
    And the same sut with a model is refused, and without a kind is refused

  @test:schemas/test-run.test.ts::a_run_may_name_the_plan_it_executed_and_the_system_under_test_(bean_ygzh)::the_plan_ref_carries_a_version,_because_a_case_id_means_nothing_across_plan_versions
  Scenario: A plan reference must carry a version
    Given a run whose plan has an id but no version
    When it is parsed
    Then it is refused
