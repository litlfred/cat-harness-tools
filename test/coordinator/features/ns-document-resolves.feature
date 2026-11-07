# Specifies, by reading the namespace-publishing loop (and bootstrap's copy
# line) in docs-site.yml and feature-staging.yml, that each layer's namespace
# document is published where its terms' IRIs point. The per-workflow tests
# have computed titles and are not tagged here.
Feature: A layer's namespace document is published at the path its terms name

  @test:test/coordinator/ns-document-resolves.test.ts::a_layer's_namespace_document_is_published_where_its_terms_say_it_is::the_two_workflows_agree_with_each_other
  Scenario: The two workflows publish the same layers to the same directories
    Given the layer and directory pairs docs-site.yml and feature-staging.yml publish
    When they are compared
    Then docs-site.yml has at least 3
    And feature-staging.yml has exactly the same pairs

  @test:test/coordinator/ns-document-resolves.test.ts::a_layer's_namespace_document_is_published_where_its_terms_say_it_is::every_layer_with_a_namespace_is_published_by_the_loop
  Scenario: Every layer with a namespace is published
    Given the layer and directory pairs docs-site.yml publishes
    When their layers are collected
    Then bootstrap, harness and core are each published
