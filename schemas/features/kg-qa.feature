# Specifies the KG-QA criteria registry and report (schemas/sdlc/kg-qa.ts),
# the serving registry it reads, requirement nodes, the bridge to the
# graph-typology registry, and where verdicts live (kgQaHomeFor in
# schemas/kg/cat-harness.ts).
Feature: The KG-QA criteria are a consistent registry, and every layer's verdicts have a home

  @test:schemas/kg-qa.test.ts::the_criteria_registry::ids_are_unique
  Scenario: Criterion ids are unique
    Given the KG criteria
    When their ids are collected
    Then there are as many distinct ids as criteria

  @test:schemas/kg-qa.test.ts::the_criteria_registry::every_criterion_applies_to_at_least_one_subject_kind
  Scenario: Every criterion applies to some subject kind
    Given the KG criteria
    When each one's applicable kinds are read
    Then none is empty

  @test:schemas/kg-qa.test.ts::the_criteria_registry::every_subject_kind_has_at_least_one_criterion,_so_no_kind_is_audited_vacuously
  Scenario: Process, decision, role and graph each have criteria
    Given the subject kinds process, decision, role and graph
    When the criteria for each are listed
    Then none is empty

  @test:schemas/kg-qa.test.ts::the_criteria_registry::a_broken_reference_is_critical_and_an_absent_one_is_not
  Scenario: A broken skill reference is critical and a missing one major
    Given the criteria skill-ref-resolves and activity-names-skill
    When their severities are read
    Then they are critical and major

  @test:schemas/kg-qa.test.ts::the_criteria_registry::`activity-skill-has-tool`_is_minor,_so_the_backlog_cannot_gate
  Scenario: activity-skill-has-tool is minor and applies to processes
    Given the criterion activity-skill-has-tool
    When it is read
    Then its severity is minor and it applies only to process

  @test:schemas/kg-qa.test.ts::the_criteria_registry::`call-activity-resolves`_is_not_critical_—_an_outward_call_is_not_a_defect
  Scenario: call-activity-resolves is major
    Given the criterion call-activity-resolves
    When its severity is read
    Then it is major

  @test:schemas/kg-qa.test.ts::tally_and_worstSeverity::totals_cannot_disagree_with_the_criteria_block
  Scenario: Totals are tallied from the criteria
    Given a report with one pass, one fail and one n/a
    When its totals are tallied
    Then they are pass 1, fail 1, n/a 1, unknown 0

  @test:schemas/kg-qa.test.ts::tally_and_worstSeverity::a_clean_report_has_no_severity
  Scenario: A clean report has no severity
    Given a report whose only criterion passes
    When its worst severity is found
    Then there is none

  @test:schemas/kg-qa.test.ts::tally_and_worstSeverity::`unknown`_counts_as_a_failure_—_it_is_never_read_as_a_pass
  Scenario: An unknown result counts as a failure
    Given a report where skill-ref-resolves is unknown
    When its worst severity is found
    Then it is critical

  @test:schemas/kg-qa.test.ts::tally_and_worstSeverity::`unknown`_is_NOT_promoted_past_its_criterion's_own_severity
  Scenario: An unknown result keeps its criterion's severity
    Given a report where role-binds-a-lane is unknown
    When its worst severity is found
    Then it is minor

  @test:schemas/kg-qa.test.ts::tally_and_worstSeverity::the_worst_severity_wins,_not_the_most_frequent
  Scenario: The worst severity wins
    Given a report failing two major criteria and one critical one
    When its worst severity is found
    Then it is critical

  @test:schemas/kg-qa.test.ts::reachability_reads_the_serving_registry,_not_just_manifests::`skill-servable`_is_major_—_a_body_nobody_can_fetch_is_a_real_gap,_not_a_broken_link
  Scenario: skill-servable is major and applies to processes
    Given the criterion skill-servable
    When it is read
    Then its severity is major and it applies only to process

  @test:schemas/kg-qa.test.ts::reachability_reads_the_serving_registry,_not_just_manifests::`manifest-skill-exists`_is_critical_and_scoped_to_the_graph_roll-up
  Scenario: manifest-skill-exists is critical and applies to the graph
    Given the criterion manifest-skill-exists
    When it is read
    Then its severity is critical and it applies only to graph

  @test:schemas/kg-qa.test.ts::reachability_reads_the_serving_registry,_not_just_manifests::every_skill_fetch_local_package_points_at_a_directory_that_exists
  Scenario: Every local skill package points at an existing directory
    Given the skill-fetch local packages
    When their directories are checked
    Then none is missing

  @test:schemas/kg-qa.test.ts::reachability_reads_the_serving_registry,_not_just_manifests::every_directory_holding_`<skill>.md`_that_a_diagram_can_name_is_served
  Scenario: The content-lifecycle and folio-core packages are served
    Given the skill-fetch local packages
    When their names are listed
    Then content-lifecycle and folio-core are among them
    # Gap: the title claims every skill directory a diagram can name is served; only two named packages are checked.

  @test:schemas/kg-qa.test.ts::requirements_are_the_fifth_node_kind_and_only_point::`requirement`_is_a_subject_kind_with_criteria_of_its_own
  Scenario: Requirements have criteria
    Given the subject kind requirement
    When its criteria are listed
    Then there is at least one

  @test:schemas/kg-qa.test.ts::requirements_are_the_fifth_node_kind_and_only_point::a_broken_reference_out_of_a_requirement,_or_INTO_one,_is_critical_like_any_other
  Scenario: Broken references to or from a requirement are critical
    Given the criteria satisfies-resolves, requirement-actors-resolve and requirement-derived-from-resolves
    When their severities are read
    Then each is critical

  @test:schemas/kg-qa.test.ts::requirements_are_the_fifth_node_kind_and_only_point::an_unclaimed_statement_is_minor_coverage,_not_a_broken_reference
  Scenario: An unclaimed statement is minor and satisfiedBy is not a criterion
    Given the criterion requirement-statement-satisfied
    When it is read
    Then its severity is minor
    And there is no criterion requirement-satisfied-by-resolves

  @test:schemas/kg-qa.test.ts::requirements_are_the_fifth_node_kind_and_only_point::an_ungraded_statement_is_major,_not_critical_—_readable,_just_not_testable
  Scenario: An ungraded statement is major
    Given the criterion requirement-statements-graded
    When its severity is read
    Then it is major

  @test:schemas/kg-qa.test.ts::requirements_are_the_fifth_node_kind_and_only_point::every_committed_requirement_resolves_every_reference_it_makes
  Scenario: Every committed requirement's references resolve
    Given the requirements under the harness's skills/requirements and the checkout's actors
    When their derivedFrom, actors and statements are checked
    Then every statement has a conformance grade
    And every derivedFrom and actor resolves, and no statement carries satisfiedBy

  @test:schemas/kg-qa.test.ts::requirements_are_the_fifth_node_kind_and_only_point::`req:agent-workflow`_exists_—_three_requirements_derive_from_it
  Scenario: The agent-workflow requirement exists
    Given the harness's skills/requirements directory
    When agent-workflow.json is looked for
    Then it exists
    # Gap: the title says three requirements derive from it; nothing counts what derives from it.

  @test:schemas/kg-qa.test.ts::KG_SUBJECT_GRAPH_TYPOLOGIES_—_the_bridge_to_the_graph-typology_registry::every_subject_kind_says_which_graph_it_inhabits
  Scenario: Every subject kind names its graph
    Given the KG subject kinds
    When each one's graph typology is looked up
    Then each has one

  @test:schemas/kg-qa.test.ts::KG_SUBJECT_GRAPH_TYPOLOGIES_—_the_bridge_to_the_graph-typology_registry::every_named_graph_is_one_the_registry_knows
  Scenario: Every graph a subject kind names is registered
    Given the subject kinds' graph typologies and the default registry
    When each is looked up in the registry
    Then each is registered

  @test:schemas/kg-qa.test.ts::KG_SUBJECT_GRAPH_TYPOLOGIES_—_the_bridge_to_the_graph-typology_registry::every_criterion's_subject_kinds_resolve_to_a_graph
  Scenario: Every criterion's subject kinds name a graph
    Given each criterion's applicable kinds
    When each kind's graph typology is looked up
    Then each has one

  @test:schemas/kg-qa.test.ts::where_an_instance's_verdicts_live_(kgQaHomeFor)::an_instance_that_declares_a_qa_directory_keeps_its_own
  Scenario: cat-harness keeps its own verdicts
    Given the cat-harness layer of the checkout
    When its KG-QA home is found
    Then it is its own test/results, by "own"

  @test:schemas/kg-qa.test.ts::where_an_instance's_verdicts_live_(kgQaHomeFor)::bootstrap_declares_none,_and_is_hosted_beside_the_host's_own_tree
  Scenario: bootstrap's verdicts are hosted by cat-harness
    Given bootstrap with cat-harness as host
    When its KG-QA home is found
    Then it is cat-harness's test/results/bootstrap, by "hosted"
    And it is not inside cat-harness's own KG-QA results directory

  @test:schemas/kg-qa.test.ts::where_an_instance's_verdicts_live_(kgQaHomeFor)::with_no_host,_an_instance_without_a_qa_directory_falls_back_to_the_convention
  Scenario: Without a host bootstrap falls back to the convention
    Given bootstrap with no host
    When its KG-QA home is found
    Then it is by "convention"

  @test:schemas/kg-qa.test.ts::where_an_instance's_verdicts_live_(kgQaHomeFor)::nothing_audits_bootstrap_inside_bootstrap_any_more
  Scenario: bootstrap holds no test directory
    Given the checkout's bootstrap
    When its test directory is looked for
    Then it does not exist

  @test:schemas/kg-qa.test.ts::where_an_instance's_verdicts_live_(kgQaHomeFor)::every_instance's_home_resolves,_and_bootstrap's_is_the_hosted_one
  Scenario: Every instance's home resolves, bootstrap's among them hosted
    Given every instance root in the checkout, hosted by cat-harness
    When each KG-QA home is found
    Then no lookup throws and the homes include cat-harness's test/results/bootstrap
