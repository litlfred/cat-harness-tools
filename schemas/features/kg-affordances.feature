# Specifies the KG affordances of bean dp1j: browse, materialise, instantiate
# and copy-into-folio, their skills, tools, capabilities, process and the
# KgAsset.source provenance field (schemas/kg/kg-node.ts).
Feature: The KG affordances are written down, wired to tools and capabilities, and stamp provenance

  @test:schemas/kg-affordances.test.ts::bean_dp1j_—_KG_affordances:_browse,_materialise,_instantiate,_copy-into-folio::1._the_four_verbs_are_written_down_in_kg-affordances_and_registered_in_kg-core
  Scenario: The four verbs are written in kg-affordances and registered in kg-core
    Given the kg-core package manifest and the kg-affordances skill
    When they are read
    Then the manifest lists "kg-affordances" and "folio-init", and its skills are sorted
    And the skill names `browse`, `materialise`, `instantiate` and `copy-into-folio`

  @test:schemas/kg-affordances.test.ts::bean_dp1j_—_KG_affordances:_browse,_materialise,_instantiate,_copy-into-folio::2._folio-init_skill_exists_and_the_folio-init_Tool_satisfies_it
  Scenario: The folio-init skill exists and the folio-init Tool satisfies it
    Given the folio-init skill and the folio-init and declaration-resolution tools
    When they are read
    Then the skill is named "folio-init" and mentions "--dry-run"
    And the folio-init tool has id "folio-init" and satisfies "folio-init"
    And the declaration-resolution tool satisfies "kg-affordances"

  @test:schemas/kg-affordances.test.ts::bean_dp1j_—_KG_affordances:_browse,_materialise,_instantiate,_copy-into-folio::3._write_capabilities_exist_and_each_writing_verb_declares_its_capability_requirement_and_degradation
  Scenario: The write capabilities exist and both skills name them
    Given the capabilities git-read, git-push, github-api and github-connector
    When their files are read
    Then each exists with its own id
    And kg-affordances and folio-init each name git-push, github-api and github-connector
    And kg-affordances marks `browse` as needing none and says "zero write capabilities"
    # Gap: the title says each writing verb declares its own requirement and degradation; only that the capability names appear somewhere in each file is checked.

  @test:schemas/kg-affordances.test.ts::bean_dp1j_—_KG_affordances:_browse,_materialise,_instantiate,_copy-into-folio::4._copy-into-folio.bpmn_checks_write_capability,_copies_the_asset,_stamps_KgAsset.source,_and_lets_the_author_edit/comment/raise_todos
  Scenario: copy-into-folio.bpmn holds the expected steps and the roles carry the skill
    Given processes/kg/copy-into-folio.bpmn
    When its text is searched for element ids
    Then it contains the probe, gateway, read-only, read, copy, stamp, validate, work-on-copy and end elements and mentions "KgAsset.source"
    And the author, authoring-agent, corpus and validation-pipeline roles resolve the kg-affordances skill, with their other expected skills
    # Gap: element ids are only searched as text; the sequence flows that would make the process check capability before copying are not checked.

  @test:schemas/kg-affordances.test.ts::bean_dp1j_—_KG_affordances:_browse,_materialise,_instantiate,_copy-into-folio::5._KgAsset.source_stamps_provenance_and_keeps_copied_assets_distinct_from_locally_authored_ones
  Scenario: KgAsset.source records provenance and is absent on local assets
    Given a copied asset whose source names instance, path and ref
    When it is parsed as a KG asset
    Then its source is kept as given
    And a locally authored asset parses with no source
    And an asset source whose instance is not an owner/repo slug is refused
