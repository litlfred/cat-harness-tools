# Specifies test/fixtures/standalone-checkout/: byte-equal copies of the real
# block-kind, content-adapter and typology nodes, used when cat-harness-tools
# stands alone.
Feature: The standalone fixture copies the real nodes

  @test:schemas/standalone-fixture.test.ts::the_standalone_fixture_copies_the_real_nodes::it_carries_the_paper_vocabulary_and_core's_kinds
  Scenario: The fixture carries the paper vocabulary and the core kinds
    Given the files of the standalone fixture other than its declarations
    When their paths are listed
    Then they include the mathpaper content adapter, 17 block-kind nodes, core's review-verdicts typology and fhir-harness's ig-metadata-index typology

  @test:schemas/standalone-fixture.test.ts::the_standalone_fixture_copies_the_real_nodes::every_copy_is_byte-equal_to_the_file_it_copies
  Scenario: Every fixture copy equals the file it copies
    Given a composed checkout holding every layer the fixture copies from, the test being skipped otherwise
    When each fixture file is compared with the checkout's file at the same path
    Then none is missing or different

  @test:schemas/standalone-fixture.test.ts::the_standalone_fixture_copies_the_real_nodes::every_block-kinds,_content-adapters_and_kinds_node_the_copied_instances_declare_is_copied
  Scenario: Every real block-kind, content-adapter and typology node is copied
    Given a composed checkout holding every layer the fixture copies from, the test being skipped otherwise
    When each .json in those layers' block-kinds, content-adapters and typologies directories is looked up in the fixture
    Then none is missing

  @test:schemas/standalone-fixture.test.ts::the_standalone_fixture_copies_the_real_nodes::the_monorepo_never_scans_the_fixture
  Scenario: In a composed checkout the fixture is not switched on
    Given a composed checkout holding every layer the fixture copies from
    When the environment is read
    Then FOLIO_FIXTURE_CHECKOUT is not set
    # Gap: standing alone the test asserts nothing and passes; and it reads only the environment variable, not whether any scan reads the fixture.
