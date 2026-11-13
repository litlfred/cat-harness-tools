# TODO-HEADER: what scripts/tests/process/process-definers.test.ts covers, one or two comment lines. Each Scenario names the test that executes it.
Feature: TODO-FEATURE

  @test:scripts/tests/process/process-definers.test.ts::nearestDefiner::a_definer_refers_to_itself
  Scenario: TODO-SCENARIO a definer refers to itself
    # TODO-STEPS scripts/tests/process/process-definers.test.ts:31

  @test:scripts/tests/process/process-definers.test.ts::nearestDefiner::equally_near_definers_fall_back_to_the_first_path,_deterministically
  Scenario: TODO-SCENARIO equally near definers fall back to the first path, deterministically
    # TODO-STEPS scripts/tests/process/process-definers.test.ts:37

  @test:scripts/tests/process/process-definers.test.ts::nearestDefiner::an_unknown_id_resolves_to_nothing
  Scenario: TODO-SCENARIO an unknown id resolves to nothing
    # TODO-STEPS scripts/tests/process/process-definers.test.ts:42

  @test:scripts/tests/process/process-definers.test.ts::render-bpmn_resolves_every_link_per_referrer,_not_from_one_last-wins_map
  Scenario: TODO-SCENARIO render-bpmn resolves every link per referrer, not from one last-wins map
    # TODO-STEPS scripts/tests/process/process-definers.test.ts:47


  @test:scripts/tests/process/process-definers.test.ts::nearestDefiner::each_referrer_resolves_to_its_own_layer's_definer_(read_order_%s)
  Scenario: TODO-SCENARIO each referrer resolves to its own layer's definer (read order %s)
    # TODO-STEPS scripts/tests/process/process-definers.test.ts:20
